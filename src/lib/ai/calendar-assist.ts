// AI 30-day calendar assist (W1 M22)
import { draftContent } from "@/lib/ai/draft";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiBudget } from "@/lib/ai/budget";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import {
  createCalendarAssistSuggestion,
  createContent,
  getCompany,
  listCalendarAssistSuggestions,
  listCompanies,
  listScheduledPosts,
  updateCalendarAssistSuggestion,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  detectCalendarGap,
  detectPublishingCadence,
  optimalPostWindows,
  seasonalPromptsForMonth,
  type OptimalPostWindow,
} from "@/lib/calendar-intelligence";
import { addDaysIso } from "@/lib/calendar-utils";
import type {
  CalendarAssistSuggestion,
  Company,
  GroundingLabel,
  ScheduledPost,
  User,
} from "@/lib/types";

export type CalendarAssistSuggestionDraft = Omit<
  CalendarAssistSuggestion,
  "id" | "createdAt" | "tenantId" | "companyId" | "createdById" | "status"
>;

const DEFAULT_PLATFORMS = ["Facebook", "Instagram", "Google Business Profile"];
const SCAN_LOOKAHEAD_DAYS = 30;
const MAX_SUGGESTIONS_PER_SCAN = 8;

function addDays(iso: string, days: number): string {
  return addDaysIso(iso, days);
}

function monthKeysInRange(startIso: string, days: number): string[] {
  const keys = new Set<string>();
  for (let i = 0; i <= days; i += 1) keys.add(addDays(startIso, i).slice(0, 7));
  return [...keys];
}

function pickPlatform(company: Company, windows: OptimalPostWindow[]): string {
  const match = windows.find((w) => w.companyId === company.id || !w.companyId);
  return match?.platform ?? DEFAULT_PLATFORMS[0];
}

function pickTime(windows: OptimalPostWindow[], platform: string, dow: string): string | undefined {
  const match = windows.find(
    (w) => w.platform.toLowerCase() === platform.toLowerCase() && w.dayOfWeek === dow,
  );
  return match?.timeStart;
}

function dayOfWeekFromIso(iso: string): string {
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DOW[new Date(iso + "T12:00:00Z").getUTCDay()];
}

export function buildCalendarAssistDrafts(args: {
  company: Company;
  todayIso: string;
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[];
  windows: OptimalPostWindow[];
}): CalendarAssistSuggestionDraft[] {
  const { company, todayIso, posts, windows } = args;
  const industries = company.profile.industry ? [company.profile.industry] : [];
  const drafts: CalendarAssistSuggestionDraft[] = [];
  const usedDates = new Set<string>();

  for (const monthKey of monthKeysInRange(todayIso, SCAN_LOOKAHEAD_DAYS)) {
    for (const p of seasonalPromptsForMonth(monthKey, industries)) {
      if (p.date < todayIso || p.date > addDays(todayIso, SCAN_LOOKAHEAD_DAYS)) continue;
      if (usedDates.has(p.date)) continue;
      const platform = pickPlatform(company, windows);
      drafts.push({
        kind: "seasonal_prompt",
        title: p.title,
        brief: p.prompt,
        proposedDate: p.date,
        proposedTime: pickTime(windows, platform, dayOfWeekFromIso(p.date)),
        platform,
        requestType: "social_post",
        evidence: [{ signal: "seasonal_prompt", observed: `${p.category}: ${p.title} on ${p.date}` }],
        priority: p.priority === "high" ? 90 : p.priority === "medium" ? 70 : 50,
      });
      usedDates.add(p.date);
      if (drafts.length >= MAX_SUGGESTIONS_PER_SCAN) return drafts;
    }
  }

  const gap = detectCalendarGap(posts, company.id, todayIso, 14);
  if (gap) {
    const fillDate = addDays(todayIso, Math.min(7, Math.max(3, gap.gapDays)));
    if (!usedDates.has(fillDate)) {
      const platform = pickPlatform(company, windows);
      drafts.push({
        kind: "calendar_gap",
        title: "Fill upcoming calendar gap",
        brief: `Only ${gap.scheduledCount} post(s) scheduled in the next ${gap.lookaheadDays} days (target ${gap.minExpected}+).`,
        proposedDate: fillDate,
        proposedTime: pickTime(windows, platform, dayOfWeekFromIso(fillDate)),
        platform,
        requestType: "social_post",
        evidence: [{ signal: "calendar_gap", observed: `${gap.scheduledCount}/${gap.minExpected}; gap ${gap.gapDays}d` }],
        priority: 85,
      });
      usedDates.add(fillDate);
    }
  }

  const cadence = detectPublishingCadence(posts, company.id, todayIso, 30);
  if (cadence) {
    const fillDate = addDays(todayIso, 4);
    if (!usedDates.has(fillDate)) {
      const platform = pickPlatform(company, windows);
      drafts.push({
        kind: "cadence_fill",
        title: "Boost publishing cadence",
        brief: `Only ${cadence.publishedCount} published in last ${cadence.lookbackDays} days (target ${cadence.minExpected}+).`,
        proposedDate: fillDate,
        proposedTime: pickTime(windows, platform, dayOfWeekFromIso(fillDate)),
        platform,
        requestType: "social_post",
        evidence: [{ signal: "publishing_cadence", observed: `${cadence.publishedCount}/${cadence.minExpected}` }],
        priority: 80,
      });
      usedDates.add(fillDate);
    }
  }

  return drafts.sort((a, b) => b.priority - a.priority || a.proposedDate.localeCompare(b.proposedDate));
}

export async function surfaceCalendarAssistSuggestions(
  tenantId: string,
  userId: string,
  opts?: { companyIds?: string[]; todayIso?: string },
): Promise<number> {
  await assertAiBudget(tenantId);
  const companies = (await listCompanies(tenantId)).filter(
    (c) => !opts?.companyIds?.length || opts.companyIds.includes(c.id),
  );
  const todayIso = opts?.todayIso ?? new Date().toISOString().slice(0, 10);
  const allPosts = await listScheduledPosts(tenantId);
  let created = 0;

  for (const company of companies) {
    const existing = await listCalendarAssistSuggestions(tenantId, [company.id], "open");
    const existingKeys = new Set(existing.map((s) => `${s.kind}|${s.proposedDate}|${s.title.toLowerCase()}`));
    const windows = await optimalPostWindows(tenantId, { companyIds: [company.id], limit: 4 });
    const drafts = buildCalendarAssistDrafts({ company, todayIso, posts: allPosts.filter((p) => p.companyId === company.id), windows });

    for (const draft of drafts) {
      const key = `${draft.kind}|${draft.proposedDate}|${draft.title.toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      const aiRun = await recordAiUsage({
        tenantId,
        companyId: company.id,
        userId,
        kind: "calendar_assist_scan",
        model: "calendar-assist-v1",
        promptSummary: `Surface ${draft.kind}: ${draft.title}`.slice(0, 120),
        outputChars: draft.brief.length,
        sourcesUsed: draft.evidence.map((e) => e.signal),
      });
      await createCalendarAssistSuggestion({ ...draft, tenantId, companyId: company.id, status: "open", createdById: userId, aiRunId: aiRun.id });
      existingKeys.add(key);
      created += 1;
    }
  }
  return created;
}

export async function acceptCalendarAssistSuggestion(
  suggestion: CalendarAssistSuggestion,
  user: Pick<User, "id" | "email" | "tenantId">,
): Promise<string> {
  const company = await getCompany(suggestion.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== user.tenantId) throw new Error("Tenant mismatch");
  await assertAiBudget(company.tenantId);
  const draft = await draftContent({
    company,
    requestType: suggestion.requestType,
    topic: suggestion.title,
    objective: suggestion.brief,
    platform: suggestion.platform,
  });
  const compliance = await checkCompliance(draft.body, company);
  const claimAudit = await auditClaims(draft.body, company);
  const groundingLabel: GroundingLabel = claimAudit.some((c) => c.status === "unsupported")
    ? "requires_evidence"
    : draft.sourceRefs.length > 0
      ? "grounded"
      : "suggested_by_ai";
  const aiRun = await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "calendar_assist_accept",
    model: draft.model,
    promptSummary: `Accept ${suggestion.kind}: ${suggestion.title}`.slice(0, 120),
    outputChars: draft.body.length,
    sourcesUsed: draft.sources,
  });
  const content = await createContent({
    companyId: company.id,
    requestId: null,
    type: suggestion.requestType,
    title: draft.title,
    body: draft.body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    groundingLabel,
    sourceRefs: draft.sourceRefs,
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: draft.model,
    aiPrompt: suggestion.brief,
    sourcesUsed: draft.sources,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
  });
  await updateCalendarAssistSuggestion(suggestion.id, {
    status: "accepted",
    acceptedAt: new Date().toISOString(),
    resultContentId: content.id,
    aiRunId: aiRun.id,
  });
  await logAction(user, "calendar_assist.accepted", {
    targetType: "calendar_assist_suggestion",
    targetId: suggestion.id,
    companyId: company.id,
    detail: `ai_draft:${content.id}`,
  });
  return content.id;
}

export async function dismissCalendarAssistSuggestion(
  suggestion: CalendarAssistSuggestion,
  user: Pick<User, "id" | "email" | "tenantId">,
  reason?: string,
): Promise<void> {
  const aiRun = await recordAiUsage({
    tenantId: suggestion.tenantId,
    companyId: suggestion.companyId,
    userId: user.id,
    kind: "calendar_assist_dismiss",
    model: "calendar-assist-v1",
    promptSummary: `Dismiss ${suggestion.kind}: ${suggestion.title}`.slice(0, 120),
    outputChars: (reason ?? suggestion.title).length,
    sourcesUsed: suggestion.evidence.map((e) => e.signal),
  });
  await updateCalendarAssistSuggestion(suggestion.id, {
    status: "dismissed",
    dismissedAt: new Date().toISOString(),
    dismissReason: reason || null,
    aiRunId: aiRun.id,
  });
  await logAction(user, "calendar_assist.dismissed", {
    targetType: "calendar_assist_suggestion",
    targetId: suggestion.id,
    companyId: suggestion.companyId,
    detail: reason ? `${suggestion.title} — ${reason}` : suggestion.title,
  });
}

export async function assistAcceptedContentNotScheduled(tenantId: string, contentId: string): Promise<boolean> {
  const posts = await listScheduledPosts(tenantId);
  return !posts.some((p) => p.contentId === contentId && p.status !== "cancelled");
}

export async function listOpenCalendarAssistForTenant(
  tenantId: string,
  companyIds?: string[],
  limit = 12,
): Promise<CalendarAssistSuggestion[]> {
  const open = await listCalendarAssistSuggestions(tenantId, companyIds, "open");
  return open.slice(0, limit);
}
