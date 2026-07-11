"use server";

import { revalidatePath } from "next/cache";
import {
  activeSchedulesForContent,
  getCampaignItem,
  getContent,
  getScheduledPost,
  transitionScheduledPost,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { assertCompanyAccess, requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { rescheduleOne } from "@/lib/scheduling";

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

/** Client portal reschedule — always via rescheduleOne (critique gate). */
export async function rescheduleClientPostAction(formData: FormData) {
  const postId = text(formData, "postId");
  const date = text(formData, "date");
  if (!date) throw new Error("A date is required.");

  const { user, post } = await assertPortalPostAccess(postId);
  if (post.status !== "scheduled") {
    throw new Error("Only scheduled posts can be moved.");
  }

  const { post: updated, conflictWarning } = await rescheduleOne({
    postId,
    date,
    time: text(formData, "time") || undefined,
    userId: user.id,
    tenantId: user.tenantId,
  });

  await logAction(user, "content.rescheduled", {
    targetType: "scheduled_post",
    targetId: postId,
    companyId: post.companyId,
    detail: `→ ${updated.scheduledDate}${updated.scheduledTime ? ` ${updated.scheduledTime}` : ""}${
      conflictWarning ? ` (soft conflict)` : ""
    }`,
  });

  revalidatePath("/client/calendar");
}

/** Pause = cancel schedule (same guarded transition as agency calendar). */
export async function cancelClientScheduleAction(formData: FormData) {
  const postId = text(formData, "postId");
  const { user, post } = await assertPortalPostAccess(postId);

  const cancelled = await transitionScheduledPost(user.tenantId, postId, {
    from: ["scheduled", "failed", "dead"],
    to: "cancelled",
  });
  if (!cancelled) {
    throw new Error("Already inactive (or currently publishing).");
  }

  const content = await getContent(post.contentId);
  if (content && (await activeSchedulesForContent(content.id)).length === 0) {
    if (content.status === "scheduled") {
      await updateContent(content.id, { status: "approved" });
    }
    if (content.campaignItemId) {
      const item = await getCampaignItem(content.campaignItemId);
      if (item?.status === "scheduled") {
        await updateCampaignItem(content.campaignItemId, { status: "approved" });
      }
    }
  }

  await logAction(user, "content.schedule_cancelled", {
    targetType: "scheduled_post",
    targetId: postId,
    companyId: post.companyId,
  });

  revalidatePath("/client/calendar");
}
