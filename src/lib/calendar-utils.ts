// Calendar helpers for Phase 6: month grid construction, public holidays and
// §34 conflict detection (busy days, duplicates, expiry, holidays, post-event).

export const AU_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-26": "Australia Day",
  "2026-04-03": "Good Friday",
  "2026-04-06": "Easter Monday",
  "2026-04-25": "Anzac Day",
  "2026-06-08": "King's Birthday",
  "2026-10-05": "Labour Day (NSW)",
  "2026-12-25": "Christmas Day",
  "2026-12-28": "Boxing Day (observed)",
  "2027-01-01": "New Year's Day",
  "2027-01-26": "Australia Day",
};

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-07" → previous/next month keys and a 6x7-max grid of ISO dates
// (weeks start Monday; null = day outside the month).
export function monthGrid(monthKey: string): {
  label: string;
  prev: string;
  next: string;
  weeks: (string | null)[][];
} {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = first.toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prevD = new Date(Date.UTC(y, m - 2, 1));
  const nextD = new Date(Date.UTC(y, m, 1));
  const key = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  // Monday-first day-of-week index for the 1st of the month.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${monthKey}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { label, prev: key(prevD), next: key(nextD), weeks };
}

// One renderable calendar entry (scheduled post or planned campaign item).
export interface CalendarEntry {
  id: string;
  kind: "post" | "item";
  date: string;
  time?: string;
  title: string;
  status: string;
  platform: string;
  companyId: string;
  companyName: string;
  campaignId?: string | null;
  requestId?: string | null;
  href: string;
  preview: string;
  warnings: string[];
  scheduledPostId?: string; // set for kind "post" — enables drag & reschedule
}

// §34 conflict detection across one day's entries for the same company.
export function dayConflicts(entries: CalendarEntry[]): string[] {
  const warnings: string[] = [];
  const byCompany = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!byCompany.has(e.companyId)) byCompany.set(e.companyId, []);
    byCompany.get(e.companyId)!.push(e);
  }
  for (const [, group] of byCompany) {
    if (group.length > 3) {
      warnings.push(`${group[0].companyName}: ${group.length} posts in one day`);
    }
    const seenPlatform = new Set<string>();
    for (const e of group) {
      const k = e.platform.toLowerCase();
      if (e.kind === "post" && seenPlatform.has(k)) {
        warnings.push(`${group[0].companyName}: duplicate ${e.platform} posts`);
      }
      if (e.kind === "post") seenPlatform.add(k);
    }
  }
  return [...new Set(warnings)];
}
