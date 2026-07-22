// AI 30-day calendar assist (W1 M22)
import { draftContent } from "@/lib/ai/draft";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiBudget } from "@/lib/ai/budget";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import {
  createCalendarAssistSuggestion,
  createContent,
  getCompany,
  getContent,
  listAdCampaigns,
  listCalendarAssistSuggestions,
  listCompanies,
  listScheduledPosts,
  updateCalendarAssistSuggestion,
  updateContent,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  companyRelevanceContext,
  detectCalendarGap,
  detectPublishingCadence,
  optimalPostWindows,
  seasonalPromptsForMonth,
  type OptimalPostWindow,
} from "@/lib/calendar-intelligence";
import { addDaysIso } from "@/lib/calendar-utils";
import { campaignLocationBrief } from "@/lib/campaign-location";
import type {
  ActingUser,
  AdCampaign,
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

/** Map paid platform → organic channel for flanking posts. */
function organicPlatformForAd(campaign: AdCampaign, windows: OptimalPostWindow[]): string {
  if (campaign.platform === "google_ads") {
    return (
      windows.find((w) => /google|gbp/i.test(w.platform))?.platform ??
      "Google Business Profile"
    );
  }
  return (
    windows.find((w) => /facebook|instagram|meta/i.test(w.platform))?.platform ?? "Facebook"
  );
}

function objectiveCue(objective: AdCampaign["objective"]): string {
  switch (objective) {
    case "leads":
      return "Drive enquiries — clear CTA, same offer as the ad";
    case "traffic":
      return "Send people to the same landing / offer as the ad";
    case "sales":
      return "Push the same product or offer the ad is selling";
    case "awareness":
    default:
      return "Echo the ad theme so organic and paid feel like one campaign";
  }
}

/**
 * Suggest organic posts that flank active (or soon-active) paid campaigns.
 * Suggest-only — never schedules or spends. Works with simulated ads while ADS_LIVE is off.
 */
export function buildAdAlignmentDrafts(args: {
  company: Company;
  ads: AdCampaign[];
  todayIso: string;
  windows: OptimalPostWindow[];
  usedDates?: Set<string>;
}): CalendarAssistSuggestionDraft[] {
  const { company, ads, todayIso, windows } = args;
  const usedDates = args.usedDates ?? new Set<string>();
  const horizon = addDays(todayIso, SCAN_LOOKAHEAD_DAYS);
  const drafts: CalendarAssistSuggestionDraft[] = [];

  const relevant = ads.filter((c) => {
    if (c.companyId !== company.id) return false;
    if (c.status === "ended" || c.status === "paused") return false;
    // active now, or draft/active starting within the scan window
    if (c.status === "active") return true;
    if (c.status === "draft" && c.startDate >= todayIso && c.startDate <= horizon) return true;
    return false;
  });

  for (const ad of relevant) {
    const platform = organicPlatformForAd(ad, windows);
    const start = ad.startDate < todayIso ? todayIso : ad.startDate;
    const end = ad.endDate && ad.endDate <= horizon ? ad.endDate : addDays(start, 14);

    // Flanking slots: day before launch (or today if already live), mid-flight, near end
    const slots: { date: string; role: string; priority: number }[] = [];
    const dayBefore = addDays(ad.startDate, -1);
    if (dayBefore >= todayIso && dayBefore <= horizon) {
      slots.push({ date: dayBefore, role: "teaser before ad launch", priority: 95 });
    }
    if (start >= todayIso && start <= horizon) {
      slots.push({ date: start, role: "launch-day organic support", priority: 92 });
    }
    const mid = addDays(start, 5);
    if (mid >= todayIso && mid <= horizon && mid <= end) {
      slots.push({ date: mid, role: "mid-flight reinforcement", priority: 88 });
    }
    if (ad.endDate) {
      const wrap = addDays(ad.endDate, -1);
      if (wrap >= todayIso && wrap <= horizon && wrap > start) {
        slots.push({ date: wrap, role: "last-chance organic push", priority: 86 });
      }
    }

    for (const slot of slots) {
      if (usedDates.has(slot.date)) continue;
      if (drafts.length >= 4) break; // cap ad-alignment per company per scan
      drafts.push({
        kind: "ad_alignment",
        title: `Support ad: ${ad.name}`,
        brief: `${slot.role} for paid “${ad.name}” (${ad.platform.replace(/_/g, " ")}, ${ad.objective}). ${objectiveCue(ad.objective)}. Match the ad theme and CTA; do not invent claims. Suggest-only — approve before scheduling.`,
        proposedDate: slot.date,
        proposedTime: pickTime(windows, platform, dayOfWeekFromIso(slot.date)),
        platform,
        requestType: "social_post",
        evidence: [
          {
            signal: "ad_alignment",
            observed: `${ad.status} ${ad.platform} “${ad.name}” ${ad.startDate}${ad.endDate ? `→${ad.endDate}` : ""} · ${slot.role}`,
          },
        ],
        priority: slot.priority,
      });
      usedDates.add(slot.date);
    }
  }

  return drafts;
}

export function buildCalendarAssistDrafts(args: {
  company: Company;
  todayIso: string;
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[];
  windows: OptimalPostWindow[];
  ads?: AdCampaign[];
}): CalendarAssistSuggestionDraft[] {
  const { company, todayIso, posts, windows, ads = [] } = args;
  const relevance = companyRelevanceContext(company);
  const drafts: CalendarAssistSuggestionDraft[] = [];
  const usedDates = new Set<string>();

  // Paid alignment first — highest commercial priority when ads are running
  for (const d of buildAdAlignmentDrafts({ company, ads, todayIso, windows, usedDates })) {
    drafts.push(d);
    if (drafts.length >= MAX_SUGGESTIONS_PER_SCAN) {
      return drafts.sort((a, b) => b.priority - a.priority || a.proposedDate.localeCompare(b.proposedDate));
    }
  }

  for (const monthKey of monthKeysInRange(todayIso, SCAN_LOOKAHEAD_DAYS)) {
    for (const p of seasonalPromptsForMonth(monthKey, relevance, { relevantOnly: true })) {
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
  const allAds = await listAdCampaigns(tenantId);
  let created = 0;

  for (const company of companies) {
    const existing = await listCalendarAssistSuggestions(tenantId, [company.id], "open");
    const existingKeys = new Set(existing.map((s) => `${s.kind}|${s.proposedDate}|${s.title.toLowerCase()}`));
    const windows = await optimalPostWindows(tenantId, { companyIds: [company.id], limit: 4 });
    const drafts = buildCalendarAssistDrafts({
      company,
      todayIso,
      posts: allPosts.filter((p) => p.companyId === company.id),
      windows,
      ads: allAds.filter((a) => a.companyId === company.id),
    });

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

/** Accepted assist drafts that are approved and not yet scheduled — eligible for "Schedule at best time". */
export async function listAssistReadyToSchedule(
  tenantId: string,
  companyIds?: string[],
  limit = 8,
): Promise<
  {
    suggestion: CalendarAssistSuggestion;
    contentId: string;
    contentTitle: string;
    platform: string;
  }[]
> {
  const accepted = await listCalendarAssistSuggestions(tenantId, companyIds, "accepted");
  const ready: {
    suggestion: CalendarAssistSuggestion;
    contentId: string;
    contentTitle: string;
    platform: string;
  }[] = [];

  for (const suggestion of accepted) {
    if (!suggestion.resultContentId) continue;
    const content = await getContent(suggestion.resultContentId);
    if (!content || content.status !== "approved") continue;
    if (!(await assistAcceptedContentNotScheduled(tenantId, content.id))) continue;
    ready.push({
      suggestion,
      contentId: content.id,
      contentTitle: content.title,
      platform: suggestion.platform,
    });
    if (ready.length >= limit) break;
  }
  return ready;
}

/** Cap auto-accept → draft → quality-route per company / tick slice. */
export const MAX_AUTO_DRAFT_ASSISTS_PER_PASS = 10;

/**
 * Auto-accept open calendar-assist suggestions into ai_draft content, then
 * apply quality routing. Never schedules or publishes — critique/scheduleOne
 * gates remain untouched. Caller must already have checked
 * canAutoExecuteLowRisk(level, "draft_content").
 */
export async function autoDraftOpenCalendarAssistSuggestions(
  actor: ActingUser,
  companyId: string,
  opts?: { limit?: number; origin?: string },
): Promise<{ accepted: number; routed: number; failed: number }> {
  const limit = Math.max(0, opts?.limit ?? MAX_AUTO_DRAFT_ASSISTS_PER_PASS);
  if (limit === 0) return { accepted: 0, routed: 0, failed: 0 };

  const company = await getCompany(companyId);
  if (!company || company.tenantId !== actor.tenantId) {
    return { accepted: 0, routed: 0, failed: 0 };
  }

  const open = await listCalendarAssistSuggestions(company.tenantId, [companyId], "open");
  const slice = open.slice(0, limit);
  const origin =
    opts?.origin?.trim().replace(/\/+$/, "") ||
    process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000";

  // Lazy import avoids a hard cycle (quality-routing ↔ calendar-assist callers).
  const { applyQualityRoutingAfterDraft } = await import(
    "@/lib/managed-service/quality-routing"
  );
  const {
    createManagedConceptBundle,
    ensureQuarterlyStrategyCycle,
  } = await import("@/lib/managed-service/workflow-service");
  const { managedChannelKeyFromLabel } = await import(
    "@/lib/managed-service/workflow"
  );

  let accepted = 0;
  let routed = 0;
  let failed = 0;

  for (const suggestion of slice) {
    try {
      const contentId = await acceptCalendarAssistSuggestion(suggestion, actor);
      accepted += 1;
      try {
        const content = await getContent(contentId);
        if (content) {
          const rawPackage =
            company.profile.managedService?.serviceBilling?.activePackageId ??
            company.profile.managedService?.marketingPackageId ??
            "starter";
          const packageId =
            rawPackage === "managed" || rawPackage === "blast"
              ? "managed"
              : rawPackage === "growth" ||
                  rawPackage === "pro" ||
                  rawPackage === "custom"
                ? "growth"
                : "starter";
          const channelKey = managedChannelKeyFromLabel(suggestion.platform);
          const cycle = await ensureQuarterlyStrategyCycle({
            company,
            packageId,
            goals: [suggestion.brief || suggestion.title],
            seasonalInputs: [
              campaignLocationBrief(company.profile) ||
                company.profile.localMarketNotes ||
                "No seasonal constraints confirmed for this quarter",
            ],
            profileConfirmedAt: company.updatedAt,
            channels: [channelKey],
            themes: [suggestion.title],
            publishWindows: [suggestion.proposedTime || "11:00"],
          });
          const concept = await createManagedConceptBundle({
            tenantId: company.tenantId,
            companyId: company.id,
            strategyCycleId: cycle.id,
            packagePeriod: suggestion.proposedDate.slice(0, 7),
            unitKey: `calendar-assist-${suggestion.id}`,
            title: content.title,
            theme: suggestion.title,
            adaptations: [
              {
                channelKey,
                copy: content.body,
                plannedPublishAt: new Date(
                  `${suggestion.proposedDate}T${suggestion.proposedTime || "11:00"}:00.000Z`,
                ).toISOString(),
              },
            ],
          });
          await updateContent(content.id, {
            managedConceptId: concept.id,
            managedChannelKey: channelKey,
          });
        }
        await applyQualityRoutingAfterDraft({
          contentId,
          actor,
          origin,
          platform: suggestion.platform,
        });
        routed += 1;
      } catch {
        // Draft still created; routing failure is non-fatal for this pass.
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  if (accepted > 0) {
    await logAction(actor, "calendar_assist.auto_drafted", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `accepted=${accepted} routed=${routed} failed=${failed}`,
    });
  }

  return { accepted, routed, failed };
}
