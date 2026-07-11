"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  activeSchedulesForContent,
  getCalendarAssistSuggestion,
  getCampaign,
  getCampaignItem,
  getContent,
  getScheduledPost,
  getTenant,
  listCampaignItems,
  transitionScheduledPost,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { addDaysIso } from "@/lib/calendar-utils";
import { resolveNextOptimalSlot } from "@/lib/calendar-intelligence";
import { rescheduleOne, scheduleOne } from "@/lib/scheduling";
import {
  acceptCalendarAssistSuggestion,
  dismissCalendarAssistSuggestion,
  surfaceCalendarAssistSuggestions,
} from "@/lib/ai/calendar-assist";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function refreshPaths(contentId?: string, campaignId?: string | null) {
  revalidatePath("/calendar");
  if (contentId) revalidatePath(`/content/${contentId}`);
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
}

export async function schedulePostAction(formData: FormData) {
  const contentId = text(formData, "contentId");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);

  const post = await scheduleOne({
    contentId,
    platform: text(formData, "platform"),
    date: text(formData, "date"),
    time: text(formData, "time"),
    userId: user.id,
    tenantId: user.tenantId,
  });

  await logAction(user, "content.scheduled", {
    targetType: "scheduled_post",
    targetId: post.id,
    companyId: content.companyId,
    detail: `${content.title} → ${post.platform} ${post.scheduledDate}${post.scheduledTime ? ` ${post.scheduledTime}` : ""}`,
  });
  refreshPaths(contentId, content.campaignId);
}

// Drag-and-drop (and form) rescheduling — always via rescheduleOne (critique gate).
export async function reschedulePostAction(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  conflictWarning?: string;
}> {
  const postId = text(formData, "postId");
  const date = text(formData, "date");
  const post = await getScheduledPost(postId);
  if (!post) return { ok: false, error: "Scheduled post not found" };
  if (post.status !== "scheduled") {
    return { ok: false, error: "Only active schedules can be moved." };
  }
  if (!date) return { ok: false, error: "A date is required." };

  try {
    const user = await assertCompanyAccess(post.companyId);
    const timeRaw = text(formData, "time");
    const { post: updated, conflictWarning } = await rescheduleOne({
      postId,
      date,
      time: timeRaw || undefined,
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
    const content = await getContent(post.contentId);
    refreshPaths(post.contentId, content?.campaignId);
    return { ok: true, conflictWarning };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reschedule failed" };
  }
}

export async function cancelScheduleAction(formData: FormData) {
  const postId = text(formData, "postId");
  const post = await getScheduledPost(postId);
  if (!post) throw new Error("Scheduled post not found");
  const user = await assertCompanyAccess(post.companyId);
  // Atomic transition: queue-resting states (scheduled / failed / dead) can be
  // cancelled; an in-flight "publishing" post cannot be pulled back mid-send —
  // the guarded transition simply won't match and the operator gets a clear
  // error instead of a silent race with the queue worker.
  const cancelled = await transitionScheduledPost(user.tenantId, postId, {
    from: ["scheduled", "failed", "dead"],
    to: "cancelled",
  });
  if (!cancelled) {
    throw new Error("Already inactive (or currently publishing).");
  }

  // No remaining active schedules → content returns to approved (and its
  // campaign item with it). Published stays published — terminal.
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
  refreshPaths(post.contentId, content?.campaignId);
}

// Bulk scheduling (§34): schedule every approved item of a campaign at its
// planned date on its planned channel.
export async function bulkScheduleCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);
  if (!["approved", "completed"].includes(campaign.status)) {
    throw new Error("Only approved campaigns can be bulk-scheduled.");
  }

  let scheduled = 0;
  for (const item of await listCampaignItems(campaignId)) {
    if (item.status !== "approved" || !item.contentId) continue;
    const content = await getContent(item.contentId);
    if (!content || content.status !== "approved") continue;
    await scheduleOne({
      contentId: content.id,
      platform: item.channel,
      date: addDaysIso(campaign.startDate, item.dayOffset - 1),
      userId: user.id,
      tenantId: user.tenantId,
    });
    scheduled += 1;
  }
  if (scheduled === 0) {
    throw new Error("No approved, unscheduled items to schedule.");
  }

  await logAction(user, "campaign.bulk_scheduled", {
    targetType: "campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
    detail: `${scheduled} item(s) scheduled`,
  });
  refreshPaths(undefined, campaignId);
}

export async function scanCalendarAssistAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = companyId
    ? await assertCompanyAccess(companyId)
    : await (async () => {
        const { requireUser } = await import("@/lib/auth/rbac");
        return requireUser();
      })();

  const created = await surfaceCalendarAssistSuggestions(
    user.tenantId,
    user.id,
    companyId ? { companyIds: [companyId] } : undefined,
  );

  await logAction(user, "calendar_assist.scanned", {
    companyId: companyId || undefined,
    detail: `${created} suggestion(s) surfaced`,
  });

  revalidatePath("/calendar");
  revalidatePath("/ads");
}

export async function acceptCalendarAssistSuggestionAction(formData: FormData) {
  const suggestionId = text(formData, "suggestionId");
  const suggestion = await getCalendarAssistSuggestion(suggestionId);
  if (!suggestion) throw new Error("Suggestion not found");
  const user = await assertCompanyAccess(suggestion.companyId);
  if (suggestion.status !== "open") throw new Error("Suggestion is no longer open");

  const contentId = await acceptCalendarAssistSuggestion(suggestion, user);

  revalidatePath("/calendar");
  revalidatePath("/content");
  redirect(`/content/${contentId}`);
}

export async function dismissCalendarAssistSuggestionAction(formData: FormData) {
  const suggestionId = text(formData, "suggestionId");
  const dismissReason = text(formData, "dismissReason");
  const suggestion = await getCalendarAssistSuggestion(suggestionId);
  if (!suggestion) throw new Error("Suggestion not found");
  const user = await assertCompanyAccess(suggestion.companyId);
  if (suggestion.status !== "open") throw new Error("Suggestion is no longer open");

  await dismissCalendarAssistSuggestion(suggestion, user, dismissReason || undefined);
  revalidatePath("/calendar");
}

/**
 * Schedule approved content at the next analytics-informed optimal window.
 * Goes through scheduleOne — critique gate unchanged. Does not auto-approve drafts.
 */
export async function scheduleAtOptimalWindowAction(formData: FormData) {
  const contentId = text(formData, "contentId");
  const platformHint = text(formData, "platform");
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");
  const user = await assertCompanyAccess(content.companyId);

  if (content.status !== "approved" && content.status !== "scheduled") {
    redirect(
      `/content/${contentId}?scheduleError=${encodeURIComponent(
        "Only approved content can be scheduled at the best time. Accept assist → review → approve first.",
      )}`,
    );
  }

  const tenant = await getTenant(user.tenantId);
  const slot = await resolveNextOptimalSlot(user.tenantId, {
    companyId: content.companyId,
    platform: platformHint || undefined,
    tenant,
  });
  if (!slot) {
    redirect(
      `/content/${contentId}?scheduleError=${encodeURIComponent(
        "No optimal window available — set a platform manually or publish more posts to refine windows.",
      )}`,
    );
  }

  try {
    const post = await scheduleOne({
      contentId,
      platform: platformHint || slot.platform,
      date: slot.date,
      time: slot.time,
      userId: user.id,
      tenantId: user.tenantId,
    });

    await logAction(user, "content.scheduled", {
      targetType: "scheduled_post",
      targetId: post.id,
      companyId: content.companyId,
      detail: `optimal:${content.title} → ${post.platform} ${post.scheduledDate}${post.scheduledTime ? ` ${post.scheduledTime}` : ""} (${slot.dayOfWeek} score ${slot.score})`,
    });
    refreshPaths(contentId, content.campaignId);
    redirect(
      `/content/${contentId}?scheduledAt=${encodeURIComponent(`${post.scheduledDate} ${post.scheduledTime ?? ""}`.trim())}`,
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    // scheduleOne persists aiCritique before throwing on block — surface message + critique on content.
    revalidatePath(`/content/${contentId}`);
    revalidatePath("/calendar");
    const msg = e instanceof Error ? e.message : "Scheduling failed";
    redirect(`/content/${contentId}?scheduleError=${encodeURIComponent(msg)}`);
  }
}
