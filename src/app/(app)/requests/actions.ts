"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  advanceRequest,
  answerGap,
  createRequest,
  getGap,
  getRequest,
  listGaps,
} from "@/lib/db";
import { assertCompanyAccess, assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { draftFromRequestId } from "@/lib/promo-requests";
import { id, now } from "@/lib/utils";
import type { RequestType, UploadedAsset, Urgency } from "@/lib/types";

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
// grounding label → AI run logged. Shared with client custom-work kick.
export async function generateDraftAction(requestId: string) {
  const req = await getRequest(requestId);
  if (!req) throw new Error("Request not found");
  const user = await assertCompanyAccess(req.companyId);
  let contentId: string;
  try {
    contentId = await draftFromRequestId(requestId, user, {
      qualityRoute: true,
      origin: "agency_generate_draft",
    });
  } catch {
    // Gaps / not AI-ready — stay on the request so staff can answer or unblock.
    redirect(`/requests/${requestId}`);
  }
  redirect(`/content/${contentId}`);
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
