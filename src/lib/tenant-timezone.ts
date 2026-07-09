// Per-tenant schedule timezone — calendar dates/times are local intent.
//
// Fallback chain when a tenant has no timezone set:
//   1. CC_TZ_OFFSET_MINUTES (platform-wide interim, e.g. 600 = AEST)
//   2. UTC (pre-queue behaviour)
//
// Backoff and platform-ceiling windows stay on raw UTC instants — they measure
// elapsed time, not calendar intent (see publish-queue.ts).

import { now } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

export interface QueueClock {
  nowIso: string;
  today: string; // YYYY-MM-DD in the tenant's local calendar
  hhmm: string; // HH:mm (24h)
  clockLabel: string; // for UI — IANA id or fallback description
}

/** Curated IANA zones for the owner picker (AU/NZ first). */
export const SCHEDULE_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Australia/Sydney", label: "Australia — Sydney (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Australia — Melbourne" },
  { value: "Australia/Brisbane", label: "Australia — Brisbane (AEST)" },
  { value: "Australia/Perth", label: "Australia — Perth (AWST)" },
  { value: "Australia/Adelaide", label: "Australia — Adelaide" },
  { value: "Australia/Darwin", label: "Australia — Darwin" },
  { value: "Australia/Hobart", label: "Australia — Hobart" },
  { value: "Pacific/Auckland", label: "New Zealand — Auckland" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "United Kingdom — London" },
  { value: "America/Los_Angeles", label: "US — Los Angeles" },
  { value: "America/New_York", label: "US — New York" },
  { value: "Asia/Singapore", label: "Singapore" },
];

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localPartsInTimezone(
  nowIso: string,
  timezone: string,
): { today: string; hhmm: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(nowIso))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}

function offsetFallbackLabel(offsetMin: number): string {
  const sign = offsetMin >= 0 ? "+" : "";
  const hours = offsetMin / 60;
  return `UTC${sign}${hours}h (platform CC_TZ_OFFSET_MINUTES fallback)`;
}

/** Resolve the queue's due-ness clock for a tenant (or platform fallback). */
export function resolveQueueClockAt(
  nowIso: string,
  tenant?: Pick<Tenant, "timezone"> | null,
): QueueClock {
  const tz = tenant?.timezone?.trim();
  if (tz && isValidIanaTimezone(tz)) {
    const { today, hhmm } = localPartsInTimezone(nowIso, tz);
    return { nowIso, today, hhmm, clockLabel: tz };
  }
  const offsetMin = Number(process.env.CC_TZ_OFFSET_MINUTES) || 0;
  if (offsetMin !== 0) {
    const local = new Date(Date.parse(nowIso) + offsetMin * 60_000).toISOString();
    return {
      nowIso,
      today: local.slice(0, 10),
      hhmm: local.slice(11, 16),
      clockLabel: offsetFallbackLabel(offsetMin),
    };
  }
  return {
    nowIso,
    today: nowIso.slice(0, 10),
    hhmm: nowIso.slice(11, 16),
    clockLabel: "UTC",
  };
}

export function resolveQueueClock(
  tenant?: Pick<Tenant, "timezone"> | null,
): QueueClock {
  return resolveQueueClockAt(now(), tenant);
}
