"use server";

import { revalidatePath } from "next/cache";
import {
  activeSchedulesForContent,
  createScheduledPost,
  getCampaign,
  getCampaignItem,
  getCompany,
  getContent,
  getScheduledPost,
  isUnderLegalHold,
  listCampaignItems,
  transitionScheduledPost,
  updateCampaignItem,
  updateContent,
  updateScheduledPost,
} from "@/lib/db";
import { assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { addDaysIso } from "@/lib/calendar-utils";
import { assertAssetsAllowChannel } from "@/lib/assets";
import {
  critiqueBlocksScheduling,
  critiqueForPublish,
  formatCritiqueError,
} from "@/lib/ai/critique";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiBudget } from "@/lib/ai/budget";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function refreshPaths(contentId?: string, campaignId?: string | null) {
  revalidatePath("/calendar");
  if (contentId) revalidatePath(`/content/${contentId}`);
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
}

// Core rule (P6 go-live): ONLY approved content can be scheduled — enforced
// here at the server boundary, not just in the UI.
async function scheduleOne(args: {
  contentId: string;
  platform: string;
  date: string;
  time?: string;
  userId: string;
  tenantId: string;
}) {
  const content = await getContent(args.contentId);
  if (!content) throw new Error("Content not found");
  if (!["approved", "scheduled"].includes(content.status)) {
    throw new Error("Only approved content can be scheduled.");
  }
  // §54 — legal-held content must not be pushed toward publication.
  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is under legal hold and cannot be scheduled.");
  }
  const company = await getCompany(content.companyId);
  if (!company) throw new Error("Company not found");

  // Module 3 — pre-publish AI critique before scheduling.
  await assertAiBudget(args.tenantId, 500);
  const critique = await critiqueForPublish({ content, company, platform: args.platform });
  await recordAiUsage({
    tenantId: args.tenantId,
    companyId: company.id,
    userId: args.userId,
    kind: "content_critique",
    model: critique.model,
    promptSummary: `Critique: ${content.title}`.slice(0, 120),
    sourcesUsed: ["Brand Brain: company profile"],
    outputChars: JSON.stringify(critique.notes).length,
    contextChars: content.body.length,
  });
  await updateContent(content.id, { aiCritique: critique });
  if (critiqueBlocksScheduling(critique)) {
    throw new Error(formatCritiqueError(critique));
  }

  // §46 — a referenced creative asset must permit this channel (owner/consent/
  // licence/allowed-channels/expiry). Enforced here at the server boundary.
  await assertAssetsAllowChannel(content.assetIds, args.platform || "Facebook");
  if (!args.date) throw new Error("A date is required.");

  const post = await createScheduledPost({
    contentId: content.id,
    companyId: content.companyId,
    platform: args.platform || "Facebook",
    scheduledDate: args.date,
    scheduledTime: args.time || undefined,
    status: "scheduled",
    createdById: args.userId,
  });
  await updateContent(content.id, { status: "scheduled" });
  if (content.campaignItemId) {
    await updateCampaignItem(content.campaignItemId, { status: "scheduled" });
  }
  return post;
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

// Drag-and-drop (and form) rescheduling.
export async function reschedulePostAction(formData: FormData) {
  const postId = text(formData, "postId");
  const date = text(formData, "date");
  const post = await getScheduledPost(postId);
  if (!post) throw new Error("Scheduled post not found");
  if (post.status !== "scheduled") {
    throw new Error("Only active schedules can be moved.");
  }
  if (!date) throw new Error("A date is required.");
  const user = await assertCompanyAccess(post.companyId);

  await updateScheduledPost(postId, {
    scheduledDate: date,
    scheduledTime: text(formData, "time") || post.scheduledTime,
  });
  await logAction(user, "content.rescheduled", {
    targetType: "scheduled_post",
    targetId: postId,
    companyId: post.companyId,
    detail: `→ ${date}`,
  });
  const content = await getContent(post.contentId);
  refreshPaths(post.contentId, content?.campaignId);
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
