// Calendar intelligence (V1 module 4) — seasonal prompts, analytics-informed
// optimal post windows, and agency portfolio filtering.
//
// No live external APIs: AU-aware defaults + deterministic analytics from the
// existing simulated metrics spine. Uses tenant timezone (resolveQueueClock) for
// "today" and local-time hints.

import {
  listCompanies,
  listContent,
  listScheduledPosts,
  type Tenant,
} from "@/lib/db";
import { metricsForPost } from "@/lib/analytics";
import { AU_HOLIDAYS } from "@/lib/calendar-utils";
import type { CalendarEntry } from "@/lib/calendar-utils";
import { resolveQueueClock, type QueueClock } from "@/lib/tenant-timezone";
import type { Company, ScheduledPost } from "@/lib/types";

// ---- seasonal / holiday / local-event prompts --------------------------------

export type PromptCategory = "holiday" | "seasonal" | "local" | "industry";

export interface SeasonalPrompt {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  category: PromptCategory;
  prompt: string;
  /** Lowercase industry keywords this prompt is especially relevant to. */
  industries: string[];
  priority: "high" | "medium" | "low";
}

/** Fixed AU calendar moments beyond public holidays (approximate dates). */
const AU_SEASONAL_EVENTS: Omit<SeasonalPrompt, "id">[] = [
  {
    date: "01-14",
    title: "Back to school",
    category: "seasonal",
    prompt:
      "Families are settling into school routines — promote lunchbox fillers, after-school snacks, or family meal deals.",
    industries: ["supermarket", "grocery", "convenience", "cafe", "food"],
    priority: "medium",
  },
  {
    date: "02-14",
    title: "Valentine's Day",
    category: "seasonal",
    prompt:
      "Run a Valentine's offer — flowers, dining packages, gift hampers, or date-night bookings.",
    industries: ["florist", "retail", "cafe", "food", "accommodation", "hospitality"],
    priority: "high",
  },
  {
    date: "03-08",
    title: "International Women's Day",
    category: "seasonal",
    prompt:
      "Celebrate local women in business — staff spotlights, community partnerships, or a limited offer.",
    industries: ["retail", "cafe", "health", "dental", "florist"],
    priority: "low",
  },
  {
    date: "04-25",
    title: "Anzac Day",
    category: "holiday",
    prompt:
      "Acknowledge respectfully — dawn service attendance, tradie-friendly hours, or a quiet community post (no hard sell).",
    industries: ["cafe", "food", "accommodation", "retail", "supermarket"],
    priority: "medium",
  },
  {
    date: "05-11",
    title: "Mother's Day (AU)",
    category: "seasonal",
    prompt:
      "Mother's Day is approaching — gift bundles, brunch bookings, spa packages, or last-minute pickup offers.",
    industries: ["florist", "retail", "cafe", "food", "accommodation", "hospitality"],
    priority: "high",
  },
  {
    date: "06-30",
    title: "EOFY",
    category: "seasonal",
    prompt:
      "End of financial year — tax-time services, EOFY clearance sales, or B2B account renewals.",
    industries: ["retail", "supermarket", "health", "dental", "convenience"],
    priority: "medium",
  },
  {
    date: "07-01",
    endDate: "07-20",
    title: "Winter school holidays",
    category: "seasonal",
    prompt:
      "School holidays are on — family packages, kids-eat-free, rainy-day activities, or road-trip stopover deals.",
    industries: ["accommodation", "hospitality", "cafe", "food", "retail", "supermarket"],
    priority: "high",
  },
  {
    date: "09-01",
    title: "Father's Day (AU)",
    category: "seasonal",
    prompt:
      "Father's Day — gift ideas, pub lunch specials, or experience vouchers.",
    industries: ["retail", "cafe", "food", "florist", "accommodation"],
    priority: "high",
  },
  {
    date: "09-20",
    endDate: "09-30",
    title: "AFL / NRL finals",
    category: "local",
    prompt:
      "Grand final season — game-day catering, watch-party bookings, or team-colour promotions.",
    industries: ["cafe", "food", "retail", "supermarket", "convenience"],
    priority: "medium",
  },
  {
    date: "10-01",
    endDate: "10-31",
    title: "Spring events & wine region",
    category: "local",
    prompt:
      "Spring festivals and cellar-door weekends — promote regional stays, group bookings, and event tie-ins.",
    industries: ["accommodation", "hospitality", "cafe", "food"],
    priority: "medium",
  },
  {
    date: "11-04",
    title: "Melbourne Cup",
    category: "local",
    prompt:
      "Melbourne Cup day — luncheon packages, fascinator promos, or long-weekend getaway bundles.",
    industries: ["cafe", "food", "accommodation", "hospitality", "florist"],
    priority: "medium",
  },
  {
    date: "11-28",
    title: "Black Friday",
    category: "seasonal",
    prompt:
      "Black Friday / Cyber Monday — tease early-access lists, bundle deals, and click-and-collect.",
    industries: ["retail", "supermarket", "convenience", "florist"],
    priority: "high",
  },
  {
    date: "12-01",
    endDate: "12-24",
    title: "Christmas retail rush",
    category: "seasonal",
    prompt:
      "Christmas trading — gift guides, extended hours, catering pre-orders, and last-shipping cutoffs.",
    industries: ["retail", "supermarket", "convenience", "florist", "cafe", "food"],
    priority: "high",
  },
  {
    date: "12-26",
    endDate: "01-26",
    title: "Summer peak travel",
    category: "seasonal",
    prompt:
      "Peak summer — direct-booking pushes, pool/outdoor amenities, and highway stopover offers.",
    industries: ["accommodation", "hospitality", "cafe", "food"],
    priority: "high",
  },
];

function isoInMonth(iso: string, monthKey: string): boolean {
  return iso.slice(0, 7) === monthKey;
}

function eventInMonth(ev: { date: string; endDate?: string }, monthKey: string): boolean {
  const [y, m] = monthKey.split("-").map(Number);
  const start = ev.date.length === 5 ? `${monthKey}-${ev.date.slice(3)}` : ev.date;
  if (isoInMonth(start, monthKey)) return true;
  if (ev.endDate) {
    const end =
      ev.endDate.length === 5
        ? ev.endDate < ev.date
          ? `${y + 1}-${ev.endDate}`
          : `${monthKey}-${ev.endDate.slice(3)}`
        : ev.endDate;
    if (isoInMonth(end, monthKey)) return true;
    // Span across month
    const monthStart = `${monthKey}-01`;
    const monthEnd = `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    if (start <= monthEnd && end >= monthStart) return true;
  }
  return false;
}

function resolveEventDate(ev: { date: string }, monthKey: string): string {
  if (ev.date.length === 10) return ev.date;
  return `${monthKey}-${ev.date.slice(3)}`;
}

/** AU public holidays + seasonal/local prompts for a calendar month. */
export function seasonalPromptsForMonth(
  monthKey: string,
  industries?: string[],
): SeasonalPrompt[] {
  const prompts: SeasonalPrompt[] = [];

  for (const [iso, name] of Object.entries(AU_HOLIDAYS)) {
    if (!isoInMonth(iso, monthKey)) continue;
    prompts.push({
      id: `holiday-${iso}`,
      date: iso,
      title: name,
      category: "holiday",
      prompt: `Public holiday (${name}) — adjust hours, acknowledge the day, or plan content around reduced trading.`,
      industries: [],
      priority: "medium",
    });
  }

  for (const ev of AU_SEASONAL_EVENTS) {
    if (!eventInMonth(ev, monthKey)) continue;
    prompts.push({
      id: `seasonal-${ev.title.toLowerCase().replace(/\s+/g, "-")}-${monthKey}`,
      ...ev,
      date: resolveEventDate(ev, monthKey),
    });
  }

  const norm = (industries ?? []).map((i) => i.toLowerCase());
  const scored = prompts.map((p) => {
    if (!norm.length || !p.industries.length) return p;
    const match = p.industries.some((tag) =>
      norm.some((ind) => ind.includes(tag) || tag.includes(ind.split(/\s+/)[0] ?? "")),
    );
    return match
      ? { ...p, priority: p.priority === "low" ? ("medium" as const) : ("high" as const) }
      : p;
  });

  const order = { high: 0, medium: 1, low: 2 };
  return scored.sort(
    (a, b) => order[a.priority] - order[b.priority] || a.date.localeCompare(b.date),
  );
}

// ---- analytics-informed optimal post windows ---------------------------------

export interface OptimalPostWindow {
  platform: string;
  companyId?: string;
  companyName?: string;
  dayOfWeek: string;
  timeStart: string;
  timeEnd: string;
  score: number;
  basis: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Industry fallback windows when published-post sample is thin. */
const INDUSTRY_DEFAULTS: { match: RegExp; windows: Omit<OptimalPostWindow, "platform" | "companyId" | "companyName" | "basis">[] }[] = [
  {
    match: /cafe|food|restaurant/i,
    windows: [
      { dayOfWeek: "Tue", timeStart: "07:30", timeEnd: "09:00", score: 72 },
      { dayOfWeek: "Thu", timeStart: "11:30", timeEnd: "13:00", score: 68 },
      { dayOfWeek: "Sat", timeStart: "08:00", timeEnd: "10:00", score: 75 },
    ],
  },
  {
    match: /supermarket|grocery|convenience|retail/i,
    windows: [
      { dayOfWeek: "Wed", timeStart: "10:00", timeEnd: "12:00", score: 70 },
      { dayOfWeek: "Fri", timeStart: "17:00", timeEnd: "19:00", score: 74 },
      { dayOfWeek: "Sun", timeStart: "09:00", timeEnd: "11:00", score: 66 },
    ],
  },
  {
    match: /accommodation|hospitality|motel|hotel/i,
    windows: [
      { dayOfWeek: "Tue", timeStart: "10:00", timeEnd: "14:00", score: 71 },
      { dayOfWeek: "Sun", timeStart: "18:00", timeEnd: "20:00", score: 69 },
    ],
  },
  {
    match: /health|dental|medical/i,
    windows: [
      { dayOfWeek: "Tue", timeStart: "09:00", timeEnd: "11:00", score: 73 },
      { dayOfWeek: "Wed", timeStart: "12:00", timeEnd: "13:30", score: 67 },
    ],
  },
  {
    match: /florist/i,
    windows: [
      { dayOfWeek: "Thu", timeStart: "12:00", timeEnd: "14:00", score: 72 },
      { dayOfWeek: "Sat", timeStart: "09:00", timeEnd: "11:00", score: 76 },
    ],
  },
];

/** Sensible AU defaults when industry is unknown or unpublished data is thin. */
const GENERIC_DEFAULTS: Omit<OptimalPostWindow, "platform" | "companyId" | "companyName" | "basis">[] = [
  { dayOfWeek: "Tue", timeStart: "10:00", timeEnd: "12:00", score: 65 },
  { dayOfWeek: "Thu", timeStart: "12:00", timeEnd: "14:00", score: 62 },
  { dayOfWeek: "Sat", timeStart: "09:00", timeEnd: "11:00", score: 68 },
];

function parseTimeMinutes(t?: string): number | null {
  if (!t || !/^\d{2}:\d{2}/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function dayOfWeekFromIso(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return DOW[d.getUTCDay()];
}

function hourBucket(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const start = `${String(h).padStart(2, "0")}:00`;
  const end = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`;
  return `${start}-${end}`;
}

interface WindowBucket {
  platform: string;
  companyId: string;
  dow: string;
  hourKey: string;
  engagement: number;
  count: number;
}

/** Derive top post windows from published posts + simulated analytics. */
export async function optimalPostWindows(
  tenantId: string,
  opts?: { companyIds?: string[]; platform?: string; limit?: number },
): Promise<OptimalPostWindow[]> {
  const scope = opts?.companyIds ? new Set(opts.companyIds) : undefined;
  const contentById = new Map((await listContent(tenantId)).map((c) => [c.id, c]));
  const companyById = new Map((await listCompanies(tenantId)).map((c) => [c.id, c]));
  const buckets = new Map<string, WindowBucket>();

  for (const post of await listScheduledPosts(tenantId)) {
    if (post.status !== "published") continue;
    if (scope && !scope.has(post.companyId)) continue;
    if (opts?.platform && !post.platform.toLowerCase().includes(opts.platform.toLowerCase())) {
      continue;
    }
    const minutes = parseTimeMinutes(post.scheduledTime);
    if (minutes === null) continue;
    const content = contentById.get(post.contentId);
    const engagement = metricsForPost(post, content).engagement;
    const dow = dayOfWeekFromIso(post.scheduledDate);
    const hourKey = hourBucket(minutes);
    const key = `${post.companyId}|${post.platform}|${dow}|${hourKey}`;
    const row = buckets.get(key) ?? {
      platform: post.platform,
      companyId: post.companyId,
      dow,
      hourKey,
      engagement: 0,
      count: 0,
    };
    row.engagement += engagement;
    row.count += 1;
    buckets.set(key, row);
  }

  const fromData: OptimalPostWindow[] = [...buckets.values()]
    .map((b) => {
      const [timeStart, timeEnd] = b.hourKey.split("-");
      const company = companyById.get(b.companyId);
      return {
        platform: b.platform,
        companyId: b.companyId,
        companyName: company?.name,
        dayOfWeek: b.dow,
        timeStart,
        timeEnd,
        score: Math.min(99, Math.round(b.engagement / b.count / 10)),
        basis: `From ${b.count} published post(s) — simulated engagement`,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (fromData.length >= 3) {
    return fromData.slice(0, opts?.limit ?? 6);
  }

  // Fallback: industry defaults for scoped companies (or tenant-wide generic).
  const companies = [...companyById.values()].filter((c) => !scope || scope.has(c.id));
  const fallbacks: OptimalPostWindow[] = [];
  for (const company of companies.slice(0, 3)) {
    const ind = company.profile.industry ?? "";
    const pack = INDUSTRY_DEFAULTS.find((d) => d.match.test(ind));
    const windows = pack?.windows ?? GENERIC_DEFAULTS;
    for (const w of windows) {
      fallbacks.push({
        platform: opts?.platform || "Facebook",
        companyId: company.id,
        companyName: company.name,
        ...w,
        basis: pack
          ? `Industry default (${ind}) — publish more to refine`
          : "General default — set industry in Brand Brain to refine",
      });
    }
  }

  const merged = [...fromData, ...fallbacks];
  const seen = new Set<string>();
  const unique = merged.filter((w) => {
    const k = `${w.companyId}|${w.platform}|${w.dayOfWeek}|${w.timeStart}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.slice(0, opts?.limit ?? 6);
}

// ---- portfolio calendar filtering --------------------------------------------

export interface PortfolioCalendarFilters {
  companyId?: string;
  status?: string;
  channel?: string;
  businessType?: string;
  campaignId?: string;
  requestId?: string;
}

export interface EnrichedCalendarEntry extends CalendarEntry {
  businessType: string;
}

/** Normalize company industry for filter matching. */
export function businessTypeLabel(company: Company | undefined): string {
  return (company?.profile.industry ?? "General").trim() || "General";
}

/** Attach business type and apply portfolio filters (client, status, channel, type). */
export function filterPortfolioEntries(
  entries: EnrichedCalendarEntry[],
  filters: PortfolioCalendarFilters,
): EnrichedCalendarEntry[] {
  const ch = (filters.channel ?? "").toLowerCase();
  const bt = filters.businessType?.toLowerCase();
  return entries.filter(
    (e) =>
      (!filters.companyId || e.companyId === filters.companyId) &&
      (!filters.status || e.status === filters.status) &&
      (!ch || e.platform.toLowerCase().includes(ch)) &&
      (!bt || e.businessType.toLowerCase().includes(bt)) &&
      (!filters.campaignId || e.campaignId === filters.campaignId) &&
      (!filters.requestId || e.requestId === filters.requestId),
  );
}

export interface PortfolioSummary {
  total: number;
  scheduled: number;
  planned: number;
  byClient: { companyId: string; name: string; count: number }[];
  byChannel: { channel: string; count: number }[];
  byBusinessType: { type: string; count: number }[];
}

export function portfolioSummary(entries: EnrichedCalendarEntry[]): PortfolioSummary {
  const byClient = new Map<string, { companyId: string; name: string; count: number }>();
  const byChannel = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const e of entries) {
    const c = byClient.get(e.companyId) ?? { companyId: e.companyId, name: e.companyName, count: 0 };
    c.count += 1;
    byClient.set(e.companyId, c);
    byChannel.set(e.platform, (byChannel.get(e.platform) ?? 0) + 1);
    byType.set(e.businessType, (byType.get(e.businessType) ?? 0) + 1);
  }
  return {
    total: entries.length,
    scheduled: entries.filter((e) => e.kind === "post").length,
    planned: entries.filter((e) => e.kind === "item").length,
    byClient: [...byClient.values()].sort((a, b) => b.count - a.count),
    byChannel: [...byChannel.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    byBusinessType: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Distinct business types across visible companies (for filter dropdown). */
export function distinctBusinessTypes(companies: Company[]): string[] {
  return [...new Set(companies.map((c) => businessTypeLabel(c)))].sort();
}

// ---- aggregate bundle for the calendar page ----------------------------------

export interface CalendarIntelligenceBundle {
  clock: QueueClock;
  seasonalPrompts: SeasonalPrompt[];
  optimalWindows: OptimalPostWindow[];
}

export async function buildCalendarIntelligence(
  tenant: Pick<Tenant, "timezone"> | null | undefined,
  tenantId: string,
  monthKey: string,
  opts?: { companyIds?: string[]; industries?: string[]; platform?: string },
): Promise<CalendarIntelligenceBundle> {
  const clock = resolveQueueClock(tenant);
  const seasonalPrompts = seasonalPromptsForMonth(monthKey, opts?.industries);
  const optimalWindows = await optimalPostWindows(tenantId, {
    companyIds: opts?.companyIds,
    platform: opts?.platform,
    limit: 6,
  });
  return { clock, seasonalPrompts, optimalWindows };
}

// ---- calendar gap + publishing cadence (M09 recommendations) -----------------

export interface CalendarGapSignal {
  lookaheadDays: number;
  scheduledCount: number;
  minExpected: number;
  gapDays: number;
  daysSinceLastPublish: number | null;
}

export interface PublishingCadenceSignal {
  lookbackDays: number;
  publishedCount: number;
  minExpected: number;
  daysSinceLastPublish: number | null;
}

function addCalendarDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Upcoming schedule thin vs a weekly cadence target — feeds recommendation engine. */
export function detectCalendarGap(
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[],
  companyId: string,
  todayIso: string,
  lookaheadDays = 14,
): CalendarGapSignal | null {
  const end = addCalendarDays(todayIso, lookaheadDays);
  const upcoming = posts.filter(
    (p) =>
      p.companyId === companyId &&
      ["scheduled", "published"].includes(p.status) &&
      p.scheduledDate >= todayIso &&
      p.scheduledDate <= end,
  );
  const minExpected = Math.max(2, Math.ceil(lookaheadDays / 7));
  const dates = new Set(upcoming.map((p) => p.scheduledDate));
  let maxGap = 0;
  let currentGap = 0;
  for (let i = 0; i <= lookaheadDays; i += 1) {
    const day = addCalendarDays(todayIso, i);
    if (dates.has(day)) {
      maxGap = Math.max(maxGap, currentGap);
      currentGap = 0;
    } else {
      currentGap += 1;
    }
  }
  maxGap = Math.max(maxGap, currentGap);

  const pastPublished = posts
    .filter(
      (p) =>
        p.companyId === companyId &&
        p.status === "published" &&
        p.scheduledDate <= todayIso,
    )
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const daysSinceLastPublish =
    pastPublished.length > 0
      ? Math.round(
          (Date.parse(todayIso) - Date.parse(pastPublished[0].scheduledDate)) / 86_400_000,
        )
      : null;

  if (upcoming.length >= minExpected && maxGap < 7) return null;

  return {
    lookaheadDays,
    scheduledCount: upcoming.length,
    minExpected,
    gapDays: maxGap,
    daysSinceLastPublish,
  };
}

/** Published-post frequency vs target — thin cadence triggers a recommendation. */
export function detectPublishingCadence(
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[],
  companyId: string,
  todayIso: string,
  lookbackDays = 30,
): PublishingCadenceSignal | null {
  const start = addCalendarDays(todayIso, -lookbackDays);
  const published = posts.filter(
    (p) =>
      p.companyId === companyId &&
      p.status === "published" &&
      p.scheduledDate >= start &&
      p.scheduledDate <= todayIso,
  );
  const minExpected = Math.max(4, Math.ceil(lookbackDays / 7));
  if (published.length >= minExpected) return null;

  const pastPublished = posts
    .filter(
      (p) =>
        p.companyId === companyId &&
        p.status === "published" &&
        p.scheduledDate <= todayIso,
    )
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const daysSinceLastPublish =
    pastPublished.length > 0
      ? Math.round(
          (Date.parse(todayIso) - Date.parse(pastPublished[0].scheduledDate)) / 86_400_000,
        )
      : null;

  return {
    lookbackDays,
    publishedCount: published.length,
    minExpected,
    daysSinceLastPublish,
  };
}

/** Score boost when a calendar gap signal is active (W5 M41 recommendations). */
export function recommendationGapUrgencyBoost(gap: CalendarGapSignal | null): number {
  if (!gap) return 0;
  return Math.min(15, gap.gapDays * 2 + (gap.scheduledCount === 0 ? 5 : 0));
}

/** Score boost when publishing cadence is thin (W5 M41 recommendations). */
export function recommendationCadenceUrgencyBoost(cadence: PublishingCadenceSignal | null): number {
  if (!cadence) return 0;
  const deficit = Math.max(0, cadence.minExpected - cadence.publishedCount);
  return Math.min(12, deficit * 2);
}

/** Hint if a scheduled post sits outside analytics-informed windows (soft advisory). */
export function scheduleTimingHint(
  post: Pick<ScheduledPost, "scheduledDate" | "scheduledTime" | "platform" | "companyId">,
  windows: OptimalPostWindow[],
): string | null {
  if (!post.scheduledTime) return "Add a time to align with optimal engagement windows.";
  const dow = dayOfWeekFromIso(post.scheduledDate);
  const minutes = parseTimeMinutes(post.scheduledTime);
  if (minutes === null) return null;
  const match = windows.find(
    (w) =>
      (!w.companyId || w.companyId === post.companyId) &&
      w.platform.toLowerCase() === post.platform.toLowerCase() &&
      w.dayOfWeek === dow,
  );
  if (!match) {
    const alt = windows.find((w) => w.dayOfWeek === dow);
    if (alt) {
      return `Consider ${alt.dayOfWeek} ${alt.timeStart}–${alt.timeEnd} (${alt.basis}).`;
    }
    return null;
  }
  const start = parseTimeMinutes(match.timeStart)!;
  const end = parseTimeMinutes(match.timeEnd)!;
  if (minutes >= start && minutes < end) return null;
  return `Outside peak window for ${dow} — try ${match.timeStart}–${match.timeEnd}.`;
}
