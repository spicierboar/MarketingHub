// Managed auto-progress: critique-gated scheduling of already-approved content.
//
// HARD RULES:
//   • ALWAYS goes through scheduleOne (critiqueForPublish inside) — never bypass
//   • NEVER auto-spend or activate promotions
//   • Only when canAutoExecuteLowRisk(level, "schedule_approved") — fully_managed
//   • Live publish flags stay OFF; demo still creates scheduled_post rows

import { logAction } from "@/lib/audit";
import { listAssistReadyToSchedule } from "@/lib/ai/calendar-assist";
import { getCompany, listCompanies } from "@/lib/db";
import {
  canAutoExecuteLowRisk,
} from "@/lib/managed-service/authority";
import { notifyClientException } from "@/lib/managed-service/exception-notify";
import { scheduleOne } from "@/lib/scheduling";
import type { ActingUser, ManagedServiceLevel } from "@/lib/types";

/** Cap how many fully_managed companies we progress per tenant tick. */
const MAX_COMPANIES_PER_TICK = 10;

function serviceLevelOf(company: {
  profile: { managedService?: { serviceLevel?: ManagedServiceLevel } };
}): ManagedServiceLevel | null {
  return company.profile.managedService?.serviceLevel ?? null;
}

/**
 * For one fully_managed company: schedule assist-ready approved content via
 * scheduleOne (critique gate). Returns counts of scheduled / blocked / skipped.
 */
export async function progressManagedSchedulesForCompany(
  actor: ActingUser,
  companyId: string,
): Promise<{ scheduled: number; blocked: number; skipped: number }> {
  const zeros = { scheduled: 0, blocked: 0, skipped: 0 };

  const company = await getCompany(companyId);
  if (!company?.profile.managedService) return zeros;

  const level = serviceLevelOf(company);
  if (level !== "fully_managed") return zeros;
  if (!canAutoExecuteLowRisk(level, "schedule_approved")) return zeros;

  const ready = await listAssistReadyToSchedule(company.tenantId, [companyId], 8);
  if (ready.length === 0) return zeros;

  let scheduled = 0;
  let blocked = 0;
  let skipped = 0;

  for (const item of ready) {
    const { suggestion, contentId, platform } = item;
    if (!suggestion.proposedDate) {
      skipped += 1;
      continue;
    }
    try {
      await scheduleOne({
        contentId,
        platform,
        date: suggestion.proposedDate,
        time: suggestion.proposedTime,
        userId: actor.id,
        tenantId: company.tenantId,
      });
      await logAction(actor, "managed_schedule.auto_scheduled", {
        targetType: "content",
        targetId: contentId,
        companyId,
        detail: `platform=${platform} date=${suggestion.proposedDate} assist=${suggestion.id}`,
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
 * Progress assist-ready schedules for up to MAX_COMPANIES_PER_TICK fully_managed
 * companies in the tenant. Returns total scheduled count.
 */
export async function progressManagedSchedulesForTenant(
  actor: ActingUser,
  tenantId: string,
): Promise<number> {
  const companies = await listCompanies(tenantId);
  const fullyManaged = companies.filter(
    (c) =>
      c.status !== "archived" &&
      c.profile.managedService?.serviceLevel === "fully_managed",
  );

  let totalScheduled = 0;
  let processed = 0;

  for (const company of fullyManaged) {
    if (processed >= MAX_COMPANIES_PER_TICK) break;
    const result = await progressManagedSchedulesForCompany(actor, company.id);
    totalScheduled += result.scheduled;
    processed += 1;
  }

  return totalScheduled;
}
