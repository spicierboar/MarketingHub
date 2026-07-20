// Auto-publish after client approval — schedule via scheduleOne (critique gate)
// only when an explicit request/campaign slot exists. The queue performs any
// eventual publish. Critique/asset blocks do not fail the approval itself.

import {
  getCampaign,
  getCampaignItem,
  getCompany,
  getRequest,
  listAssetsForCompany,
  listManagedChannelAdaptations,
  listManagedContentConcepts,
  listManagedPlannedSlots,
  updateManagedPlannedSlot,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { addDaysIso } from "@/lib/calendar-utils";
import { scheduleOne } from "@/lib/scheduling";
import {
  MANAGED_CHANNEL_LABELS,
  standardConceptVisualGate,
} from "@/lib/managed-service/workflow";
import type { ActingUser, Company, CompanyProfile, ContentItem } from "@/lib/types";

export type AutoPublishOutcome = "scheduled" | "published" | "skipped" | "blocked";

type ScheduleIntent = {
  platform: string;
  date: string;
  time?: string;
  managedSlotId?: string;
};

function autoPublishEnabled(profile: CompanyProfile): boolean {
  const flag = (profile as CompanyProfile & { autoPublishOnClientApprove?: boolean })
    .autoPublishOnClientApprove;
  return flag !== false;
}

async function resolveScheduleIntent(content: ContentItem): Promise<ScheduleIntent | null> {
  let platform = "Facebook";
  let date: string | undefined;
  let time: string | undefined;

  if (content.managedConceptId) {
    const company = await getCompany(content.companyId);
    if (!company) return null;
    const adaptations = await listManagedChannelAdaptations(
      company.tenantId,
      content.managedConceptId,
    );
    const adaptation = adaptations.find(
      (row) => row.channelKey === content.managedChannelKey,
    );
    if (!adaptation) return null;
    const slot = (await listManagedPlannedSlots(company.tenantId, company.id)).find(
      (row) =>
        row.adaptationId === adaptation.id &&
        row.status !== "cancelled" &&
        !row.scheduledPostId,
    );
    if (!slot) return null;
    const planned = new Date(slot.plannedPublishAt);
    return {
      platform: MANAGED_CHANNEL_LABELS[adaptation.channelKey],
      date: planned.toISOString().slice(0, 10),
      time: planned.toISOString().slice(11, 16),
      managedSlotId: slot.id,
    };
  }

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

  return date ? { platform, date, time } : null;
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

/**
 * Schedule a client-approved item only when its request/campaign already has a
 * planned slot. Publishing remains the queue's responsibility, even when that
 * slot is currently due.
 */
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
  if (!intent) {
    return "skipped";
  }
  const actor = publishActor(userId, actorEmail, tenantId);

  try {
    if (content.managedConceptId) {
      const concept = (await listManagedContentConcepts(tenantId, company.id)).find(
        (row) => row.id === content.managedConceptId,
      );
      if (!concept) throw new Error("Managed content concept not found.");
      const adaptations = await listManagedChannelAdaptations(tenantId, concept.id);
      const gate = standardConceptVisualGate({
        concept,
        assets: await listAssetsForCompany(company.id),
        adaptationCopies: adaptations.map((row) => row.copy),
      });
      if (!gate.ok) throw new Error(gate.reason);
      if (
        !concept.reusableAssetId ||
        content.assetIds?.length !== 1 ||
        content.assetIds[0] !== concept.reusableAssetId
      ) {
        throw new Error("Scheduled content must use the concept's single approved reusable visual.");
      }
    }
    const scheduled = await scheduleOne({
      contentId: content.id,
      platform: intent.platform,
      date: intent.date,
      time: intent.time,
      userId,
      tenantId,
    });
    if (intent.managedSlotId) {
      await updateManagedPlannedSlot(intent.managedSlotId, {
        status: "scheduled",
        scheduledPostId: scheduled.id,
      });
    }
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

  return "scheduled";
}
