// Auto-publish after client approval — schedule via scheduleOne (critique gate),
// then publishPostNow when the slot is due. Critique/asset blocks are audited
// and surfaced as "blocked" without failing the approval itself.

import {
  getCampaign,
  getCampaignItem,
  getCompany,
  getRequest,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { addDaysIso } from "@/lib/calendar-utils";
import { isDue, publishPostNow, queueNowPartsForTenant } from "@/lib/publish-queue";
import { scheduleOne } from "@/lib/scheduling";
import type { ActingUser, Company, CompanyProfile, ContentItem } from "@/lib/types";

export type AutoPublishOutcome = "scheduled" | "published" | "skipped" | "blocked";

type ScheduleIntent = {
  platform: string;
  date: string;
  time?: string;
};

function autoPublishEnabled(profile: CompanyProfile): boolean {
  const flag = (profile as CompanyProfile & { autoPublishOnClientApprove?: boolean })
    .autoPublishOnClientApprove;
  return flag !== false;
}

async function resolveScheduleIntent(content: ContentItem): Promise<ScheduleIntent> {
  let platform = "Facebook";
  let date: string | undefined;
  let time: string | undefined;

  if (content.requestId) {
    const req = await getRequest(content.requestId);
    if (req?.platform) platform = req.platform;
    if (req?.preferredDate) date = req.preferredDate;
    if (req?.preferredTime) time = req.preferredTime;
  }

  if (content.campaignItemId) {
    const item = await getCampaignItem(content.campaignItemId);
    if (item) {
      if (item.channel) platform = item.channel;
      const campaign = await getCampaign(item.campaignId);
      if (campaign?.startDate) {
        date = addDaysIso(campaign.startDate, item.dayOffset - 1);
      }
    }
  }

  const company = await getCompany(content.companyId);
  const { today } = await queueNowPartsForTenant(company?.tenantId ?? "");

  return {
    platform,
    date: date ?? today,
    time,
  };
}

function publishActor(userId: string, email: string, tenantId: string): ActingUser {
  return {
    id: userId,
    email,
    name: email,
    role: "user",
    tenantRole: "member",
    tenantId,
    active: true,
    createdAt: new Date(0).toISOString(),
  };
}

/** Schedule (critique-gated) and optionally publish immediately when due. */
export async function autoPublishOnApprove(args: {
  content: ContentItem;
  company: Company;
  userId: string;
  actorEmail: string;
  tenantId: string;
}): Promise<AutoPublishOutcome> {
  const { content, company, userId, actorEmail, tenantId } = args;

  if (!autoPublishEnabled(company.profile)) {
    return "skipped";
  }

  const intent = await resolveScheduleIntent(content);
  const actor = publishActor(userId, actorEmail, tenantId);

  let post;
  try {
    post = await scheduleOne({
      contentId: content.id,
      platform: intent.platform,
      date: intent.date,
      time: intent.time,
      userId,
      tenantId,
    });
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Auto-publish scheduling failed";
    await logAction(actor, "content.auto_publish_blocked", {
      targetType: "content",
      targetId: content.id,
      companyId: content.companyId,
      tenantId,
      detail,
    });
    return "blocked";
  }

  const { today, hhmm } = await queueNowPartsForTenant(tenantId);
  if (!isDue(post, today, hhmm)) {
    return "scheduled";
  }

  try {
    const outcome = await publishPostNow(post.id, actor);
    return outcome ? "published" : "scheduled";
  } catch {
    return "scheduled";
  }
}
