// Serialize / parse structured address, phone, and hours for listings + AI.

import { countryByCode, countryByDial } from "@/lib/business-info/countries";
import { AU_STREET_TYPES } from "@/lib/business-info/street-types";
import {
  WEEKDAY_LABEL,
  WEEKDAYS,
  type ClockTime,
  type DayHours,
  type StructuredBusinessAddress,
  type StructuredPhone,
  type StructuredTradingHours,
  type Weekday,
} from "@/lib/business-info/types";

export function emptyStructuredHours(): StructuredTradingHours {
  return {
    days: WEEKDAYS.map((day) => ({
      day,
      closed: day === "sunday",
      open: day === "sunday" ? undefined : { hour: 9, minute: 0, period: "AM" },
      close: day === "sunday" ? undefined : { hour: 5, minute: 0, period: "PM" },
    })),
  };
}

export function clockToMinutes(t: ClockTime): number {
  let h = t.hour % 12;
  if (t.period === "PM") h += 12;
  if (t.period === "AM" && t.hour === 12) h = 0;
  return h * 60 + t.minute;
}

export function formatClock(t: ClockTime): string {
  const m = String(t.minute).padStart(2, "0");
  return `${t.hour}:${m} ${t.period}`;
}

export function formatStructuredAddress(a: StructuredBusinessAddress): string {
  const country = countryByCode(a.countryCode)?.name ?? a.countryCode;
  const streetType =
    AU_STREET_TYPES.find((s) => s.value === a.streetType)?.label ?? a.streetType;
  const streetLine = [a.streetNumber, a.streetName, streetType]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const unit = a.unit?.trim();
  const line1 = unit ? `${unit}, ${streetLine}` : streetLine;
  const locality = [a.suburb, a.stateRegion, a.postcode]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  return [line1, locality, country].filter(Boolean).join(", ");
}

export function formatStructuredPhone(p: StructuredPhone): string {
  const dial = p.countryCallingCode.replace(/^\+/, "").trim();
  const national = p.nationalNumber.trim();
  if (!dial || !national) return "";
  return `+${dial} ${national}`.trim();
}

export function formatStructuredHours(h: StructuredTradingHours): string {
  return h.days
    .map((d) => {
      const label = WEEKDAY_LABEL[d.day];
      if (d.closed || !d.open || !d.close) return `${label}: Closed`;
      return `${label}: ${formatClock(d.open)} – ${formatClock(d.close)}`;
    })
    .join("; ");
}

export function parseClockFromToken(raw: string): ClockTime | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  let period = (m[3]?.toUpperCase() as "AM" | "PM" | undefined) ?? undefined;
  if (!period) {
    // 24h → 12h
    if (hour === 0) {
      hour = 12;
      period = "AM";
    } else if (hour === 12) {
      period = "PM";
    } else if (hour > 12) {
      hour -= 12;
      period = "PM";
    } else {
      period = "AM";
    }
  } else if (hour === 0) {
    hour = 12;
  }
  if (hour < 1 || hour > 12) return null;
  const snapped =
    minute < 8 ? 0 : minute < 23 ? 15 : minute < 38 ? 30 : minute < 53 ? 45 : 0;
  const adjHour = minute >= 53 ? (hour === 12 ? 1 : hour + 1) : hour;
  const adjPeriod =
    minute >= 53 && hour === 11
      ? period === "AM"
        ? "PM"
        : "AM"
      : period;
  return { hour: adjHour > 12 ? 1 : adjHour, minute: snapped as 0 | 15 | 30 | 45, period: adjPeriod };
}

/** Best-effort parse of Google weekday_text / free-text hours. */
export function parseTradingHoursText(raw: string | undefined): StructuredTradingHours {
  const base = emptyStructuredHours();
  if (!raw?.trim()) return base;

  const byDay = new Map<Weekday, DayHours>();
  for (const day of WEEKDAYS) {
    byDay.set(day, { day, closed: true });
  }

  const chunks = raw.split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const dayHit = WEEKDAYS.find((d) =>
      chunk.toLowerCase().startsWith(WEEKDAY_LABEL[d].toLowerCase().slice(0, 3)),
    );
    if (!dayHit) continue;
    if (/closed/i.test(chunk)) {
      byDay.set(dayHit, { day: dayHit, closed: true });
      continue;
    }
    const times = chunk.match(
      /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/g,
    );
    if (times && times.length >= 2) {
      const open = parseClockFromToken(times[0]);
      const close = parseClockFromToken(times[times.length - 1]);
      if (open && close) {
        byDay.set(dayHit, { day: dayHit, closed: false, open, close });
      }
    }
  }

  // Compact ranges like "Mon–Thu 5:00pm–10:00pm"
  const range = raw.match(
    /Mon(?:day)?\s*[–-]\s*Thu(?:rsday)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (range) {
    const open = parseClockFromToken(range[1]);
    const close = parseClockFromToken(range[2]);
    if (open && close) {
      for (const day of ["monday", "tuesday", "wednesday", "thursday"] as Weekday[]) {
        byDay.set(day, { day, closed: false, open, close });
      }
    }
  }

  return { days: WEEKDAYS.map((d) => byDay.get(d)!) };
}

export function parsePhoneText(raw: string | undefined): StructuredPhone {
  const t = (raw ?? "").trim();
  if (!t) return { countryCallingCode: "61", nationalNumber: "" };
  const plus = t.match(/^\+(\d{1,3})\s*(.*)$/);
  if (plus) {
    return {
      countryCallingCode: plus[1],
      nationalNumber: plus[2].replace(/[^\d\s]/g, "").trim(),
    };
  }
  const digits = t.replace(/\D/g, "");
  if (digits.startsWith("61") && digits.length >= 10) {
    return {
      countryCallingCode: "61",
      nationalNumber: digits.slice(2).replace(/^0/, ""),
    };
  }
  if (digits.startsWith("0")) {
    return { countryCallingCode: "61", nationalNumber: digits };
  }
  return { countryCallingCode: "61", nationalNumber: t };
}

/** Best-effort AU address parse from a single line. */
export function parseAddressText(
  raw: string | undefined,
  fallbackCountry = "AU",
): StructuredBusinessAddress {
  const empty: StructuredBusinessAddress = {
    countryCode: fallbackCountry,
    postcode: "",
    suburb: "",
    stateRegion: "",
    unit: "",
    streetNumber: "",
    streetName: "",
    streetType: "St",
  };
  if (!raw?.trim()) return empty;

  let rest = raw.trim().replace(/,\s*Australia\s*$/i, "");
  const pc = rest.match(/\b(\d{4})\b\s*$/);
  let postcode = "";
  if (pc) {
    postcode = pc[1];
    rest = rest.slice(0, pc.index).trim().replace(/,\s*$/, "");
  }
  const stateMatch = rest.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b\s*$/i);
  let stateRegion = "";
  if (stateMatch) {
    stateRegion = stateMatch[1].toUpperCase();
    rest = rest.slice(0, stateMatch.index).trim().replace(/,\s*$/, "");
  }

  const parts = rest.split(",").map((s) => s.trim()).filter(Boolean);
  let unit = "";
  let streetPart = parts[0] ?? "";
  let suburb = parts[1] ?? "";
  if (/^(unit|u|apt|apartment|level|suite)\b/i.test(streetPart) && parts[1]) {
    unit = streetPart;
    streetPart = parts[1];
    suburb = parts[2] ?? "";
  }

  const typeHit = [...AU_STREET_TYPES]
    .sort((a, b) => b.label.length - a.label.length)
    .find(
      (t) =>
        new RegExp(`\\b${t.label}\\b`, "i").test(streetPart) ||
        new RegExp(`\\b${t.value}\\b`, "i").test(streetPart),
    );
  let streetType = typeHit?.value ?? "St";
  let streetName = streetPart;
  let streetNumber = "";
  const numMatch = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (numMatch) {
    streetNumber = numMatch[1];
    streetName = numMatch[2];
  }
  if (typeHit) {
    streetName = streetName
      .replace(new RegExp(`\\b${typeHit.label}\\b`, "i"), "")
      .replace(new RegExp(`\\b${typeHit.value}\\b`, "i"), "")
      .trim();
  }

  return {
    countryCode: fallbackCountry,
    postcode,
    suburb: suburb.replace(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i, "").trim(),
    stateRegion,
    unit,
    streetNumber,
    streetName,
    streetType,
  };
}

export function e164FromStructured(p: StructuredPhone): string {
  const dial = p.countryCallingCode.replace(/\D/g, "");
  let national = p.nationalNumber.replace(/\D/g, "");
  if (dial === "61" && national.startsWith("0")) national = national.slice(1);
  if (!dial || !national) return "";
  return `+${dial}${national}`;
}

export function dialHint(countryCallingCode: string): string {
  const c = countryByDial(countryCallingCode);
  if (c?.code === "AU") return "Landline 02 9000 0000 or mobile 0412 345 678";
  if (c?.code === "NZ") return "e.g. 09 123 4567 or 021 123 4567";
  return "Local number without the country code";
}
