// Managed auto-progress: critique-gated scheduling of already-approved content.
//
// HARD RULES:
//   • ALWAYS goes through scheduleOne (critiqueForPublish inside) — never bypass
//   • NEVER auto-spend or activate promotions
//   • Only when canAutoExecuteLowRisk(level, "schedule_approved") —
//     fully_managed | managed_exceptions
//   • Live publish flags stay OFF; demo still creates scheduled_post rows
//   • Sources: assist-ready accepted drafts AND approved campaign-builder
//     planned-date / draft-schedule rows

import { logAction } from "@/lib/audit";
import {
  assistAcceptedContentNotScheduled,
  listAssistReadyToSchedule,
} from "@/lib/ai/calendar-assist";
import {
  getCompany,
  getContent,
  listCampaignDraftScheduleItems,
  listCampaigns,
  listCompanies,
} from "@/lib/db";
import {
  canAutoExecuteLowRisk,
} from "@/lib/managed-service/authority";
import { notifyClientException } from "@/lib/managed-service/exception-notify";
import { scheduleOne } from "@/lib/scheduling";
import type { ActingUser, ManagedServiceLevel } from "@/lib/types";

/** Cap how many managed companies we progress per tenant tick. */
const MAX_COMPANIES_PER_TICK = 10;

/** Cap schedule attempts per company per call (assist + campaign planned). */
const MAX_SCHEDULE_PER_COMPANY = 8;

function serviceLevelOf(company: {
  profile: { managedService?: { serviceLevel?: ManagedServiceLevel } };
}): ManagedServiceLevel | null {
  return company.profile.managedService?.serviceLevel ?? null;
}

function canAutoScheduleLevel(level: ManagedServiceLevel | null): boolean {
  return level != null && canAutoExecuteLowRisk(level, "schedule_approved");
}

export type ManagedScheduleCandidate = {
  contentId: string;
  platform: string;
  date: string;
  time?: string | null;
  source: "assist" | "campaign_planned";
  sourceId: string;
};

/**
 * Approved campaign-builder draft-schedule rows ready for scheduleOne:
 * content approved, has a planned date, not already scheduled.
 */
export async function listApprovedCampaignPlannedReadyToSchedule(
  tenantId: string,
  companyId: string,
  limit = MAX_SCHEDULE_PER_COMPANY,
  excludeContentIds?: ReadonlySet<string>,
): Promise<ManagedScheduleCandidate[]> {
  const campaigns = (await listCampaigns(tenantId)).filter(
    (c) => c.companyId === companyId,
  );
  const ready: ManagedScheduleCandidate[] = [];
  const seen = new Set<string>(excludeContentIds ? [...excludeContentIds] : []);

  for (const campaign of campaigns) {
    if (ready.length >= limit) break;
    const drafts = await listCampaignDraftScheduleItems(campaign.id);
    for (const draft of drafts) {
      if (ready.length >= limit) break;
      if (!draft.contentId || !draft.scheduledDate) continue;
      if (seen.has(draft.contentId)) continue;
      const content = await getContent(draft.contentId);
      if (!content || content.companyId !== companyId) continue;
      if (content.status !== "approved") continue;
      if (!(await assistAcceptedContentNotScheduled(tenantId, content.id))) continue;
      seen.add(content.id);
      ready.push({
        contentId: content.id,
        platform: draft.platform || "Facebook",
        date: draft.scheduledDate,
        time: draft.scheduledTime,
        source: "campaign_planned",
        sourceId: draft.id,
      });
    }
  }

  return ready;
}

async function collectReadyToSchedule(
  tenantId: string,
  companyId: string,
  limit: number,
): Promise<ManagedScheduleCandidate[]> {
  const assistReady = await listAssistReadyToSchedule(tenantId, [companyId], limit);
  const fromAssist: ManagedScheduleCandidate[] = assistReady
    .filter((item) => Boolean(item.suggestion.proposedDate))
    .map((item) => ({
      contentId: item.contentId,
      platform: item.platform,
      date: item.suggestion.proposedDate,
      time: item.suggestion.proposedTime,
      source: "assist" as const,
      sourceId: item.suggestion.id,
    }));

  const used = new Set(fromAssist.map((c) => c.contentId));
  const remaining = Math.max(0, limit - fromAssist.length);
  const fromCampaign =
    remaining > 0
      ? await listApprovedCampaignPlannedReadyToSchedule(
          tenantId,
          companyId,
          remaining,
          used,
        )
      : [];

  return [...fromAssist, ...fromCampaign].slice(0, limit);
}

/**
 * For one managed company (fully_managed | managed_exceptions): schedule
 * assist-ready + approved campaign planned-date content via scheduleOne
 * (critique gate).
 */
export async function progressManagedSchedulesForCompany(
  actor: ActingUser,
  companyId: string,
): Promise<{ scheduled: number; blocked: number; skipped: number }> {
  const zeros = { scheduled: 0, blocked: 0, skipped: 0 };

  const company = await getCompany(companyId);
  if (!company?.profile.managedService) return zeros;

  const level = serviceLevelOf(company);
  if (!canAutoScheduleLevel(level)) return zeros;

  const ready = await collectReadyToSchedule(
    company.tenantId,
    companyId,
    MAX_SCHEDULE_PER_COMPANY,
  );
  if (ready.length === 0) return zeros;

  let scheduled = 0;
  let blocked = 0;
  let skipped = 0;

  for (const item of ready) {
    if (!item.date) {
      skipped += 1;
      continue;
    }
    try {
      await scheduleOne({
        contentId: item.contentId,
        platform: item.platform,
        date: item.date,
        time: item.time ?? undefined,
        userId: actor.id,
        tenantId: company.tenantId,
      });
      await logAction(actor, "managed_schedule.auto_scheduled", {
        targetType: "content",
        targetId: item.contentId,
        companyId,
        detail: `platform=${item.platform} date=${item.date} source=${item.source}:${item.sourceId}`,
      });
      scheduled += 1;
    } catch {
      blocked += 1;
    }
  }

  // One exception email per company per call when anything was blocked — no spam.
  if (blocked > 0) {
    try {
      await notifyClientException({
        tenantId: company.tenantId,
        companyId,
        kind: "schedule_blocked",
        subject: `Scheduling needs attention — ${company.name}`,
        body: `${blocked} approved post(s) could not be scheduled automatically and need a quick review before they go on the calendar.`,
      });
    } catch {
      /* notify is best-effort */
    }
  }

  return { scheduled, blocked, skipped };
}

/**
 * Progress ready schedules for up to MAX_COMPANIES_PER_TICK managed companies
 * (fully_managed | managed_exceptions) in the tenant. Returns total scheduled.
 */
export async function progressManagedSchedulesForTenant(
  actor: ActingUser,
  tenantId: string,
): Promise<number> {
  const companies = await listCompanies(tenantId);
  const managed = companies.filter(
    (c) =>
      c.status !== "archived" &&
      canAutoScheduleLevel(c.profile.managedService?.serviceLevel ?? null),
  );

  let totalScheduled = 0;
  let processed = 0;

  for (const company of managed) {
    if (processed >= MAX_COMPANIES_PER_TICK) break;
    const result = await progressManagedSchedulesForCompany(actor, company.id);
    totalScheduled += result.scheduled;
    processed += 1;
  }

  return totalScheduled;
}
