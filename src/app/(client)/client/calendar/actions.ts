"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createRequest, getContent, getScheduledPost } from "@/lib/db";
import { assertCompanyAccess, requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function assertPortalPostAccess(postId: string) {
  const { companyId } = await requirePortalUser();
  const post = await getScheduledPost(postId);
  if (!post) throw new Error("Scheduled post not found");
  if (post.companyId !== companyId) throw new Error("Forbidden: no access to this company");
  const user = await assertCompanyAccess(post.companyId);
  return { user, post, companyId };
}

/**
 * Wave A — clients do not reschedule live. Opens an Ask ticket for the agency.
 * Does not call rescheduleOne.
 */
export async function askRescheduleClientPostAction(formData: FormData) {
  const postId = text(formData, "postId");
  const preferredDate = text(formData, "date");
  const note = text(formData, "note");

  const { user, post, companyId } = await assertPortalPostAccess(postId);
  if (post.status !== "scheduled") {
    throw new Error("Only scheduled posts can be moved.");
  }

  const content = await getContent(post.contentId);
  const title = content?.title ?? "Untitled post";
  const topic = `Please move: ${title}`;
  const notes = [
    `Client asked to move scheduled post.`,
    `Post id: ${postId}`,
    `Current date: ${post.scheduledDate}${post.scheduledTime ? ` ${post.scheduledTime}` : ""}`,
    `Platform: ${post.platform}`,
    preferredDate ? `Preferred new date: ${preferredDate}` : null,
    note ? `Note: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: "social_post",
    objective: "",
    topic,
    preferredDate: preferredDate || undefined,
    urgency: "normal",
    notes,
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

  await logAction(user, "request.submitted", {
    targetType: "request",
    targetId: req.id,
    companyId,
    detail: topic,
  });

  revalidatePath("/client/calendar");
  redirect(`/client/requests/${req.id}`);
}

/**
 * Wave A — clients do not cancel/pause live. Opens an Ask ticket for the agency.
 * Does not call transitionScheduledPost / cancel.
 */
export async function askPauseClientPostAction(formData: FormData) {
  const postId = text(formData, "postId");
  const note = text(formData, "note");

  const { user, post, companyId } = await assertPortalPostAccess(postId);
  if (post.status !== "scheduled") {
    throw new Error("Only scheduled posts can be paused.");
  }

  const content = await getContent(post.contentId);
  const title = content?.title ?? "Untitled post";
  const topic = `Please pause: ${title}`;
  const notes = [
    `Client asked to pause/cancel a scheduled post.`,
    `Post id: ${postId}`,
    `Scheduled: ${post.scheduledDate}${post.scheduledTime ? ` ${post.scheduledTime}` : ""}`,
    `Platform: ${post.platform}`,
    note ? `Note: ${note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: "social_post",
    objective: "",
    topic,
    urgency: "normal",
    notes,
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

  await logAction(user, "request.submitted", {
    targetType: "request",
    targetId: req.id,
    companyId,
    detail: topic,
  });

  revalidatePath("/client/calendar");
  redirect(`/client/requests/${req.id}`);
}
