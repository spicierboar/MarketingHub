"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  cancellableSchedulesForContent,
  activeSchedulesForContent,
  addContentComment,
  advanceRequest,
  createContent,
  getAsset,
  getCompany,
  getContent,
  getRequest,
  getTenant,
  isUnderLegalHold,
  listContent,
  maybeCompleteCampaign,
  revertCampaignItemAfterDemotion,
  transitionScheduledPost,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { assetChannelBlockReason } from "@/lib/assets";
import {
  assertAdminCompanyAccess,
  assertCompanyAccess,
  canAccessCompany,
  requireUser,
  requireAdmin,
  userHasPermission,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { signPayload } from "@/lib/token";
import { resolveOrigin } from "@/lib/origin";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { draftContent } from "@/lib/ai/draft";
import { assertAiBudget } from "@/lib/ai/budget";
import { duplicateWarning } from "@/lib/ai/similarity";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { canApproveRoute, ROUTE_LABEL, routeContent } from "@/lib/routing";
import { governContent } from "@/lib/content-governance";
import {
  applyQualityRoutingAfterDraft,
  submitHeldContentToClient,
} from "@/lib/managed-service/quality-routing";
import { progressManagedSchedulesForCompany } from "@/lib/managed-service/auto-progress";
import { generateVoice, type VoiceStyle } from "@/lib/ai/voicegen";
import { generateImage } from "@/lib/ai/imagegen";
import { generateVideo } from "@/lib/ai/videogen";
import { persistGeneratedAsset } from "@/lib/visuals";
import { assertVisualsGeneration } from "@/lib/visuals-allowance";
import { resolveContentCreateTarget } from "@/lib/content-create-scope";
import { now } from "@/lib/utils";
import type { DraftTone, GroundingLabel, RequestType } from "@/lib/types";

// §54 — content (or its company) under an active legal hold must not be
// overwritten. Guards every mutation path.
async function assertNotOnHold(content: { id: string; companyId: string }): Promise<void> {
  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is under legal hold and cannot be modified.");
  }
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

// T6 — share a pending content item for tokenised no-login CLIENT approval.
// Admin-only, tenant-pinned. Mints a signed, expiring token bound to
// tenant+company+content, stores the link for the admin to copy, and emails
// the client (env-gated; a no-op returns the link so the demo still works).
export async function shareForClientApprovalAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const email = String(formData.get("clientEmail") || "").trim().toLowerCase();
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertAdminCompanyAccess(content.companyId);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid client email is required.");
  }
  // Only submitted, in-queue content can be sent for client sign-off.
  if (content.status !== "pending_approval") {
    throw new Error("Submit the content for approval first, then share it with the client.");
  }
  const company = (await getCompany(content.companyId))!;
  const tenant = await getTenant(user.tenantId);

  const issuedAt = Date.now();
  const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const token = signPayload(
    {
      tenantId: user.tenantId,
      companyId: content.companyId,
      contentId: content.id,
      clientEmail: email,
      purpose: "client_approval",
    },
    { issuedAt, ttlMs },
  );
  const link = `${await requestOrigin()}/approve/${token}`;

  await updateContent(contentId, {
    clientReview: {
      email,
      sharedById: user.id,
      sharedAt: now(),
      expiresAt: new Date(issuedAt + ttlMs).toISOString(),
      link,
      status: "pending",
    },
  });
  await sendEmail({
    to: email,
    fromName: tenant?.branding?.emailFromName,
    subject: `Please review: ${content.title}`,
    html: `<p>${company.name} has content ready for your approval.</p>
           <p><a href="${link}">Review &amp; approve →</a></p>
           <p style="color:#888">This secure link expires in 7 days. No account needed.</p>`,
  });
  await logAction(user, "content.client_link_shared", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: `Shared with ${email}`,
  });
  revalidatePath(`/content/${contentId}`);
}

// Collaborative comment from an internal team member (tenant-pinned).
export async function addContentCommentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const body = String(formData.get("body") || "").trim();
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  if (!body) return;
  await addContentComment({
    contentId,
    companyId: content.companyId,
    authorId: user.id,
    authorName: user.name,
    authorKind: "member",
    body: body.slice(0, 2000),
  });
  await logAction(user, "content.comment_added", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
  });
  revalidatePath(`/content/${contentId}`);
}

export async function saveContentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const body = String(formData.get("body") || "");
  const title = String(formData.get("title") || "").trim();
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  // Archived, rejected and published content is terminal — editing it would
  // re-open the submit path (or silently change something already live).
  if (["archived", "rejected", "published"].includes(content.status)) {
    throw new Error(
      "Archived, rejected or published content cannot be edited — repurpose it instead.",
    );
  }

  content.versions.push({
    body: content.body,
    editedById: user.id,
    editedAt: now(),
    note: "Previous version",
  });

  // Editing approved or scheduled content sends it back for re-approval
  // (master prompt §25), clears the old approval provenance — the prior
  // approver never saw the new body — and cancels any pending schedules.
  const wasApproved =
    content.status === "approved" || content.status === "scheduled";
  if (content.status === "scheduled") {
    // Cancel pending, failed AND dead posts — a stale post must not remain
    // retryable/requeueable against a body the approver never saw. Guarded
    // transition: an IN-FLIGHT ("publishing") post can't be blind-overwritten
    // mid-send — the demotion below "scheduled" (next update) makes its
    // attempt cancel itself at settle time instead.
    for (const s of await cancellableSchedulesForContent(content.id)) {
      await transitionScheduledPost(user.tenantId, s.id, {
        from: ["scheduled", "failed", "dead"],
        to: "cancelled",
      });
    }
    await logAction(user, "content.schedule_cancelled", {
      targetType: "content",
      targetId: contentId,
      companyId: content.companyId,
      detail: "Scheduled content edited — schedules cancelled pending re-approval",
    });
  }
  await updateContent(contentId, {
    body,
    title: title || content.title,
    status: wasApproved ? "pending_approval" : "user_edited",
    ...(wasApproved ? { approvedById: null, approvedAt: null } : {}),
    // Editing invalidates any prior client sign-off — a fresh share is required
    // so a stale token can never approve a body the client never saw (T6).
    ...(content.clientReview ? { clientReview: undefined } : {}),
    ...(await governContent(content, body)),
  });
  // Demotion propagates to the linked campaign item (and re-opens the campaign).
  if (wasApproved && content.campaignItemId) {
    if (await revertCampaignItemAfterDemotion(content.campaignItemId)) {
      await logAction(user, "campaign.item_reverted", {
        targetType: "campaign_item",
        targetId: content.campaignItemId,
        companyId: content.companyId,
        detail: "Approved content edited — back to review",
      });
    }
  }

  await logAction(user, "content.edited", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
  });
  revalidatePath(`/content/${contentId}`);
}

export async function submitForApprovalAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  // Only editable drafts may be submitted — the server action is the boundary.
  if (!["ai_draft", "user_edited", "changes_required"].includes(content.status)) {
    throw new Error("Only editable drafts can be submitted for approval.");
  }

  // Quality gate → service-level routing (auto client vs agency hold).
  const routed = await applyQualityRoutingAfterDraft({
    contentId,
    actor: user,
    origin: await requestOrigin(),
  });

  if (content.requestId) await advanceRequest(content.requestId, "pending_approval", user.id);

  await logAction(user, "content.submitted_for_approval", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: `${routed.gate} → ${routed.decision} · ${ROUTE_LABEL[routed.content.routedTo ?? "admin"]}`,
  });
  revalidatePath(`/content/${contentId}`);
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

export async function submitHeldToClientAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const email = String(formData.get("clientEmail") || "").trim() || undefined;
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertAdminCompanyAccess(content.companyId);
  await submitHeldContentToClient({
    contentId,
    actor: user,
    origin: await requestOrigin(),
    clientEmail: email,
  });
  revalidatePath(`/content/${contentId}`);
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath("/client/approvals");
}

export async function approveContentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await requireUser();
  if (!userHasPermission(user, "approve_content")) {
    throw new Error("Only approvers can approve content");
  }
  // Tenant pin: an approver may only act on content within their own tenant.
  if (!(await canAccessCompany(user, content.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await assertNotOnHold(content);

  // Only submitted content can be approved — un-submitted drafts have no
  // routing and must go through submitForApprovalAction first.
  if (content.status !== "pending_approval") {
    throw new Error("Only content pending approval can be approved.");
  }

  // Re-run governance at approval time: routing and compliance must reflect
  // the CURRENT state of the Claims Library, Evidence Locker and Consent
  // Register, not the snapshot taken at submission.
  const governed = await governContent(content, content.body);
  if (!canApproveRoute(user, governed.routedTo)) {
    throw new Error(
      `This item is routed to "${ROUTE_LABEL[governed.routedTo]}" and requires a more senior approver.`,
    );
  }
  if (!governed.compliance.canProceed) {
    throw new Error("Critical compliance issues must be resolved before approval.");
  }

  await updateContent(contentId, {
    ...governed,
    status: "approved",
    approvedById: user.id,
    approvedAt: now(),
  });
  if (content.requestId) await advanceRequest(content.requestId, "approved", user.id);
  // Campaign items track their content's approval individually (Phase 4);
  // an approved campaign completes once all items are approved/skipped.
  if (content.campaignItemId) {
    await updateCampaignItem(content.campaignItemId, { status: "approved" });
    if (content.campaignId && (await maybeCompleteCampaign(content.campaignId))) {
      await logAction(user, "campaign.completed", {
        targetType: "campaign",
        targetId: content.campaignId,
        companyId: content.companyId,
        detail: "All items approved or skipped",
      });
    }
  }
  // Draft comparison (§24): approving one variant archives its siblings so
  // only the chosen version moves forward.
  if (content.variantGroupId) {
    for (const sibling of await listContent(user.tenantId)) {
      if (
        sibling.variantGroupId === content.variantGroupId &&
        sibling.id !== content.id &&
        !["approved", "published", "archived"].includes(sibling.status)
      ) {
        await updateContent(sibling.id, { status: "archived" });
        await logAction(user, "content.variant_archived", {
          targetType: "content",
          targetId: sibling.id,
          companyId: sibling.companyId,
          detail: `Sibling of approved variant ${content.id}`,
        });
      }
    }
  }

  await logAction(user, "content.approved", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: ROUTE_LABEL[governed.routedTo],
  });

  // Managed levels: after staff approve, try critique-gated scheduleOne for
  // assist/campaign planned dates so approved work is not left orphaned.
  try {
    await progressManagedSchedulesForCompany(user, content.companyId);
  } catch {
    /* best-effort — cron tick will retry */
  }

  revalidatePath(`/content/${contentId}`);
  revalidatePath("/approvals");
}

export async function rejectContentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const note = String(formData.get("note") || "").trim();
  const changesOnly = formData.get("changesOnly") === "on";
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await requireUser();
  if (!userHasPermission(user, "approve_content")) {
    throw new Error("Only approvers can reject content");
  }
  // Tenant pin: an approver may only act on content within their own tenant.
  if (!(await canAccessCompany(user, content.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await assertNotOnHold(content);
  // Symmetric with approval: only pending content can be rejected. A stale
  // tab can no longer reject content that was approved and scheduled since.
  if (content.status !== "pending_approval") {
    throw new Error("Only content pending approval can be rejected.");
  }

  await updateContent(contentId, {
    status: changesOnly ? "changes_required" : "rejected",
    // A rejected/returned item carries no approval provenance.
    approvedById: null,
    approvedAt: null,
  });
  if (content.requestId) {
    await advanceRequest(
      content.requestId,
      changesOnly ? "changes_required" : "cancelled",
      user.id,
      note,
    );
  }

  await logAction(user, changesOnly ? "content.changes_required" : "content.rejected", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: note,
  });
  revalidatePath(`/content/${contentId}`);
  revalidatePath("/approvals");
}

// ---- Phase 5: Reuse Library, repurposing, version restore -------------------------

// Admin sets reuse permissions + review/expiry dates on approved content (§45).
export async function saveReuseAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await requireAdmin();
  // Tenant pin: an admin may only set reuse policy for content in their tenant.
  if (!(await canAccessCompany(user, content.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }

  await updateContent(contentId, {
    reusePermitted: formData.get("reusePermitted") === "on",
    reuseChannels: String(formData.get("reuseChannels") || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
    reviewDate: String(formData.get("reviewDate") || "") || undefined,
    expiryDate: String(formData.get("expiryDate") || "") || undefined,
  });
  await logAction(user, "content.reuse_settings_saved", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
  });
  revalidatePath(`/content/${contentId}`);
  revalidatePath("/library");
}

// Repurpose approved content into a new type/channel (§45). Blocked for
// expired content or content whose reuse is not permitted.
export async function repurposeContentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const targetType = String(formData.get("targetType") || "") as RequestType;
  const source = await getContent(contentId);
  if (!source) throw new Error("Content not found");
  const user = await assertCompanyAccess(source.companyId);
  const company = (await getCompany(source.companyId))!;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  if (!["approved", "published"].includes(source.status)) {
    throw new Error("Only approved or published content can be repurposed.");
  }
  // Default-deny: reuse must be explicitly permitted by an admin (§45).
  if (source.reusePermitted !== true) {
    throw new Error(
      "Reuse of this content has not been enabled — an admin must permit it in Reuse settings.",
    );
  }
  const today = now().slice(0, 10);
  if (source.expiryDate && source.expiryDate < today) {
    throw new Error(
      `This content expired on ${source.expiryDate} — it must be reviewed before reuse.`,
    );
  }

  const draft = await draftContent({
    company,
    requestType: targetType,
    topic: source.title.replace(/^[^—]+— /, ""),
    objective: `Repurpose the following approved content as a ${targetType.replace(/_/g, " ")}, keeping its meaning and claims exactly:\n\n${source.body.slice(0, 1200)}`,
  });

  const compliance = await checkCompliance(draft.body, company);
  const claimAudit = await auditClaims(draft.body, company);
  const groundingLabel: GroundingLabel = claimAudit.some(
    (c) => c.status === "unsupported",
  )
    ? "requires_evidence"
    : "grounded"; // grounded in the approved source by construction

  const dupWarn = await duplicateWarning(company.id, draft.body);
  const aiRun = await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "content_draft",
    model: draft.model,
    promptSummary: `Repurpose: ${source.title}`.slice(0, 120),
    outputChars: draft.body.length,
    sourcesUsed: [`Approved content: ${source.title}`],
    contextChars: draft.body.length + source.body.length,
  });

  const created = await createContent({
    companyId: company.id,
    requestId: null,
    type: targetType,
    title: draft.title,
    body: draft.body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    groundingLabel,
    sourceRefs: [
      {
        sourceId: source.id,
        title: `Approved content: ${source.title}`,
        snippet: source.body.slice(0, 200),
      },
      ...draft.sourceRefs,
    ],
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: draft.model,
    aiPrompt: `Repurpose → ${targetType}`,
    sourcesUsed: [`Approved content: ${source.title}`, ...draft.sources],
    repurposedFromId: source.id,
    duplicateWarning: dupWarn,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  await logAction(user, "content.repurposed", {
    targetType: "content",
    targetId: created.id,
    companyId: company.id,
    detail: `from ${source.id} → ${targetType}`,
  });
  redirect(`/content/${created.id}`);
}

// Restore a prior version from the content's version history (§24/§25).
export async function restoreVersionAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const versionIndex = Number(formData.get("versionIndex"));
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  // Terminal statuses stay terminal — restoring would resurrect archived
  // variants, rejected content, or already-published posts.
  if (["archived", "rejected", "published"].includes(content.status)) {
    throw new Error(
      "Archived, rejected or published content cannot be restored — repurpose it instead.",
    );
  }
  const version = content.versions[versionIndex];
  if (!version) throw new Error("Version not found");

  content.versions.push({
    body: content.body,
    editedById: user.id,
    editedAt: now(),
    note: `Before restoring version ${versionIndex + 1}`,
  });
  const wasApproved =
    content.status === "approved" || content.status === "scheduled";
  if (content.status === "scheduled") {
    // Guarded transition (see saveContentAction) — in-flight posts self-cancel
    // at settle time once the content drops below "scheduled".
    for (const s of await cancellableSchedulesForContent(content.id)) {
      await transitionScheduledPost(user.tenantId, s.id, {
        from: ["scheduled", "failed", "dead"],
        to: "cancelled",
      });
    }
    await logAction(user, "content.schedule_cancelled", {
      targetType: "content",
      targetId: contentId,
      companyId: content.companyId,
      detail: "Version restored — schedules cancelled pending re-approval",
    });
  }
  await updateContent(contentId, {
    body: version.body,
    status: wasApproved ? "pending_approval" : "user_edited",
    ...(wasApproved ? { approvedById: null, approvedAt: null } : {}),
    // Restoring a different body invalidates any prior client sign-off (T6).
    ...(content.clientReview ? { clientReview: undefined } : {}),
    ...(await governContent(content, version.body)),
  });
  if (wasApproved && content.campaignItemId) {
    if (await revertCampaignItemAfterDemotion(content.campaignItemId)) {
      await logAction(user, "campaign.item_reverted", {
        targetType: "campaign_item",
        targetId: content.campaignItemId,
        companyId: content.companyId,
        detail: "Approved content restored to prior version — back to review",
      });
    }
  }
  await logAction(user, "content.version_restored", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: `Restored version ${versionIndex + 1}`,
  });
  revalidatePath(`/content/${contentId}`);
}

// ---- Phase 11: reference approved creative assets ---------------------------------

// Attach an approved asset to a content item (§46). Only approved assets of the
// same company may be referenced. If the content is already scheduled, the asset
// must permit every scheduled platform — otherwise the reference would strand a
// post that can never legally publish.
export async function attachAssetAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const assetId = String(formData.get("assetId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  if (["archived", "rejected", "published"].includes(content.status)) {
    throw new Error("Assets cannot be attached to terminal content.");
  }
  const asset = await getAsset(assetId);
  if (!asset || asset.companyId !== content.companyId) {
    throw new Error("Asset not found for this company.");
  }
  if (asset.status !== "approved") {
    throw new Error("Only approved assets can be referenced by content.");
  }
  // Guard against stranding an already-scheduled post on a channel the asset
  // doesn't permit.
  for (const s of await activeSchedulesForContent(content.id)) {
    const reason = await assetChannelBlockReason(asset, s.platform);
    if (reason) {
      throw new Error(
        `"${asset.name}" can't be used on the already-scheduled ${s.platform} post — ${reason}.`,
      );
    }
  }
  const assetIds = content.assetIds ?? [];
  if (assetIds.includes(assetId)) return; // idempotent
  await updateContent(contentId, { assetIds: [...assetIds, assetId] });
  await logAction(user, "content.asset_attached", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: asset.name,
  });
  revalidatePath(`/content/${contentId}`);
}

export async function detachAssetAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const assetId = String(formData.get("assetId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  if (["archived", "rejected", "published"].includes(content.status)) {
    throw new Error("Assets cannot be changed on terminal content.");
  }
  await updateContent(contentId, {
    assetIds: (content.assetIds ?? []).filter((a) => a !== assetId),
  });
  await logAction(user, "content.asset_detached", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
    detail: assetId,
  });
  revalidatePath(`/content/${contentId}`);
}

export async function recheckComplianceAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);
  await assertNotOnHold(content);
  await updateContent(contentId, await governContent(content, content.body));
  await logAction(user, "content.compliance_checked", {
    targetType: "content",
    targetId: contentId,
    companyId: content.companyId,
  });
  revalidatePath(`/content/${contentId}`);
}

const VOICE_STYLES: VoiceStyle[] = ["warm", "professional", "energetic", "calm"];

function textFd(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function resolveHubTarget(formData: FormData) {
  const user = await requireUser();
  const target = await resolveContentCreateTarget(formData, user, {
    assertCompanyAccess,
    getCompany,
  });
  // Re-assert access on the resolved company (client or shelf).
  await assertCompanyAccess(target.company.id);
  return { user, target };
}

/**
 * /content Create — AI copy (any type). Lands in Library as ai_draft.
 * Supports client · industry · general (industry/general need zero clients).
 */
export async function hubGenerateContentAction(formData: FormData) {
  const { user, target } = await resolveHubTarget(formData);
  const { company, generationCompany, scopeTag, displayLabel } = target;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const contentType = (textFd(formData, "contentType") || "social_post") as RequestType;
  const topic = textFd(formData, "topic");
  const objective = textFd(formData, "objective");
  if (!topic || !objective) throw new Error("Topic and objective are required");
  const channel = textFd(formData, "channel") || undefined;
  const tone = (textFd(formData, "tone") || "brand_default") as DraftTone;

  const draft = await draftContent({
    company: generationCompany,
    requestType: contentType,
    topic,
    objective,
    platform: channel,
    tone,
  });
  const compliance = await checkCompliance(draft.body, generationCompany);
  const claimAudit = await auditClaims(draft.body, generationCompany);
  const groundingLabel: GroundingLabel = claimAudit.some((c) => c.status === "unsupported")
    ? "requires_evidence"
    : draft.sourceRefs.length > 0
      ? "grounded"
      : "suggested_by_ai";
  const routedTo = routeContent({ type: contentType, compliance, claimAudit });

  const sourcesUsed = [
    ...draft.sources,
    scopeTag,
    `Content hub: AI Content · ${displayLabel}`,
  ];
  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "content_draft",
    model: draft.model,
    promptSummary: `${topic} [${displayLabel}]`.slice(0, 120),
    outputChars: draft.body.length,
    sourcesUsed,
    contextChars: draft.body.length + objective.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: null,
    type: contentType,
    title: draft.title,
    body: draft.body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    routedTo,
    groundingLabel,
    sourceRefs: draft.sourceRefs,
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: draft.model,
    aiPrompt: `${objective} — ${topic}`,
    sourcesUsed,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  await logAction(user, "content.ai_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `Hub · ${contentType} · ${displayLabel} · risk ${compliance.riskLevel}`,
  });

  revalidatePath("/content");
  redirect(`/content/${content.id}`);
}

/**
 * /content Create — AI image → DAM asset + Library content row.
 */
export async function hubGenerateImageAction(formData: FormData) {
  const { user, target } = await resolveHubTarget(formData);
  const { company, generationCompany, scopeTag, displayLabel } = target;
  const tenant = await getTenant(user.tenantId);
  await assertVisualsGeneration(company, "image", 1, tenant);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const topic = textFd(formData, "topic");
  const objective = textFd(formData, "objective");
  if (!topic || !objective) throw new Error("Topic and prompt are required");
  const channel = textFd(formData, "channel") || undefined;
  const format = textFd(formData, "format") as "square" | "vertical" | "landscape" | "";

  const result = await generateImage({
    company: generationCompany,
    topic,
    objective,
    channel,
    format: format || "square",
  });

  const body = [
    `AI image for ${displayLabel}.`,
    "",
    `Topic: ${topic}`,
    `Brief: ${objective}`,
    channel ? `Channel: ${channel}` : null,
    "",
    result.description,
    "",
    "Creative asset is attached — review the image in Creative Assets, then approve this Library item when ready.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const compliance = await checkCompliance(body, generationCompany);
  const claimAudit = await auditClaims(body, generationCompany);
  const routedTo = routeContent({
    type: "creative_request",
    compliance,
    claimAudit,
  });
  const sourcesUsed = [
    scopeTag,
    "Brand Brain: company profile",
    "Content hub: AI Image Gen",
  ];

  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "image_gen",
    model: result.model,
    promptSummary: result.prompt.slice(0, 120),
    outputChars: result.bytes.length,
    sourcesUsed,
    contextChars: result.prompt.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: null,
    type: "creative_request",
    title: result.name,
    body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    routedTo,
    groundingLabel: "suggested_by_ai",
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: result.model,
    aiPrompt: result.prompt,
    sourcesUsed,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  const asset = await persistGeneratedAsset({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    name: result.name,
    description: result.description,
    assetType: "image",
    mimeType: result.mimeType,
    bytes: result.bytes,
    channels: channel ? [channel] : [],
    targetContentId: content.id,
    aiModel: result.model,
    aiPrompt: result.prompt,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
    sourcesUsed,
  });
  await updateContent(content.id, { assetIds: [asset.id] });

  await logAction(user, "visuals.image_generated", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `${topic} · asset ${asset.id} · ${displayLabel}`,
  });

  revalidatePath("/content");
  revalidatePath("/assets");
  redirect(`/content/${content.id}`);
}

/**
 * /content Create — AI video or Reels → DAM + Library.
 * Pass kind=reel for vertical Reels/Shorts labelling.
 */
export async function hubGenerateVideoAction(formData: FormData) {
  const { user, target } = await resolveHubTarget(formData);
  const { company, generationCompany, scopeTag, displayLabel } = target;
  const tenant = await getTenant(user.tenantId);
  await assertVisualsGeneration(company, "video", 1, tenant);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId, 2);

  const isReel = textFd(formData, "kind") === "reel";
  const topic = textFd(formData, "topic");
  const script = textFd(formData, "script");
  if (!topic || !script) throw new Error("Topic and script are required");
  const channel =
    textFd(formData, "channel") ||
    (isReel ? "instagram" : undefined);

  const result = await generateVideo({
    company: generationCompany,
    topic,
    script,
    channel,
  });

  const kindLabel = isReel ? "AI Reel" : "AI Video";
  const body = [
    `${kindLabel} for ${displayLabel}.`,
    "",
    `Topic: ${topic}`,
    channel ? `Channel: ${channel}` : null,
    "",
    "Script:",
    script,
    "",
    result.description,
    "",
    "Video asset is attached — review then approve this Library item when ready.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const compliance = await checkCompliance(body, generationCompany);
  const claimAudit = await auditClaims(body, generationCompany);
  const routedTo = routeContent({
    type: "video_script",
    compliance,
    claimAudit,
  });
  const sourcesUsed = [
    scopeTag,
    "Brand Brain: company profile",
    `Content hub: ${kindLabel}`,
    ...(isReel ? ["format:reel"] : []),
  ];

  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "video_gen",
    model: result.model,
    promptSummary: result.prompt.slice(0, 120),
    outputChars: result.bytes.length,
    sourcesUsed,
    contextChars: result.prompt.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: null,
    type: "video_script",
    title: isReel
      ? `AI Reel — ${topic}`.slice(0, 120)
      : result.name,
    body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    routedTo,
    groundingLabel: "suggested_by_ai",
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: result.model,
    aiPrompt: result.prompt,
    sourcesUsed,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  const asset = await persistGeneratedAsset({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    name: isReel ? `AI Reel — ${topic}`.slice(0, 120) : result.name,
    description: result.description,
    assetType: "video",
    mimeType: result.mimeType,
    bytes: result.bytes,
    channels: channel ? [channel] : [],
    targetContentId: content.id,
    aiModel: result.model,
    aiPrompt: result.prompt,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
    sourcesUsed,
  });
  await updateContent(content.id, { assetIds: [asset.id] });

  await logAction(user, "visuals.video_generated", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `${kindLabel} · ${topic} · asset ${asset.id} · ${displayLabel}`,
  });

  revalidatePath("/content");
  revalidatePath("/assets");
  redirect(`/content/${content.id}`);
}

/** Content hub — voiceover script draft + placeholder audio → Library. */
export async function generateAiVoiceAction(formData: FormData) {
  const { user, target } = await resolveHubTarget(formData);
  const { company, generationCompany, scopeTag, displayLabel } = target;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const script = textFd(formData, "script");
  if (!script) throw new Error("A voiceover script is required");
  const topic = textFd(formData, "topic") || undefined;
  const rawStyle = textFd(formData, "voiceStyle") || "warm";
  const voiceStyle = (VOICE_STYLES.includes(rawStyle as VoiceStyle)
    ? rawStyle
    : "warm") as VoiceStyle;

  const result = await generateVoice({
    company: generationCompany,
    script,
    voiceStyle,
    topic,
  });

  const compliance = await checkCompliance(result.scriptBody, generationCompany);
  const claimAudit = await auditClaims(result.scriptBody, generationCompany);
  const routedTo = routeContent({
    type: "video_script",
    compliance,
    claimAudit,
  });
  const sourcesUsed = [
    scopeTag,
    "Brand Brain: company profile",
    "Content hub: AI Voice Gen",
  ];

  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "voice_gen",
    model: result.model,
    promptSummary: result.prompt.slice(0, 120),
    outputChars: result.scriptBody.length + result.bytes.length,
    sourcesUsed,
    contextChars: result.prompt.length + script.length,
  });

  const content = await createContent({
    companyId: company.id,
    requestId: null,
    type: "video_script",
    title: result.name,
    body: result.scriptBody,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    routedTo,
    groundingLabel: "suggested_by_ai",
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: result.model,
    aiPrompt: result.prompt,
    sourcesUsed,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });

  const asset = await persistGeneratedAsset({
    tenantId: user.tenantId,
    companyId: company.id,
    userId: user.id,
    name: `${result.name} (audio)`,
    description: result.description,
    assetType: "audio",
    mimeType: result.mimeType,
    bytes: result.bytes,
    channels: [],
    targetContentId: content.id,
    aiModel: result.model,
    aiPrompt: result.prompt,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
    sourcesUsed,
  });

  await updateContent(content.id, {
    assetIds: [asset.id],
  });

  await logAction(user, "content.voice_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `${voiceStyle} · asset ${asset.id} · ${displayLabel}`,
  });

  revalidatePath("/content");
  revalidatePath("/assets");
  redirect(`/content/${content.id}`);
}
