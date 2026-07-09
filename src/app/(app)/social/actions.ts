"use server";

import { revalidatePath } from "next/cache";
import {
  createSocial,
  getCompany,
  getSecuritySettings,
  getSocial,
  isUnderLegalHold,
  listResponses,
  logAiRun,
  updateSocial,
} from "@/lib/db";
import {
  assertCompanyAccess,
  canAccessCompany,
  requireUser,
  isAdmin,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { classify, draftSocialResponse } from "@/lib/ai/social";
import { checkCompliance } from "@/lib/ai/compliance";
import { assertAiBudget } from "@/lib/ai/budget";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { publishSocialReply } from "@/lib/publishing";

export async function draftSocialAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const comment = String(formData.get("comment") || "").trim();
  const platform = String(formData.get("platform") || "Facebook").trim();
  if (!comment) throw new Error("Paste a customer comment first");

  const user = await assertCompanyAccess(companyId);
  const company = (await getCompany(companyId))!;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const cls = classify(comment);
  // Ground replies in the Approved Response Library (§39).
  const library = await listResponses(user.tenantId, companyId);
  const { response, model, libraryRef } = await draftSocialResponse(
    company,
    comment,
    cls,
    library,
  );

  // The drafted REPLY goes through the compliance engine too — a reply
  // containing a prohibited claim or missing consent is escalated (§27).
  // Crisis Communications Mode escalates EVERY reply for senior review (§33).
  const replyCheck = await checkCompliance(response, company);
  const escalate =
    cls.escalationRequired ||
    !replyCheck.canProceed ||
    (await getSecuritySettings(company.tenantId)).crisisMode;

  const draft = await createSocial({
    companyId,
    platform,
    originalComment: comment,
    sentiment: cls.sentiment,
    intent: cls.intent,
    riskLevel: cls.riskLevel,
    escalationRequired: escalate,
    draftResponse: response,
    status: escalate ? "escalated" : "pending_approval",
    createdById: user.id,
    libraryRef,
  });

  await logAiRun({
    tenantId: company.tenantId,
    companyId,
    userId: user.id,
    kind: "social_response",
    model,
    promptSummary: comment.slice(0, 120),
    outputChars: response.length,
    sourcesUsed: libraryRef ? [`Approved response: ${libraryRef}`] : [],
    estCostUsd: model.startsWith("claude")
      ? Number(((response.length / 4 / 1e6) * 15).toFixed(4))
      : 0,
  });

  await logAction(user, "social.response_drafted", {
    targetType: "social",
    targetId: draft.id,
    companyId,
    detail: `${cls.intent} · ${cls.riskLevel} · ${model}`,
  });
  revalidatePath("/social");
}

export async function approveSocialAction(formData: FormData) {
  const socialId = String(formData.get("socialId") || "");
  const draft = await getSocial(socialId);
  if (!draft) throw new Error("Not found");
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only approvers can approve responses");
  // Tenant pin: an admin may only act on replies within their own tenant.
  if (!(await canAccessCompany(user, draft.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  if (await isUnderLegalHold("social", draft.id, draft.companyId)) {
    throw new Error("This reply is under legal hold and cannot be modified.");
  }
  // Only replies awaiting review can be approved — a published reply can never
  // be re-approved and published twice (symmetric with content approval).
  if (!["pending_approval", "escalated"].includes(draft.status)) {
    throw new Error("Only replies pending approval can be approved.");
  }
  // Escalated items require the senior approver (super admin in Phase 1-3),
  // mirroring canApproveRoute for content.
  if (draft.escalationRequired && user.role !== "super_admin") {
    throw new Error(
      "Escalated items require senior (super admin) approval.",
    );
  }
  // Re-check the reply against the CURRENT compliance rules before approval.
  const company = await getCompany(draft.companyId);
  if (company) {
    const check = await checkCompliance(draft.draftResponse, company);
    if (!check.canProceed) {
      throw new Error(
        "This reply now has critical compliance issues and cannot be approved.",
      );
    }
  }
  await updateSocial(socialId, { status: "approved", approvedById: user.id });
  await logAction(user, "social.response_approved", {
    targetType: "social",
    targetId: socialId,
    companyId: draft.companyId,
  });
  revalidatePath("/social");
}

// Publish an approved reply through the publishing engine (Phase 7) —
// respects the kill switch and requires a connected integration.
export async function publishSocialReplyAction(formData: FormData) {
  const socialId = String(formData.get("socialId") || "");
  const draft = await getSocial(socialId);
  if (!draft) throw new Error("Not found");
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only approvers can publish replies");
  // Tenant pin: an admin may only publish replies within their own tenant.
  if (!(await canAccessCompany(user, draft.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  if (await isUnderLegalHold("social", draft.id, draft.companyId)) {
    throw new Error("This reply is under legal hold and cannot be published.");
  }

  const log = await publishSocialReply(draft, user);
  if (log.status === "published") {
    await updateSocial(socialId, { status: "published" });
  }
  await logAction(user, `social.reply_${log.status}`, {
    targetType: "social",
    targetId: socialId,
    companyId: draft.companyId,
    detail: log.detail,
  });
  if (log.status !== "published") {
    throw new Error(`Reply not published: ${log.detail}`);
  }
  revalidatePath("/social");
}

export async function closeSocialAction(formData: FormData) {
  const socialId = String(formData.get("socialId") || "");
  const draft = await getSocial(socialId);
  if (!draft) throw new Error("Not found");
  const user = await assertCompanyAccess(draft.companyId);
  if (await isUnderLegalHold("social", draft.id, draft.companyId)) {
    throw new Error("This reply is under legal hold and cannot be modified.");
  }
  // Published/closed replies are final; escalated and approved replies may
  // only be closed by an approver.
  if (["published", "closed", "no_response_required"].includes(draft.status)) {
    throw new Error("This reply is already closed or published.");
  }
  if (
    (draft.status === "escalated" || draft.status === "approved") &&
    !isAdmin(user)
  ) {
    throw new Error("Only approvers can close escalated or approved replies.");
  }
  await updateSocial(socialId, { status: "no_response_required" });
  await logAction(user, "social.closed", {
    targetType: "social",
    targetId: socialId,
    companyId: draft.companyId,
  });
  revalidatePath("/social");
}
