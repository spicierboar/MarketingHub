"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { advanceRequest, answerGap, createRequest, getGap, getRequest, listGaps } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { completeClientApproval } from "@/lib/client-approval";
import { logAction } from "@/lib/audit";
import { id, now } from "@/lib/utils";
import type { RequestType, UploadedAsset, Urgency } from "@/lib/types";

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true";
}

export async function createClientRequestAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
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

  const notes = String(formData.get("notes") || "").trim();
  const topicRaw = String(formData.get("topic") || "").trim();
  const topic =
    topicRaw ||
    (notes ? notes.slice(0, 80).replace(/\s+/g, " ") : "") ||
    "Message to agency";
  if (!notes && !topicRaw) throw new Error("A message is required");

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: String(formData.get("requestType") || "creative_request") as RequestType,
    objective: String(formData.get("objective") || "").trim(),
    targetAudience: String(formData.get("targetAudience") || "").trim() || undefined,
    platform: String(formData.get("platform") || "").trim() || undefined,
    topic,
    offer: String(formData.get("offer") || "").trim() || undefined,
    callToAction: String(formData.get("callToAction") || "").trim() || undefined,
    preferredDate: String(formData.get("preferredDate") || "") || undefined,
    preferredTime: String(formData.get("preferredTime") || "") || undefined,
    urgency: String(formData.get("urgency") || "normal") as Urgency,
    notes: notes || undefined,
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
  redirect(`/client/requests/${req.id}`);
}

export async function answerClientGapAction(formData: FormData) {
  const gapId = String(formData.get("gapId") || "");
  const answer = String(formData.get("answer") || "").trim();
  if (!answer) throw new Error("Answer is required");
  const gap = await getGap(gapId);
  if (!gap) throw new Error("Question not found");
  const { user, companyId } = await requirePortalUser();
  if (gap.companyId !== companyId) throw new Error("Forbidden");
  await answerGap(gapId, answer, user.id);
  await logAction(user, "gap.answered", {
    targetType: "request",
    targetId: gap.requestId ?? undefined,
    companyId: gap.companyId,
    detail: gap.question.slice(0, 160),
  });
  if (gap.requestId) {
    const stillBlocking = (await listGaps({ requestId: gap.requestId, openOnly: true })).filter((g) => g.blocking);
    if (stillBlocking.length === 0) {
      const req = await getRequest(gap.requestId);
      if (req && req.status === "needs_more_information") {
        await advanceRequest(gap.requestId, "submitted", user.id, "All questions answered");
      }
    }
    revalidatePath(`/client/requests/${gap.requestId}`);
  }
}

export async function portalApproveContentAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const { user, companyId } = await requirePortalUser();
  await completeClientApproval({
    contentId,
    actor: { kind: "portal", user, companyId },
    decision: "approved",
  });
  revalidatePath("/client/approvals");
  revalidatePath(`/client/approvals/${contentId}`);
  redirect("/client/approvals");
}

export async function portalRequestChangesAction(formData: FormData) {
  const contentId = String(formData.get("contentId") || "");
  const note = String(formData.get("note") || "").trim();
  const { user, companyId } = await requirePortalUser();
  await completeClientApproval({
    contentId,
    actor: { kind: "portal", user, companyId },
    decision: "changes_requested",
    note: note || undefined,
  });
  revalidatePath("/client/approvals");
  revalidatePath(`/client/approvals/${contentId}`);
  redirect("/client/approvals");
}
