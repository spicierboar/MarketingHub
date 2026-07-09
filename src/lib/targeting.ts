// Ad audience targeting engine (Module 6/7).
//
// Pure helpers over the AdTargeting spec:
//   • normaliseTargeting — coerce/validate a raw spec into safe bounds.
//   • targetingSummary   — a one-line human summary for the dashboard.
//   • estimateReach      — a DETERMINISTIC simulated audience size (the real
//     number comes from each platform's reach estimator once ADS_LIVE; this is
//     the targeting analogue of the simulated paid metrics, so the UI shows a
//     believable, stable figure now).
//   • suggestTargeting   — a deterministic starter audience from the company's
//     Brand Brain (service areas + local-area suburbs + services/search terms),
//     so an admin gets a sensible local audience with one click. Reuses data we
//     already hold; no keys required.
//
// The live connector (ad-connectors.ts, gated on ADS_LIVE) translates a spec
// into Google Ads / Meta Marketing API targeting; nothing here calls a platform.

import type {
  AdTargeting,
  Company,
  GeoTarget,
  LocalAreaProfile,
} from "@/lib/types";

export const AGE_FLOOR = 13; // platform minimum
export const AGE_CAP = 65; // 65 = "65+"
export const MAX_RADIUS_KM = 500;

export function emptyTargeting(): AdTargeting {
  return {
    locations: [],
    ageMin: AGE_FLOOR,
    ageMax: AGE_CAP,
    gender: "all",
    languages: [],
    interests: [],
    customAudiences: [],
    exclusions: [],
    devices: "all",
    placements: [],
  };
}

function clampAge(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(AGE_CAP, Math.max(AGE_FLOOR, Math.round(n)));
}

// Coerce a raw (form/AI) targeting into safe, self-consistent bounds. Never
// throws — the worst input yields a broad-but-valid audience.
export function normaliseTargeting(raw: Partial<AdTargeting> | undefined): AdTargeting {
  const base = emptyTargeting();
  if (!raw) return base;
  let ageMin = clampAge(raw.ageMin ?? AGE_FLOOR, AGE_FLOOR);
  let ageMax = clampAge(raw.ageMax ?? AGE_CAP, AGE_CAP);
  if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin]; // keep the range sane
  const cleanList = (xs: unknown): string[] =>
    Array.isArray(xs)
      ? [...new Set(xs.map((x) => String(x).trim()).filter(Boolean))].slice(0, 100)
      : [];
  const locations: GeoTarget[] = Array.isArray(raw.locations)
    ? raw.locations
        .filter((l): l is GeoTarget => !!l && typeof l.value === "string" && l.value.trim() !== "")
        .slice(0, 100)
        .map((l) => ({
          kind: (["country", "region", "city", "postcode", "radius"] as const).includes(l.kind)
            ? l.kind
            : "city",
          value: l.value.trim(),
          ...(l.kind === "radius"
            ? { radiusKm: Math.min(MAX_RADIUS_KM, Math.max(1, Math.round(Number(l.radiusKm) || 10))) }
            : {}),
          ...(l.exclude ? { exclude: true } : {}),
        }))
    : [];
  return {
    locations,
    ageMin,
    ageMax,
    gender: (["all", "male", "female"] as const).includes(raw.gender as "all")
      ? (raw.gender as AdTargeting["gender"])
      : "all",
    languages: cleanList(raw.languages),
    interests: cleanList(raw.interests),
    customAudiences: cleanList(raw.customAudiences),
    exclusions: cleanList(raw.exclusions),
    devices: (["all", "mobile", "desktop", "tablet"] as const).includes(raw.devices as "all")
      ? (raw.devices as AdTargeting["devices"])
      : "all",
    placements: cleanList(raw.placements),
  };
}

function geoLabel(g: GeoTarget): string {
  const core = g.kind === "radius" ? `${g.value} +${g.radiusKm ?? 10}km` : g.value;
  return g.exclude ? `−${core}` : core;
}

// One-line summary for the dashboard, e.g.
// "Sydney +10km · 25–54 · all · interests: coffee, brunch (+2) · mobile".
export function targetingSummary(t: AdTargeting): string {
  const parts: string[] = [];
  if (t.locations.length) {
    const shown = t.locations.slice(0, 3).map(geoLabel).join(", ");
    parts.push(shown + (t.locations.length > 3 ? ` (+${t.locations.length - 3})` : ""));
  } else {
    parts.push("all locations");
  }
  parts.push(`${t.ageMin}–${t.ageMax === AGE_CAP ? "65+" : t.ageMax}`);
  parts.push(t.gender === "all" ? "all genders" : t.gender);
  if (t.interests.length) {
    parts.push(
      `interests: ${t.interests.slice(0, 2).join(", ")}${t.interests.length > 2 ? ` (+${t.interests.length - 2})` : ""}`,
    );
  }
  if (t.customAudiences.length) parts.push(`${t.customAudiences.length} custom audience(s)`);
  if (t.exclusions.length) parts.push(`${t.exclusions.length} exclusion(s)`);
  if (t.devices !== "all") parts.push(t.devices);
  if (t.placements.length) parts.push(`${t.placements.length} placement(s)`);
  return parts.join(" · ");
}

// ---- deterministic reach estimate (same FNV-1a seed scheme as analytics/paid) --

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Order-independent serialisation for the reach seed. Postgres jsonb does NOT
// preserve object key insertion order, so a targeting spec read back from
// Supabase has different key order than the freshly-normalised in-memory
// object. Seeding on raw JSON.stringify would then yield a DIFFERENT reach for
// the same audience across backends (and after a reload). Sorting keys
// recursively makes the seed depend only on the VALUES, not their order.
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") {
    return (
      "{" +
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

// A believable, STABLE estimated reachable audience for a spec. Broad specs
// reach more; each narrowing dimension (tight radius, age band, gender,
// interests, custom audiences, exclusions, device/placement) shrinks it. This
// is SIMULATED — replaced by the platform's real estimator under ADS_LIVE.
export function estimateReach(t: AdTargeting): number {
  const key = stableStringify(t); // order-independent → same reach on both backends
  // Base metro-scale audience, jittered deterministically so two specs differ.
  let reach = 380_000 + Math.round(seed(key) * 240_000);

  // Geography: radius shrinks hard by distance; named places by breadth; a
  // country include keeps it large. Excludes trim. No locations = nationwide.
  if (t.locations.length === 0) {
    reach *= 6; // nationwide
  } else {
    let geoFactor = 0;
    for (const l of t.locations) {
      if (l.exclude) continue;
      if (l.kind === "radius") geoFactor += Math.min(1.2, (l.radiusKm ?? 10) / 40);
      else if (l.kind === "country") geoFactor += 5;
      else if (l.kind === "region") geoFactor += 2;
      else if (l.kind === "city") geoFactor += 1;
      else geoFactor += 0.5; // postcode
    }
    reach = Math.round(reach * Math.max(0.15, geoFactor));
    const excludes = t.locations.filter((l) => l.exclude).length;
    reach = Math.round(reach * Math.max(0.4, 1 - excludes * 0.12));
  }

  // Demographics: age-band width (of the 13–65 span) and gender split.
  const ageWidth = (t.ageMax - t.ageMin) / (AGE_CAP - AGE_FLOOR);
  reach = Math.round(reach * Math.max(0.15, Math.min(1, ageWidth)));
  if (t.gender !== "all") reach = Math.round(reach * 0.5);

  // Interests / custom audiences narrow; exclusions trim; non-default device
  // and explicit placements narrow slightly.
  if (t.interests.length) reach = Math.round(reach * Math.max(0.2, 1 - t.interests.length * 0.08));
  if (t.customAudiences.length) reach = Math.round(reach * Math.max(0.1, 1 - t.customAudiences.length * 0.15));
  if (t.exclusions.length) reach = Math.round(reach * Math.max(0.5, 1 - t.exclusions.length * 0.06));
  if (t.devices !== "all") reach = Math.round(reach * 0.6);
  if (t.placements.length) reach = Math.round(reach * Math.max(0.5, 1 - t.placements.length * 0.1));

  return Math.max(1000, reach);
}

// ---- deterministic AI-style suggestion from the Brand Brain --------------------

function firstWords(s: string | undefined, n: number): string[] {
  if (!s) return [];
  return s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, n);
}

// A sensible starter audience for a local business: a radius around the first
// service area / suburb, a broad adult age band, interests from services +
// local search terms. Deterministic — an admin reviews + edits before saving.
export function suggestTargeting(
  company: Company | undefined,
  local: LocalAreaProfile | undefined,
): { targeting: AdTargeting; rationale: string } {
  const t = emptyTargeting();
  const areas = company?.profile.serviceAreas ?? [];
  const suburbs = local?.suburbs ?? [];
  const anchor = areas[0] || suburbs[0] || "";
  if (anchor) {
    t.locations = [{ kind: "radius", value: anchor, radiusKm: 15 }];
    // Extra suburbs as explicit city includes (deduped against the anchor).
    for (const s of suburbs.slice(0, 4)) {
      if (s && s !== anchor) t.locations.push({ kind: "city", value: s });
    }
  }
  t.ageMin = 25;
  t.ageMax = 64;
  t.languages = ["English"];
  const services = (company?.profile.services ?? []).slice(0, 4);
  const searchTerms = (local?.searchTerms ?? []).slice(0, 3);
  const needs = firstWords(local?.commonNeeds, 2);
  t.interests = [...new Set([...services, ...searchTerms, ...needs].map((x) => x.trim()).filter(Boolean))].slice(0, 8);
  const parts: string[] = [];
  parts.push(
    anchor
      ? `Centred on ${anchor}${t.locations.length > 1 ? ` + ${t.locations.length - 1} nearby suburb(s)` : ""} (15km radius) — the local catchment from the Brand Brain.`
      : "No service area on file yet — add one to the company profile for a location-based suggestion.",
  );
  if (t.interests.length) parts.push(`Interests drawn from the company's services + local search terms: ${t.interests.slice(0, 4).join(", ")}${t.interests.length > 4 ? "…" : ""}.`);
  parts.push("Age 25–64, all genders — a broad adult starting point. Review and narrow before launching.");
  return { targeting: normaliseTargeting(t), rationale: parts.join(" ") };
}
