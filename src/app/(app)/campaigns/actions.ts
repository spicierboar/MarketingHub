"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  activeSchedulesForContent,
  advanceRequest,
  createCampaign,
  createCampaignItem,
  createContent,
  getCampaign,
  getCampaignItem,
  getCompany,
  getContent,
  getRequest,
  listCampaignItems,
  listCampaigns,
  listGaps,
  liveOffers,
  maybeCompleteCampaign,
  transitionScheduledPost,
  updateCampaign,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { assertCompanyAccess, assertAdminCompanyAccess, canManageCampaigns } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { generateCampaignPlan } from "@/lib/ai/campaign";
import { executeCampaignBuilder } from "@/lib/campaign-builder";
import { draftContent } from "@/lib/ai/draft";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { assertAiBudget } from "@/lib/ai/budget";
import { duplicateWarning } from "@/lib/ai/similarity";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { now } from "@/lib/utils";
import type { GroundingLabel } from "@/lib/types";
import { headers } from "next/headers";
import { resolveOrigin } from "@/lib/origin";
import { shareCampaignPackForClient } from "@/lib/campaign-client-pack";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

async function buildCampaign(args: {
  userId: string;
  companyId: string;
  name?: string;
  objective: string;
  audience?: string;
  serviceFocus?: string;
  channels: string[];
  durationDays: 30 | 90;
  startDate: string;
  offerId?: string | null;
  eventName?: string;
  eventDate?: string;
  requestId?: string | null;
}) {
  const company = await getCompany(args.companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  await assertAiBudget(company.tenantId);
  await assertAiRateLimit(company.tenantId);

  // Offers must belong to the campaign's company AND be live approved offers
  // (§30) — the server action is the boundary, not the dropdown.
  const validOffer = args.offerId
    ? ((await liveOffers(args.companyId)).find((o) => o.id === args.offerId) ?? null)
    : null;
  if (args.offerId && !validOffer) {
    throw new Error(
      "The selected offer is not a live approved offer for this company.",
    );
  }

  // Local event campaigns: the event must fall inside the plan window —
  // otherwise the sequence would be silently clamped to wrong days.
  if (args.eventName && args.eventDate) {
    const offset =
      Math.round(
        (new Date(args.eventDate).getTime() -
          new Date(args.startDate).getTime()) /
          86_400_000,
      ) + 1;
    if (offset < 1 || offset > args.durationDays) {
      throw new Error(
        `The event date must fall within the ${args.durationDays}-day campaign window starting ${args.startDate}.`,
      );
    }
  }

  const plan = await generateCampaignPlan({
    company,
    objective: args.objective,
    audience: args.audience,
    serviceFocus: args.serviceFocus,
    channels: args.channels,
    durationDays: args.durationDays,
    startDate: args.startDate,
    offer: validOffer,
    eventName: args.eventName,
    eventDate: args.eventDate,
  });

  const campaign = await createCampaign({
    companyId: args.companyId,
    name:
      args.name ||
      `${args.objective.slice(0, 60)} (${args.durationDays}-day)`,
    objective: args.objective,
    audience: args.audience,
    serviceFocus: args.serviceFocus,
    channels: args.channels,
    durationDays: args.durationDays,
    startDate: args.startDate,
    offerId: validOffer?.id ?? null,
    eventName: args.eventName,
    eventDate: args.eventDate,
    keyMessage: plan.keyMessage,
    status: "draft",
    requestId: args.requestId ?? null,
    createdById: args.userId,
    approvedById: null,
    approvedAt: null,
  });

  for (const item of plan.items) {
    await createCampaignItem({
      campaignId: campaign.id,
      companyId: args.companyId,
      dayOffset: item.dayOffset,
      channel: item.channel,
      contentType: item.contentType,
      title: item.title,
      brief: item.brief,
      contentId: null,
      status: "planned",
    });
  }

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId: args.companyId,
    userId: args.userId,
    kind: "campaign_plan",
    model: plan.model,
    promptSummary: args.objective.slice(0, 120),
    outputChars: JSON.stringify(plan.items).length,
    sourcesUsed: [
      "Brand Brain: company profile",
      "Service Catalogue",
      "Local Area Intelligence Profile",
      ...(validOffer ? [`Offer: ${validOffer.name}`] : []),
    ],
    contextChars: args.objective.length + (plan.keyMessage?.length ?? 0),
  });

  return campaign;
}

export async function createCampaignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  if (!canManageCampaigns(user)) {
    throw new Error("You do not have permission to manage campaigns.");
  }

  const objective = text(formData, "objective");
  if (!objective) throw new Error("Objective is required");
  const durationDays = text(formData, "durationDays") === "90" ? 90 : 30;
  const startDate =
    text(formData, "startDate") ||
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const campaign = await buildCampaign({
    userId: user.id,
    companyId,
    name: text(formData, "name") || undefined,
    objective,
    audience: text(formData, "audience") || undefined,
    serviceFocus: text(formData, "serviceFocus") || undefined,
    channels: formData.getAll("channels").map(String).filter(Boolean),
    durationDays,
    startDate,
    offerId: text(formData, "offerId") || null,
    eventName: text(formData, "eventName") || undefined,
    eventDate: text(formData, "eventDate") || undefined,
  });

  await logAction(user, "campaign.created", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId,
    detail: campaign.name,
  });
  redirect(`/campaigns/${campaign.id}`);
}

// Goal-driven campaign builder (W5 M43): plain-language goal → strategy +
// KPIs + calendar plan + governed ai_draft content + draft schedule proposals.
// Human approves before anything is scheduled or published.
export async function createCampaignFromGoalAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  if (!canManageCampaigns(user)) {
    throw new Error("You do not have permission to manage campaigns.");
  }

  const goal = text(formData, "goal");
  if (!goal) throw new Error("Goal is required");

  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  await assertAiBudget(company.tenantId);
  await assertAiRateLimit(company.tenantId);

  const startDate =
    text(formData, "startDate") ||
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const offerId = text(formData, "offerId") || null;
  const validOffer = offerId
    ? ((await liveOffers(companyId)).find((o) => o.id === offerId) ?? null)
    : null;
  if (offerId && !validOffer) {
    throw new Error(
      "The selected offer is not a live approved offer for this company.",
    );
  }

  const channels = formData.getAll("channels").map(String).filter(Boolean);
  const durationDays = text(formData, "durationDays") === "90" ? 90 : 30;

  const exec = await executeCampaignBuilder({
    input: {
      company,
      goal,
      audience: text(formData, "audience") || undefined,
      channels,
      durationDays,
      startDate,
      offer: validOffer,
    },
    userId: user.id,
    audience: text(formData, "audience") || undefined,
    durationDays,
    channels,
    offer: validOffer,
  });

  const { campaign, result, spawnedContentIds } = exec;

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId,
    userId: user.id,
    kind: "campaign_plan",
    model: result.model,
    promptSummary: goal.slice(0, 120),
    outputChars: JSON.stringify(result.items).length + result.strategy.length,
    sourcesUsed: [
      "Brand Brain: company profile",
      "Business profile AI context",
      "Campaign builder: goal interpretation",
      ...(validOffer ? [`Offer: ${validOffer.name}`] : []),
    ],
    contextChars: goal.length + result.strategy.length,
  });

  await logAction(user, "campaign.created_from_goal", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId,
    detail: `${goal.slice(0, 80)} · ${spawnedContentIds.length} draft(s) · ${exec.draftSchedules.length} draft schedule slot(s)`,
  });
  redirect(`/campaigns/${campaign.id}`);
}

// Request-to-campaign conversion: a local manager's support request becomes a
// full campaign plan; the ticket is completed with a link to the campaign.
export async function convertRequestToCampaignAction(requestId: string) {
  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  const user = await assertCompanyAccess(req.companyId);
  if (!canManageCampaigns(user)) {
    throw new Error("You do not have permission to manage campaigns.");
  }

  if ((await listCampaigns(user.tenantId)).some((c) => c.requestId === requestId)) {
    throw new Error("This request has already been converted to a campaign.");
  }
  if (["cancelled", "completed"].includes(req.status)) {
    throw new Error("Closed requests cannot be converted to campaigns.");
  }
  // Requests with open blocking questions must be answered first (§51).
  if ((await listGaps({ requestId, openOnly: true })).some((g) => g.blocking)) {
    throw new Error("Answer the open local-manager questions before converting.");
  }

  const campaign = await buildCampaign({
    userId: user.id,
    companyId: req.companyId,
    name: req.topic.slice(0, 80),
    objective: req.objective,
    audience: req.targetAudience,
    channels: req.platform
      ? req.platform.split(/[+,/]/).map((s) => s.trim()).filter(Boolean)
      : [],
    durationDays: 30,
    startDate: req.preferredDate || now().slice(0, 10),
    offerId: null,
    requestId,
  });

  await advanceRequest(
    requestId,
    "completed",
    user.id,
    `Converted to campaign: ${campaign.name}`,
  );
  await logAction(user, "request.converted_to_campaign", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId: req.companyId,
    detail: req.topic,
  });
  redirect(`/campaigns/${campaign.id}`);
}

export async function submitCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);
  if (campaign.status !== "draft") throw new Error("Only draft campaigns can be submitted.");

  await updateCampaign(campaignId, { status: "pending_approval" });
  await logAction(user, "campaign.submitted_for_approval", {
    targetType: "campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Push drafted campaign content into the client Approvals queue (no publish). */
export async function shareCampaignPackAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);
  const clientEmail = text(formData, "clientEmail") || undefined;
  await shareCampaignPackForClient({
    campaignId,
    user,
    clientEmail,
    origin: await requestOrigin(),
  });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/client/approvals");
  revalidatePath("/approvals");
}

export async function approveCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  // Tenant-pin BEFORE the admin check: an admin of another tenant must not be
  // able to approve this tenant's campaign by id.
  const user = await assertAdminCompanyAccess(campaign.companyId);
  if (campaign.status !== "pending_approval") {
    throw new Error("Only campaigns pending approval can be approved.");
  }

  await updateCampaign(campaignId, {
    status: "approved",
    approvedById: user.id,
    approvedAt: now(),
  });
  await logAction(user, "campaign.approved", {
    targetType: "campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
    detail: campaign.name,
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function cancelCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);
  if (["cancelled", "completed"].includes(campaign.status)) {
    throw new Error("This campaign is already closed.");
  }

  // Cancelling a campaign cancels its items' active schedules too — nothing
  // from a cancelled campaign may stay queued for publishing. Guarded
  // transition: an IN-FLIGHT ("publishing") post can't be blind-overwritten
  // mid-send — demoting its content below "scheduled" (next line) makes the
  // in-flight attempt cancel itself at settle time instead.
  let cancelledPosts = 0;
  for (const item of await listCampaignItems(campaignId)) {
    if (!item.contentId) continue;
    const content = await getContent(item.contentId);
    if (!content) continue;
    for (const s of await activeSchedulesForContent(content.id)) {
      const cancelled = await transitionScheduledPost(user.tenantId, s.id, {
        from: ["scheduled", "failed", "dead"],
        to: "cancelled",
      });
      if (cancelled) cancelledPosts += 1;
    }
    if (content.status === "scheduled") {
      await updateContent(content.id, { status: "approved" });
    }
    if (item.status === "scheduled") {
      await updateCampaignItem(item.id, { status: "approved" });
    }
  }

  await updateCampaign(campaignId, { status: "cancelled" });
  await logAction(user, "campaign.cancelled", {
    targetType: "campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
    detail: cancelledPosts ? `${cancelledPosts} scheduled post(s) cancelled` : undefined,
  });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/calendar");
}

// Draft one campaign item through the full governed content pipeline.
export async function generateItemDraftAction(itemId: string) {
  const item = await getCampaignItem(itemId);
  if (!item) throw new Error("Campaign item not found");
  const campaign = await getCampaign(item.campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);
  const company = (await getCompany(campaign.companyId))!;

  // Content is only produced for approved campaigns (§26 review-then-produce).
  if (campaign.status !== "approved") {
    throw new Error("The campaign must be approved before drafting its content.");
  }
  if (item.status !== "planned") {
    throw new Error("Only planned items can be drafted.");
  }
  await assertAiBudget(company.tenantId);
  await assertAiRateLimit(company.tenantId);

  // Re-check the offer is STILL live at draft time (it may have expired or
  // been archived since the campaign was approved), and that this item's
  // channel is within the offer's approved channels (§30).
  const offer = campaign.offerId
    ? (await liveOffers(campaign.companyId)).find((o) => o.id === campaign.offerId)
    : undefined;
  const offerUsable =
    offer &&
    (offer.channelsAllowed.length === 0 ||
      offer.channelsAllowed.some(
        (c) => c.toLowerCase() === item.channel.toLowerCase(),
      ));

  const draft = await draftContent({
    company,
    requestType: item.contentType,
    topic: item.title,
    objective: item.brief,
    platform: item.channel,
    audience: campaign.audience,
    offer: offerUsable ? offer.approvedWording : undefined,
    notes: `Part of campaign "${campaign.name}" (day ${item.dayOffset}). Key message: ${campaign.keyMessage ?? campaign.objective}${campaign.offerId && !offer ? " NOTE: the campaign's offer is no longer live — do not mention it." : ""}`,
  });

  const compliance = await checkCompliance(draft.body, company);
  const claimAudit = await auditClaims(draft.body, company);
  const groundingLabel: GroundingLabel = claimAudit.some(
    (c) => c.status === "unsupported",
  )
    ? "requires_evidence"
    : draft.sourceRefs.length > 0
      ? "grounded"
      : "suggested_by_ai";

  const dupWarn = await duplicateWarning(company.id, draft.body);
  const aiRun = await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "content_draft",
    model: draft.model,
    promptSummary: item.title.slice(0, 120),
    outputChars: draft.body.length,
    sourcesUsed: draft.sources,
    contextChars: draft.body.length + item.brief.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: campaign.requestId ?? null,
    campaignId: campaign.id,
    campaignItemId: item.id,
    type: item.contentType,
    title: draft.title,
    body: draft.body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    groundingLabel,
    sourceRefs: draft.sourceRefs,
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: draft.model,
    aiPrompt: `${item.brief} — ${item.title}`,
    sourcesUsed: draft.sources,
    duplicateWarning: dupWarn,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  await updateCampaignItem(itemId, { status: "drafted", contentId: content.id });

  await logAction(user, "content.ai_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `Campaign item ${item.title} · ${draft.model} · risk ${compliance.riskLevel}`,
  });

  redirect(`/content/${content.id}`);
}

export async function skipItemAction(formData: FormData) {
  const itemId = text(formData, "itemId");
  const item = await getCampaignItem(itemId);
  if (!item) throw new Error("Campaign item not found");
  const user = await assertCompanyAccess(item.companyId);
  if (item.status !== "planned") {
    throw new Error("Only planned items can be skipped.");
  }

  await updateCampaignItem(itemId, { status: "skipped" });
  if (await maybeCompleteCampaign(item.campaignId)) {
    await logAction(user, "campaign.completed", {
      targetType: "campaign",
      targetId: item.campaignId,
      companyId: item.companyId,
      detail: "All items approved or skipped",
    });
  }
  await logAction(user, "campaign.item_skipped", {
    targetType: "campaign_item",
    targetId: itemId,
    companyId: item.companyId,
    detail: item.title,
  });
  revalidatePath(`/campaigns/${item.campaignId}`);
}
