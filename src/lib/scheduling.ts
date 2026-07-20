// Core scheduling pipeline — shared by calendar actions and auto-publish (M18).
//
// Rule (P6 go-live): ONLY approved content can be scheduled — enforced here at
// the server boundary, not just in the UI.

import {
  createScheduledPost,
  getCompany,
  getContent,
  getScheduledPost,
  isUnderLegalHold,
  listScheduledPosts,
  updateCampaignItem,
  updateContent,
  updateScheduledPost,
} from "@/lib/db";
import { assertAssetsAllowChannel } from "@/lib/assets";
import { maybeAutoInviteForScheduledPlatform } from "@/lib/onboarding-social-connect";
import {
  critiqueBlocksScheduling,
  critiqueForPublish,
  formatCritiqueError,
} from "@/lib/ai/critique";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiBudget } from "@/lib/ai/budget";
import type { Company, ContentItem, ScheduledPost } from "@/lib/types";

async function runScheduleCritique(args: {
  content: ContentItem;
  company: Company;
  platform: string;
  userId: string;
  tenantId: string;
}): Promise<void> {
  const { content, company, platform } = args;
  await assertAiBudget(args.tenantId, 500);
  const critique = await critiqueForPublish({ content, company, platform });
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
}

/** Soft warn when another active post shares company + platform on the same day. */
export async function sameDayPlatformConflictWarning(
  tenantId: string,
  opts: {
    companyId: string;
    platform: string;
    date: string;
    excludePostId?: string;
  },
): Promise<string | undefined> {
  const platform = opts.platform.toLowerCase();
  const clash = (await listScheduledPosts(tenantId)).find(
    (p) =>
      p.id !== opts.excludePostId &&
      p.companyId === opts.companyId &&
      p.status === "scheduled" &&
      p.scheduledDate === opts.date &&
      p.platform.toLowerCase() === platform,
  );
  if (!clash) return undefined;
  return `Another ${opts.platform} post is already scheduled for this company on ${opts.date}.`;
}

export async function scheduleOne(args: {
  contentId: string;
  platform: string;
  date: string;
  time?: string;
  userId: string;
  tenantId: string;
}): Promise<ScheduledPost> {
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
  await runScheduleCritique({
    content,
    company,
    platform: args.platform,
    userId: args.userId,
    tenantId: args.tenantId,
  });

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

  void maybeAutoInviteForScheduledPlatform({
    agencyTenantId: args.tenantId,
    companyId: content.companyId,
    publishPlatformLabel: args.platform || "Facebook",
    recipientEmail: company.profile.approvalContact,
  }).catch(() => {
    /* non-blocking — publish path retries invite if still missing */
  });

  return post;
}

/**
 * Move an existing scheduled post. Re-runs critiqueForPublish before updating —
 * same gate as scheduleOne. Does not create a new row.
 */
export async function rescheduleOne(args: {
  postId: string;
  date: string;
  time?: string;
  userId: string;
  tenantId: string;
}): Promise<{ post: ScheduledPost; conflictWarning?: string }> {
  const post = await getScheduledPost(args.postId);
  if (!post) throw new Error("Scheduled post not found");
  if (post.status !== "scheduled") {
    throw new Error("Only active schedules can be moved.");
  }
  if (!args.date) throw new Error("A date is required.");

  const content = await getContent(post.contentId);
  if (!content) throw new Error("Content not found");
  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is under legal hold and cannot be rescheduled.");
  }
  const company = await getCompany(content.companyId);
  if (!company) throw new Error("Company not found");

  await runScheduleCritique({
    content,
    company,
    platform: post.platform,
    userId: args.userId,
    tenantId: args.tenantId,
  });
  await assertAssetsAllowChannel(content.assetIds, post.platform || "Facebook");

  const time = args.time !== undefined ? args.time || undefined : post.scheduledTime;
  const updated = await updateScheduledPost(post.id, {
    scheduledDate: args.date,
    scheduledTime: time,
  });
  if (!updated) throw new Error("Failed to update schedule");

  const conflictWarning = await sameDayPlatformConflictWarning(args.tenantId, {
    companyId: post.companyId,
    platform: post.platform,
    date: args.date,
    excludePostId: post.id,
  });

  return { post: updated, conflictWarning };
}
