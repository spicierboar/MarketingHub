// Rolling 30-day calendar maintainer for managed-service companies.
//
// HARD RULES:
//   • Surfaces calendar ASSIST suggestions only (surfaceCalendarAssistSuggestions)
//   • NEVER scheduleOne / publish / auto-spend
//   • Critique gate and approval policies remain untouched

import { logAction } from "@/lib/audit";
import { surfaceCalendarAssistSuggestions } from "@/lib/ai/calendar-assist";
import { detectCalendarGap } from "@/lib/calendar-intelligence";
import { addDaysIso } from "@/lib/calendar-utils";
import {
  getCompany,
  listCalendarAssistSuggestions,
  listCompanies,
  listManagedDeliveryRuns,
  listScheduledPosts,
} from "@/lib/db";
import type { ActingUser, Company, ManagedDeliveryPhase } from "@/lib/types";

export const FORWARD_DAYS = 30;

/** Minimum planned items (scheduled posts + open assists) in the forward window. */
const PLANNED_THRESHOLD = 4;

/** Cap how many companies we top up per scheduler tick. */
const MAX_COMPANIES_PER_TICK = 10;

const ACTIVE_MANAGED_PHASES: ReadonlySet<ManagedDeliveryPhase> = new Set([
  "queued",
  "validating",
  "analysing",
  "strategy",
  "calendar",
  "content",
  "awaiting_approval",
  "active",
]);

function todayIsoDefault(): string {
  return new Date().toISOString().slice(0, 10);
}

function horizonEnd(todayIso: string): string {
  return addDaysIso(todayIso, FORWARD_DAYS);
}

function inHorizon(dateIso: string, todayIso: string): boolean {
  const end = horizonEnd(todayIso);
  return dateIso >= todayIso && dateIso <= end;
}

/**
 * Count scheduled posts + open calendar-assist suggestions whose date falls in
 * [today, today+FORWARD_DAYS].
 */
export async function countPlannedHorizon(
  tenantId: string,
  companyId: string,
  todayIso: string,
): Promise<number> {
  const posts = (await listScheduledPosts(tenantId)).filter(
    (p) =>
      p.companyId === companyId &&
      (p.status === "scheduled" || p.status === "publishing") &&
      inHorizon(p.scheduledDate, todayIso),
  );
  const open = (await listCalendarAssistSuggestions(tenantId, [companyId], "open")).filter(
    (s) => inHorizon(s.proposedDate, todayIso),
  );
  return posts.length + open.length;
}

/**
 * True when the forward horizon is thin (< threshold) or calendar-intelligence
 * reports a gap.
 */
export async function companyNeedsCalendarTopUp(
  tenantId: string,
  companyId: string,
  todayIso: string,
): Promise<boolean> {
  const planned = await countPlannedHorizon(tenantId, companyId, todayIso);
  if (planned < PLANNED_THRESHOLD) return true;

  const posts = (await listScheduledPosts(tenantId)).filter((p) => p.companyId === companyId);
  const gap = detectCalendarGap(posts, companyId, todayIso, FORWARD_DAYS);
  return gap !== null;
}

function isManagedEligible(company: Company, managedCompanyIds: Set<string>): boolean {
  if (company.status === "archived") return false;
  if (company.profile.managedService) return true;
  return managedCompanyIds.has(company.id);
}

/**
 * Top up one company's rolling calendar with assist suggestions only.
 * Returns how many new suggestions were created.
 */
export async function maintainRollingCalendarForCompany(
  actor: ActingUser,
  companyId: string,
): Promise<{ suggestionsAdded: number }> {
  const company = await getCompany(companyId);
  // Prefer managedService settings; any non-archived company is allowed when
  // called directly (tenant tick filters eligibility).
  if (!company || company.status === "archived") {
    return { suggestionsAdded: 0 };
  }

  const suggestionsAdded = await surfaceCalendarAssistSuggestions(
    company.tenantId,
    actor.id,
    { companyIds: [companyId] },
  );

  await logAction(actor, "managed_calendar.topped_up", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: `suggestionsAdded=${suggestionsAdded}`,
  });

  return { suggestionsAdded };
}

/**
 * For each eligible managed company that needs a top-up, surface assist
 * suggestions. Caps work per tick. Returns total suggestions added.
 */
export async function maintainRollingCalendarsForTenant(
  actor: ActingUser,
  tenantId: string,
): Promise<number> {
  const todayIso = todayIsoDefault();
  const companies = await listCompanies(tenantId);
  const runs = await listManagedDeliveryRuns(tenantId);
  const managedCompanyIds = new Set(
    runs
      .filter((r) => ACTIVE_MANAGED_PHASES.has(r.phase))
      .map((r) => r.companyId),
  );

  const eligible = companies.filter((c) => isManagedEligible(c, managedCompanyIds));
  let suggestionsAdded = 0;
  let processed = 0;

  for (const company of eligible) {
    if (processed >= MAX_COMPANIES_PER_TICK) break;
    if (!(await companyNeedsCalendarTopUp(tenantId, company.id, todayIso))) continue;

    const result = await maintainRollingCalendarForCompany(actor, company.id);
    suggestionsAdded += result.suggestionsAdded;
    processed += 1;
  }

  return suggestionsAdded;
}
