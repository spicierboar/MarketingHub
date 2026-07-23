// Request a ready-made promo: template defaults for dates/channels/price;
// markup applies; spawns a draft campaign + ai_draft content (never published).
// Over-allowance → billingClass "extra"; included slots consume package quota.

import { logAction } from "@/lib/audit";
import { draftContent } from "@/lib/ai/draft";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { duplicateWarning } from "@/lib/ai/similarity";
import { assertAiBudget } from "@/lib/ai/budget";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import {
  createCampaign,
  createCampaignItem,
  createContent,
  createRequest,
  getCompany,
  getTenant,
  listCampaignItems,
  updateCampaignItem,
  updateCompany,
} from "@/lib/db";
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import {
  promoPeriodKey,
  resolvePromoBillingClass,
} from "@/lib/promo-allowance";
import {
  addDaysIso,
  campaignItemInputsFromOutlines,
  computePromoPricing,
  filterOutlinesForChannels,
  resolvePromoTemplate,
  resolvePromoMarkupPercent,
  templatesForCompany,
} from "@/lib/promo-catalog";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import type {
  ActingUser,
  ClientPromoSelection,
  Company,
  GroundingLabel,
} from "@/lib/types";
import { id, now } from "@/lib/utils";

export function listOpenPromoSelections(company: Company): ClientPromoSelection[] {
  return (company.profile.promoSelections ?? []).filter(
    (s) => s.status === "requested" || s.status === "on_calendar" || s.status === "in_delivery",
  );
}

export function selectionsNotOnCalendar(company: Company): ClientPromoSelection[] {
  return (company.profile.promoSelections ?? []).filter(
    (s) => s.status === "requested",
  );
}

function defaultStartDateIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Client (or agency) requests a catalog promo.
 * Dates / channels / budget default from the template when omitted (automation-first).
 */
export async function requestClientPromo(input: {
  companyId: string;
  user: ActingUser;
  templateId: string;
  startDate?: string;
  endDate?: string;
  budgetUsd?: number;
  channels?: string[];
  notes?: string;
  /** When true (default), kick template posts into ai_draft + quality routing. */
  spawnDrafts?: boolean;
  /** Absolute site origin for client approval deep links. */
  origin?: string;
}): Promise<{
  selection: ClientPromoSelection;
  campaignId: string;
  requestId: string;
  contentIds: string[];
}> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== input.user.tenantId) throw new Error("Access denied");

  const tenant = await getTenant(company.tenantId);
  const agencyCatalog = tenant?.promoCatalog;
  const template = resolvePromoTemplate(input.templateId, agencyCatalog);
  if (!template) throw new Error("Promotion template not found");

  const allowed = new Set(
    templatesForCompany(company, agencyCatalog, tenant?.promoIndustries).map((t) => t.id),
  );
  if (!allowed.has(template.id)) {
    throw new Error("This promotion is not available for your business type.");
  }

  const pkg = resolveCompanyPackage(company, tenant);
  const pkgChannels = new Set(pkg.channels.map((c) => c.toLowerCase()));

  let channels = (input.channels ?? template.defaultChannels)
    .map((c) => c.trim().toLowerCase())
    .filter((c) => template.availableChannels.includes(c));
  if (pkgChannels.size > 0) {
    const overlap = channels.filter((c) => pkgChannels.has(c));
    if (overlap.length > 0) channels = overlap;
  }
  if (channels.length === 0) {
    channels = [...template.defaultChannels];
  }
  if (channels.length === 0) {
    throw new Error("No social channels available for this promotion.");
  }

  const startDate =
    (input.startDate ?? "").slice(0, 10) || defaultStartDateIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error("Start date is required.");
  }
  const endDate =
    (input.endDate ?? "").slice(0, 10) ||
    addDaysIso(startDate, template.defaultDurationDays);
  if (endDate < startDate) throw new Error("End date must be on or after the start date.");

  const clientPriceUsd =
    input.budgetUsd != null && Number.isFinite(Number(input.budgetUsd))
      ? Number(input.budgetUsd)
      : template.suggestedClientPriceUsd;
  if (!Number.isFinite(clientPriceUsd) || clientPriceUsd < 50) {
    throw new Error("Package price must be at least $50.");
  }

  const asOf = now();
  const periodKey = promoPeriodKey(asOf, pkg.promosIncludedPerMonth);
  const billingClass = resolvePromoBillingClass(company, tenant, asOf);

  const markupPercent = resolvePromoMarkupPercent(company, template);
  const pricing = computePromoPricing(clientPriceUsd, markupPercent);
  // Included slots: still record catalog pricing for transparency; fee billed = 0.
  const billedFeeUsd = billingClass === "included" ? 0 : pricing.feeUsd;
  const billedTotalUsd =
    billingClass === "included" ? 0 : pricing.totalUsd;

  const outlines = filterOutlinesForChannels(template, channels);
  const durationDays = Math.max(
    1,
    Math.ceil(
      (new Date(`${endDate}T12:00:00Z`).getTime() -
        new Date(`${startDate}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  const campaignDuration: 30 | 90 = durationDays > 45 ? 90 : 30;

  const campaign = await createCampaign({
    companyId: company.id,
    name: template.name,
    objective: template.objective,
    audience: company.profile.targetCustomers,
    channels,
    durationDays: campaignDuration,
    startDate,
    endDate,
    keyMessage: template.keyMessage,
    status: "draft",
    createdById: input.user.id,
    campaignType: "seasonal",
    description: `Client promo pick · ${template.blurb ?? template.promotion}`,
    budgetAmount: pricing.budgetUsd,
    currency: "AUD",
    priority: "medium",
    layerMeta: {
      source: "client_promo_catalog",
      templateId: template.id,
      markupPercent: pricing.markupPercent,
      feeUsd: pricing.feeUsd,
      totalUsd: pricing.totalUsd,
      billingClass,
      periodKey,
      billedFeeUsd,
      billedTotalUsd,
      assumptions: [
        "Client requested a ready-made promo from the catalog (automation-first).",
        "Dates and channels defaulted from the template; agency may adjust.",
        "Posts are pre-written drafts — never auto-published.",
        billingClass === "included"
          ? "Billed as included in marketing package allowance."
          : "Billed as extra / over-allowance (catalog fee applies).",
      ],
      promotion: template.promotion,
    },
  });

  for (const item of campaignItemInputsFromOutlines(outlines, {
    campaignId: campaign.id,
    companyId: company.id,
    keyMessage: template.keyMessage,
  })) {
    await createCampaignItem(item);
  }

  const ticketNotes = [
    `Client requested ready-made promo: ${template.name}.`,
    `Billing: ${billingClass}${billingClass === "extra" ? ` · expected fee ${formatAud(pricing.totalUsd)} (incl. markup)` : " · package included"}.`,
    `Campaign: ${campaign.id}`,
    `Proposed window: ${startDate} → ${endDate} · channels: ${channels.join(", ")}`,
    input.notes?.trim() ? `Client note: ${input.notes.trim().slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const req = await createRequest({
    companyId: company.id,
    requesterId: input.user.id,
    requestType: "campaign",
    objective: template.objective,
    topic: `Promo: ${template.name}`,
    platform: channels[0],
    preferredDate: startDate,
    urgency: "normal",
    notes: ticketNotes,
    consent: {
      customerNamed: false,
      customerInPhotos: false,
      consentObtained: false,
      mentionsPricing: /\$|\d+\s*%|off|discount/i.test(template.promotion),
      mentionsOffer: true,
      performanceClaims: false,
    },
    uploads: [],
    assignedReviewerId: null,
  });

  const selection: ClientPromoSelection = {
    id: id("promo"),
    templateId: template.id,
    templateName: template.name,
    industry: template.industry,
    status: "requested",
    startDate,
    endDate,
    budgetUsd: pricing.budgetUsd,
    markupPercent: pricing.markupPercent,
    feeUsd: pricing.feeUsd,
    totalUsd: pricing.totalUsd,
    channels,
    campaignId: campaign.id,
    requestId: req.id,
    billingClass,
    periodKey,
    requestedById: input.user.id,
    requestedAt: asOf,
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 500) } : {}),
  };

  const prev = company.profile.promoSelections ?? [];
  await updateCompany(company.id, {
    profile: {
      ...company.profile,
      promoSelections: [selection, ...prev].slice(0, 40),
    },
  });

  await logAction(input.user, "promo.client_requested", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId: company.id,
    detail: `${template.name} · ${billingClass} · catalog $${pricing.totalUsd} (billed $${billedTotalUsd}) · ${channels.join(",")}`,
  });

  let contentIds: string[] = [];
  if (input.spawnDrafts !== false) {
    try {
      contentIds = await spawnPromoDraftContent({
        companyId: company.id,
        campaignId: campaign.id,
        requestId: req.id,
        user: input.user,
        channels,
        origin: input.origin,
      });
    } catch (err) {
      // Ticket + draft campaign still stand; agency can generate later.
      console.error("promo spawnDraftContent", err);
    }
  }

  return {
    selection,
    campaignId: campaign.id,
    requestId: req.id,
    contentIds,
  };
}

function formatAud(n: number): string {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

/**
 * Turn planned campaign items into ai_draft content (pre-written template copy),
 * then quality-route. Never publishes.
 */
async function spawnPromoDraftContent(args: {
  companyId: string;
  campaignId: string;
  requestId: string;
  user: ActingUser;
  channels: string[];
  origin?: string;
}): Promise<string[]> {
  const company = await getCompany(args.companyId);
  if (!company) return [];
  if (company.status !== "ai_ready" && company.status !== "approved") {
    return [];
  }

  const items = await listCampaignItems(args.campaignId);
  const contentIds: string[] = [];
  const platform = args.channels[0] ?? "facebook";

  for (const item of items) {
    if (item.contentId) continue;
    const body = item.brief;
    const compliance = await checkCompliance(body, company);
    const claimAudit = await auditClaims(body, company);
    const groundingLabel: GroundingLabel = claimAudit.some(
      (c) => c.status === "unsupported",
    )
      ? "requires_evidence"
      : "suggested_by_ai";
    const dupWarn = await duplicateWarning(company.id, body);

    const content = await createContent({
      companyId: company.id,
      requestId: args.requestId,
      campaignId: args.campaignId,
      campaignItemId: item.id,
      type: item.contentType || "social_post",
      title: item.title,
      body,
      status: "ai_draft",
      createdById: args.user.id,
      compliance,
      claimAudit,
      groundingLabel,
      brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
      aiModel: "promo-catalog-template",
      aiPrompt: `Client promo · ${item.title}`,
      sourcesUsed: ["promo_catalog", "pipeline:extras_buy"],
      duplicateWarning: dupWarn,
    });

    await updateCampaignItem(item.id, {
      status: "drafted",
      contentId: content.id,
    });
    contentIds.push(content.id);

    await logAction(args.user, "content.ai_drafted", {
      targetType: "content",
      targetId: content.id,
      companyId: company.id,
      detail: `promo catalog · ${item.title}`,
    });

    try {
      await applyQualityRoutingAfterDraft({
        contentId: content.id,
        actor: args.user,
        origin: args.origin?.trim() || "http://localhost:3000",
        platform,
        clientEmail: args.user.email,
      });
    } catch (err) {
      console.error("quality routing after promo draft", err);
    }
  }

  return contentIds;
}

/**
 * Custom (non-catalog) extra work: create Ask ticket and optionally draft AI content.
 * Billing is "quoted by agency" unless a custom_work fee is configured on the package.
 */
export async function requestClientCustomWork(input: {
  companyId: string;
  user: ActingUser;
  topic: string;
  notes: string;
  /** Quoted fee when known; null → agency will quote. */
  expectedFeeAud?: number | null;
  /** Attempt AI draft + quality routing when company is AI-ready. */
  kickAiDraft?: boolean;
  /** Absolute site origin for client approval deep links. */
  origin?: string;
}): Promise<{ requestId: string; contentId?: string }> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== input.user.tenantId) throw new Error("Access denied");

  const topic = input.topic.trim().slice(0, 120) || "Custom work request";
  const notes = input.notes.trim();
  if (!notes) throw new Error("A short description is required.");

  const feeLine =
    input.expectedFeeAud != null && input.expectedFeeAud > 0
      ? `Expected fee: ${formatAud(input.expectedFeeAud)} (extra / custom work).`
      : "Billing: quoted by agency (extra / custom work).";

  const req = await createRequest({
    companyId: company.id,
    requesterId: input.user.id,
    requestType: "creative_request",
    objective: "Custom marketing work requested by client",
    topic,
    urgency: "normal",
    notes: [`[Extra work]`, feeLine, notes].join("\n"),
    consent: {
      customerNamed: false,
      customerInPhotos: false,
      consentObtained: false,
      mentionsPricing: false,
      mentionsOffer: false,
      performanceClaims: false,
    },
    uploads: [],
    assignedReviewerId: null,
  });

  await logAction(input.user, "request.submitted", {
    targetType: "request",
    targetId: req.id,
    companyId: company.id,
    detail: `custom work · ${topic}`,
  });

  if (input.kickAiDraft === false) {
    return { requestId: req.id };
  }

  try {
    const contentId = await draftFromRequestId(req.id, input.user, {
      qualityRoute: true,
      origin: input.origin?.trim() || "client_custom_work",
      clientEmail: input.user.email,
    });
    return { requestId: req.id, contentId };
  } catch (err) {
    console.error("custom work AI draft", err);
    return { requestId: req.id };
  }
}

/** Shared AI draft path for a marketing request (agency Generate + client custom work). */
export async function draftFromRequestId(
  requestId: string,
  user: ActingUser,
  opts?: { qualityRoute?: boolean; origin?: string; clientEmail?: string },
): Promise<string> {
  const { getRequest, listGaps, createGap, advanceRequest } = await import("@/lib/db");
  const { detectGaps } = await import("@/lib/ai/gaps");

  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  if (req.companyId && user.tenantId) {
    const company = await getCompany(req.companyId);
    if (!company || company.tenantId !== user.tenantId) {
      throw new Error("Access denied");
    }
  }
  const company = await getCompany(req.companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error(
      "Company is not AI-ready. Complete onboarding before generating content.",
    );
  }

  const openGaps = await listGaps({ requestId, openOnly: true });
  const existingGaps = await listGaps({ requestId });
  const detected = (await detectGaps(company, req)).filter(
    (d) => !existingGaps.some((g) => g.question === d.question),
  );
  for (const d of detected) {
    await createGap({
      companyId: company.id,
      requestId,
      question: d.question,
      context: d.context,
      blocking: d.blocking,
    });
  }
  const blockingOpen = [
    ...openGaps.filter((g) => g.blocking),
    ...detected.filter((d) => d.blocking),
  ];
  if (blockingOpen.length > 0) {
    await advanceRequest(
      requestId,
      "needs_more_information",
      user.id,
      `AI drafting paused — ${blockingOpen.length} question(s) for the local manager`,
    );
    await logAction(user, "gap.raised", {
      targetType: "request",
      targetId: requestId,
      companyId: company.id,
      detail: blockingOpen.map((g) => g.question).join(" | ").slice(0, 300),
    });
    throw new Error("AI drafting paused — questions for the local manager");
  }

  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);
  await advanceRequest(requestId, "ai_drafting", user.id);

  const managerAnswers = (await listGaps({ requestId }))
    .filter((g) => g.status === "answered" && g.answer)
    .map((g) => ({ question: g.question, answer: g.answer! }));

  const draft = await draftContent({
    company,
    requestType: req.requestType,
    topic: req.topic,
    objective: req.objective,
    platform: req.platform,
    audience: req.targetAudience,
    offer: req.offer,
    callToAction: req.callToAction,
    notes: req.notes,
    managerAnswers,
  });

  const compliance = await checkCompliance(draft.body, company, {
    consent: req.consent,
  });
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
    promptSummary: req.topic.slice(0, 120),
    outputChars: draft.body.length,
    sourcesUsed: draft.sources,
    contextChars: draft.body.length + req.objective.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: req.id,
    type: req.requestType,
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
    aiPrompt: `${req.objective} — ${req.topic}`,
    sourcesUsed: draft.sources,
    duplicateWarning: dupWarn,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  await advanceRequest(requestId, "draft_ready", user.id, `Draft ${content.id} created`);

  await logAction(user, "content.ai_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `${draft.model} · risk ${compliance.riskLevel} · ${groundingLabel}`,
  });

  if (opts?.qualityRoute) {
    try {
      await applyQualityRoutingAfterDraft({
        contentId: content.id,
        actor: user,
        origin: opts.origin ?? "request_ai_draft",
        platform: req.platform || "facebook",
        clientEmail: opts.clientEmail ?? user.email,
      });
    } catch (err) {
      console.error("quality routing after request draft", err);
    }
  }

  return content.id;
}

/** Agency marks a promo as placed on the strategy calendar. */
export async function markPromoOnCalendar(input: {
  companyId: string;
  selectionId: string;
  user: ActingUser;
}): Promise<ClientPromoSelection> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  const list = [...(company.profile.promoSelections ?? [])];
  const idx = list.findIndex((s) => s.id === input.selectionId);
  if (idx < 0) throw new Error("Promo selection not found");
  const updated: ClientPromoSelection = {
    ...list[idx],
    status: "on_calendar",
  };
  list[idx] = updated;
  await updateCompany(company.id, {
    profile: { ...company.profile, promoSelections: list },
  });
  await logAction(input.user, "promo.marked_on_calendar", {
    targetType: "campaign",
    targetId: updated.campaignId ?? updated.id,
    companyId: company.id,
    detail: updated.templateName,
  });
  return updated;
}
