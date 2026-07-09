"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  advanceRequest,
  answerGap,
  createContent,
  createGap,
  createRequest,
  getCompany,
  getGap,
  getRequest,
  listGaps,
} from "@/lib/db";
import { assertCompanyAccess, assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { draftContent } from "@/lib/ai/draft";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { detectGaps } from "@/lib/ai/gaps";
import { duplicateWarning } from "@/lib/ai/similarity";
import { assertAiBudget } from "@/lib/ai/budget";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { id, now } from "@/lib/utils";
import type { GroundingLabel, RequestType, UploadedAsset, Urgency } from "@/lib/types";

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true";
}

export async function createRequestAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertCompanyAccess(companyId);

  const uploads: UploadedAsset[] = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .map((f) => ({
      id: id("doc"),
      name: f.name,
      contentType: f.type || "application/octet-stream",
      size: f.size,
      approvalStatus: "pending",
      consentObtained: bool(formData, "consentObtained"),
      showsCustomer: bool(formData, "customerInPhotos"),
      uploadedBy: user.id,
      uploadedAt: now(),
    }));

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: String(formData.get("requestType") || "social_post") as RequestType,
    objective: String(formData.get("objective") || "").trim(),
    targetAudience: String(formData.get("targetAudience") || "").trim() || undefined,
    platform: String(formData.get("platform") || "").trim() || undefined,
    topic: String(formData.get("topic") || "").trim(),
    offer: String(formData.get("offer") || "").trim() || undefined,
    callToAction: String(formData.get("callToAction") || "").trim() || undefined,
    preferredDate: String(formData.get("preferredDate") || "") || undefined,
    preferredTime: String(formData.get("preferredTime") || "") || undefined,
    urgency: (String(formData.get("urgency") || "normal") as Urgency),
    notes: String(formData.get("notes") || "").trim() || undefined,
    consent: {
      customerNamed: bool(formData, "customerNamed"),
      customerInPhotos: bool(formData, "customerInPhotos"),
      consentObtained: bool(formData, "consentObtained"),
      mentionsPricing: bool(formData, "mentionsPricing"),
      mentionsOffer: bool(formData, "mentionsOffer"),
      performanceClaims: bool(formData, "performanceClaims"),
    },
    uploads,
    assignedReviewerId: null,
  });

  await logAction(user, "request.submitted", {
    targetType: "request",
    targetId: req.id,
    companyId,
    detail: req.topic,
  });

  redirect(`/requests/${req.id}`);
}

// Generate an AI draft from a request (master prompt §19). Phase 2/3 pipeline:
// knowledge-gap check → grounded drafting → compliance + claims audit →
// grounding label → AI run logged.
export async function generateDraftAction(requestId: string) {
  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  const user = await assertCompanyAccess(req.companyId);
  const company = await getCompany(req.companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error(
      "Company is not AI-ready. Complete onboarding before generating content.",
    );
  }

  // Knowledge gap detector (§51): blocking gaps open the Ask-the-Local-Manager
  // workflow and stop drafting until answered.
  const openGaps = await listGaps({ requestId, openOnly: true });
  const existingGaps = await listGaps({ requestId });
  const detected = (await detectGaps(company, req)).filter(
    (d) =>
      // Don't re-raise a question that is already open or already answered.
      !existingGaps.some((g) => g.question === d.question),
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
    redirect(`/requests/${requestId}`);
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

  const compliance = await checkCompliance(draft.body, company, { consent: req.consent });
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

  redirect(`/content/${content.id}`);
}

// "Ask the Local Manager": the requester answers a knowledge gap. When no
// blocking gaps remain open, the request returns to the queue for drafting.
export async function answerGapAction(formData: FormData) {
  const gapId = String(formData.get("gapId") || "");
  const answer = String(formData.get("answer") || "").trim();
  if (!answer) throw new Error("Answer is required");
  const gap = await getGap(gapId);
  if (!gap) throw new Error("Question not found");
  const user = await assertCompanyAccess(gap.companyId);

  await answerGap(gapId, answer, user.id);
  await logAction(user, "gap.answered", {
    targetType: "request",
    targetId: gap.requestId ?? undefined,
    companyId: gap.companyId,
    detail: gap.question.slice(0, 160),
  });

  if (gap.requestId) {
    const stillBlocking = (await listGaps({
      requestId: gap.requestId,
      openOnly: true,
    })).filter((g) => g.blocking);
    if (stillBlocking.length === 0) {
      const req = await getRequest(gap.requestId);
      if (req && req.status === "needs_more_information") {
        await advanceRequest(
          gap.requestId,
          "submitted",
          user.id,
          "All local manager questions answered",
        );
      }
    }
    revalidatePath(`/requests/${gap.requestId}`);
  }
}

export async function cancelRequestAction(requestId: string) {
  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  const user = await assertCompanyAccess(req.companyId);
  await advanceRequest(requestId, "cancelled", user.id);
  await logAction(user, "request.cancelled", {
    targetType: "request",
    targetId: requestId,
    companyId: req.companyId,
  });
  revalidatePath(`/requests/${requestId}`);
}

export async function requestMoreInfoAction(formData: FormData) {
  const requestId = String(formData.get("requestId") || "");
  const note = String(formData.get("note") || "").trim();
  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  // Tenant-pin: only an admin of the request's OWN tenant may act on it.
  const user = await assertAdminCompanyAccess(req.companyId);
  await advanceRequest(requestId, "needs_more_information", user.id, note);
  await logAction(user, "request.needs_more_information", {
    targetType: "request",
    targetId: requestId,
    companyId: req.companyId,
    detail: note,
  });
  revalidatePath(`/requests/${requestId}`);
}
