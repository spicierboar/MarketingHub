// ABN lookup (AU) — env-gated ABR-style lookup for onboarding pre-fill.
// Deterministic simulation when ABN_LOOKUP_GUID is unset; never throws on
// network failure (falls back to simulated or returns null).
//
// INVARIANT: ABN alone is never a unique company index. One legal entity may
// operate multiple MCC accounts (one per trading/business name). Account
// duplicate checks use (business name + ABN + postcode) — see company-identity.ts.
// Lookups only pre-fill profile.abn + legalName on the *current* company.
//
// Create/update gate: verifyBusinessNameAgainstAbr — ABR register check when
// ABN_LOOKUP_GUID is set (no LIVE flag required for read-only verify). Soft-skip
// only when GUID missing or ABR unreachable (demos keep working).

import {
  liveIntegrationsAllowed,
  providerLiveFlagEnabled,
} from "@/lib/env";
import type { CompanyProfile } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export interface AbnLookupResult {
  abn: string;
  legalName: string;
  /** Registered business / trading names from ABR (JSON BusinessName[]). */
  businessNames?: string[];
  entityType?: string;
  gstRegistered?: boolean;
  status?: string;
  mode: "live" | "simulated";
}

export type AbrIdentityGateResult =
  | {
      ok: true;
      mode: "live" | "skipped";
      legalName?: string;
      matchedAs?: "entity" | "business_name";
      /** Soft-skip reason when ABR was unavailable — do not hard-block. */
      warning?: string;
    }
  | {
      ok: false;
      error: string;
      code: "invalid_abn" | "cancelled_abn" | "name_mismatch";
    };

// ---- env gate ----------------------------------------------------------------

function abnLookupGuid(): string | undefined {
  return process.env.ABN_LOOKUP_GUID?.trim() || undefined;
}

/** True when an ABR authentication GUID is configured. */
export function abnLookupConfigured(): boolean {
  return !!abnLookupGuid();
}

/**
 * Read-only ABR register queries — GUID only.
 * Does not require ABN_LOOKUP_LIVE (that flag gates enrichment write-paths).
 */
export function abnRegisterCheckEnabled(): boolean {
  return abnLookupConfigured();
}

/** True when live ABR calls are enabled (GUID + env gate). */
export function isAbnLookupLive(): boolean {
  if (!abnLookupConfigured()) return false;
  return (
    providerLiveFlagEnabled(process.env.ABN_LOOKUP_LIVE) &&
    liveIntegrationsAllowed()
  );
}

function abnLookupLive(): boolean {
  return isAbnLookupLive();
}

// ---- helpers -----------------------------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function normaliseAbnDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function isAbnQuery(raw: string): boolean {
  return normaliseAbnDigits(raw).length === 11;
}

function formatAbn(digits: string): string {
  const d = normaliseAbnDigits(digits).padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
}

function titleCaseName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const LEGAL_SUFFIX_RE =
  /\b(proprietary limited|pty limited|pty ltd|limited|ltd|incorporated|inc|plc|trust|trustee|as trustee for)\b/gi;

/**
 * Fuzzy-tolerant name key: case/whitespace/punctuation insensitive,
 * common AU legal suffixes stripped.
 */
export function normalizeNameForAbrMatch(name: string | undefined | null): string {
  // Punctuation first so "Pty. Ltd." becomes "pty ltd" before suffix strip.
  let s = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Strip suffixes repeatedly (e.g. "Foo Pty Ltd Limited").
  for (let i = 0; i < 3; i++) {
    const next = s.replace(LEGAL_SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * True when submitted business/trading name matches the ABR entity name or
 * any known business/trading name (fuzzy-tolerant).
 */
export function businessNameMatchesAbrNames(
  submitted: string,
  entityName: string,
  businessNames: string[] = [],
): { match: boolean; matchedAs?: "entity" | "business_name" } {
  const sub = normalizeNameForAbrMatch(submitted);
  if (!sub) return { match: false };

  const entityKey = normalizeNameForAbrMatch(entityName);
  if (entityKey && abrNameKeysCompatible(sub, entityKey)) {
    return { match: true, matchedAs: "entity" };
  }

  for (const bn of businessNames) {
    const key = normalizeNameForAbrMatch(bn);
    if (key && abrNameKeysCompatible(sub, key)) {
      return { match: true, matchedAs: "business_name" };
    }
  }
  return { match: false };
}

/** Equal after normalize, or near-equal containment (avoids tiny substring hits). */
function abrNameKeysCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 4) return false;
  if (!longer.includes(shorter)) return false;
  // Require the shorter name to cover most of the longer (clear mismatch e.g.
  // "Cafe" vs "Grinders Coffee House" fails; "Harbour Roasters" vs
  // "Harbour Roasters Cafe" passes).
  return shorter.length / longer.length >= 0.7;
}

function isCancelledStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s.includes("cancel");
}

function collectBusinessNames(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

// ---- deterministic simulation ------------------------------------------------

const DEMO_ABNS: Record<string, Omit<AbnLookupResult, "mode">> = {
  "51824753556": {
    abn: "51 824 753 556",
    legalName: "Harbour Roasters Pty Ltd",
    businessNames: ["Harbour Roasters"],
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
  },
  "53004085616": {
    abn: "53 004 085 616",
    legalName: "Riverside Kitchen Pty Ltd",
    businessNames: ["Riverside Kitchen"],
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
  },
  "74172177893": {
    abn: "74 172 177 893",
    legalName: "Bright Spark Dental Pty Ltd",
    businessNames: ["Bright Spark Dental"],
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
  },
};

function simulateByAbn(digits: string): AbnLookupResult {
  const hit = DEMO_ABNS[digits];
  if (hit) return { ...hit, mode: "simulated" };

  const h = simpleHash(digits);
  const suffix = String(10_000_000 + (h % 89_999_999)).slice(0, 9);
  const abnDigits = `51${suffix}`;
  return {
    abn: formatAbn(abnDigits),
    legalName: `Demo Entity ${suffix} Pty Ltd`,
    entityType: "Australian Private Company",
    gstRegistered: h % 5 !== 0,
    status: "Active",
    mode: "simulated",
  };
}

function simulateByName(name: string): AbnLookupResult {
  const key = name.trim().toLowerCase();
  for (const row of Object.values(DEMO_ABNS)) {
    if (row.legalName.toLowerCase().includes(key) || key.includes(row.legalName.split(" ")[0].toLowerCase())) {
      return { ...row, mode: "simulated" };
    }
  }

  const h = simpleHash(key);
  const trading = titleCaseName(name);
  const suffix = String(20_000_000 + (h % 79_999_999)).slice(0, 9);
  const abnDigits = `53${suffix}`;
  return {
    abn: formatAbn(abnDigits),
    legalName: `${trading} Pty Ltd`,
    businessNames: [trading],
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
    mode: "simulated",
  };
}

function simulateLookup(abnOrName: string): AbnLookupResult {
  const trimmed = abnOrName.trim();
  if (!trimmed) {
    return simulateByName("Demo Business");
  }
  if (isAbnQuery(trimmed)) {
    return simulateByAbn(normaliseAbnDigits(trimmed));
  }
  return simulateByName(trimmed);
}

// ---- live ABR JSON API -------------------------------------------------------

interface AbrAbnJson {
  Abn?: string;
  EntityName?: string;
  EntityTypeName?: string;
  Gst?: string | null;
  AbnStatus?: string;
  BusinessName?: string[] | string;
  Message?: string;
}

interface AbrNameMatch {
  Abn?: string;
  Name?: string;
  NameType?: string;
  State?: string;
  Score?: number;
}

async function fetchAbrJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return null;
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Classify empty ABR payloads: config/network-ish vs invalid ABN. */
function classifyEmptyAbrPayload(
  data: AbrAbnJson,
): "unavailable" | "invalid" {
  const msg = (data.Message ?? "").toLowerCase();
  if (
    msg.includes("guid") ||
    msg.includes("registered party") ||
    msg.includes("not recognised")
  ) {
    return "unavailable";
  }
  if (
    msg.includes("not a valid") ||
    msg.includes("no records") ||
    msg.includes("search text")
  ) {
    return "invalid";
  }
  // Empty Abn + Message often means bad ABN; empty everything with no message → treat unavailable.
  if (msg.trim()) return "invalid";
  return "unavailable";
}

function mapAbnJson(data: AbrAbnJson): AbnLookupResult | null {
  const abnRaw = data.Abn?.trim();
  const legalName = data.EntityName?.trim();
  if (!abnRaw || !legalName) return null;
  const businessNames = collectBusinessNames(data.BusinessName);
  return {
    abn: formatAbn(abnRaw),
    legalName,
    businessNames: businessNames.length ? businessNames : undefined,
    entityType: data.EntityTypeName?.trim(),
    gstRegistered: data.Gst === "Registered" || data.Gst === "true",
    status: data.AbnStatus?.trim(),
    mode: "live",
  };
}

async function lookupAbnLive(abnDigits: string): Promise<{
  result: AbnLookupResult | null;
  emptyClass?: "unavailable" | "invalid";
  raw?: AbrAbnJson;
}> {
  const guid = abnLookupGuid();
  if (!guid) return { result: null, emptyClass: "unavailable" };
  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abnDigits)}&guid=${encodeURIComponent(guid)}`;
  const data = (await fetchAbrJson(url)) as AbrAbnJson | null;
  if (!data) return { result: null, emptyClass: "unavailable" };
  const mapped = mapAbnJson(data);
  if (mapped) return { result: mapped, raw: data };
  return { result: null, emptyClass: classifyEmptyAbrPayload(data), raw: data };
}

async function lookupNameLive(name: string): Promise<AbnLookupResult | null> {
  const guid = abnLookupGuid();
  if (!guid) return null;
  const url = `https://abr.business.gov.au/json/MatchingNames.aspx?name=${encodeURIComponent(name)}&maxResults=5&guid=${encodeURIComponent(guid)}`;
  const data = (await fetchAbrJson(url)) as { Names?: AbrNameMatch[] } | null;
  const matches = data?.Names ?? [];
  const best =
    matches.find((m) => (m.Score ?? 0) >= 90) ??
    matches.find((m) => m.NameType === "Entity Name") ??
    matches[0];
  if (!best?.Abn) return null;

  const detail = await lookupAbnLive(normaliseAbnDigits(best.Abn));
  if (detail.result) return detail.result;

  return {
    abn: formatAbn(best.Abn),
    legalName: best.Name?.trim() || name,
    status: "Active",
    mode: "live",
  };
}

// ---- public API --------------------------------------------------------------

/** Look up an ABN or business name. Returns null only when input is empty. */
export async function lookupAbn(abnOrName: string): Promise<AbnLookupResult | null> {
  const trimmed = abnOrName.trim();
  if (!trimmed) return null;

  if (abnLookupLive()) {
    try {
      if (isAbnQuery(trimmed)) {
        const live = await lookupAbnLive(normaliseAbnDigits(trimmed));
        if (live.result) return live.result;
      } else {
        const live = await lookupNameLive(trimmed);
        if (live) return live;
      }
    } catch {
      /* fall through to simulated */
    }
  }

  return simulateLookup(trimmed);
}

/**
 * Soft/hard ABN status gate (no trading-name match).
 * Queries ABR when ABN_LOOKUP_GUID is set (read-only — no LIVE flag).
 * Soft-skip only when GUID missing or ABR unreachable.
 * Hard-block invalid or cancelled ABN when the register responds.
 */
export async function verifyAbnStatusAgainstAbr(
  abn: string,
): Promise<AbrIdentityGateResult> {
  const digits = normaliseAbnDigits(abn);
  if (digits.length !== 11) {
    return {
      ok: false,
      code: "invalid_abn",
      error: "ABN must be 11 digits (spaces optional), e.g. 51 824 753 556.",
    };
  }

  if (!abnRegisterCheckEnabled()) {
    return {
      ok: true,
      mode: "skipped",
      warning:
        "ABN register check skipped — set ABN_LOOKUP_GUID to verify against the ABR.",
    };
  }

  let live: Awaited<ReturnType<typeof lookupAbnLive>>;
  try {
    live = await lookupAbnLive(digits);
  } catch {
    return {
      ok: true,
      mode: "skipped",
      warning: "ABN register temporarily unavailable — create allowed; re-check later.",
    };
  }

  if (!live.result) {
    if (live.emptyClass === "invalid") {
      return {
        ok: false,
        code: "invalid_abn",
        error:
          "That ABN was not found on the Australian Business Register. Check the number and try again.",
      };
    }
    return {
      ok: true,
      mode: "skipped",
      warning: "ABN register returned no data — create allowed; re-check later.",
    };
  }

  const result = live.result;
  if (isCancelledStatus(result.status)) {
    return {
      ok: false,
      code: "cancelled_abn",
      error: `ABN ${result.abn} is cancelled on the ABR and cannot be used for a new client.`,
    };
  }

  return {
    ok: true,
    mode: "live",
    legalName: result.legalName,
  };
}

/**
 * Gate for create / identity update: verify business name + ABN against the ABR.
 *
 * Queries the register when ABN_LOOKUP_GUID is set (no LIVE flag required).
 * Soft-skip only when GUID missing or ABR unreachable.
 * Hard-block invalid/cancelled ABN or clear name mismatch when ABR responds.
 */
export async function verifyBusinessNameAgainstAbr(
  businessName: string,
  abn: string,
): Promise<AbrIdentityGateResult> {
  const name = businessName.trim();
  const digits = normaliseAbnDigits(abn);
  if (!name || digits.length !== 11) {
    return {
      ok: false,
      code: "invalid_abn",
      error: "ABN must be 11 digits and business name is required for ABR verification.",
    };
  }

  if (!abnRegisterCheckEnabled()) {
    return {
      ok: true,
      mode: "skipped",
      warning:
        "ABN register check skipped — set ABN_LOOKUP_GUID to verify against the ABR.",
    };
  }

  let live: Awaited<ReturnType<typeof lookupAbnLive>>;
  try {
    live = await lookupAbnLive(digits);
  } catch {
    return {
      ok: true,
      mode: "skipped",
      warning: "ABN register temporarily unavailable — create allowed; re-check later.",
    };
  }

  if (!live.result) {
    if (live.emptyClass === "invalid") {
      return {
        ok: false,
        code: "invalid_abn",
        error:
          "That ABN was not found on the Australian Business Register. Check the number and try again.",
      };
    }
    return {
      ok: true,
      mode: "skipped",
      warning: "ABN register returned no data — create allowed; re-check later.",
    };
  }

  const result = live.result;
  if (isCancelledStatus(result.status)) {
    return {
      ok: false,
      code: "cancelled_abn",
      error: `ABN ${result.abn} is cancelled on the ABR and cannot be used for a new client.`,
    };
  }

  const match = businessNameMatchesAbrNames(
    name,
    result.legalName,
    result.businessNames ?? [],
  );
  if (!match.match) {
    const known = [result.legalName, ...(result.businessNames ?? [])]
      .filter(Boolean)
      .slice(0, 4)
      .join("; ");
    return {
      ok: false,
      code: "name_mismatch",
      error:
        `Business name "${name}" does not match ABR records for ABN ${result.abn}` +
        (known ? ` (known: ${known})` : "") +
        `. Use the entity name or a registered business/trading name for this ABN.`,
    };
  }

  return {
    ok: true,
    mode: "live",
    legalName: result.legalName,
    matchedAs: match.matchedAs,
  };
}

/** Map an ABN lookup result into company profile fields for apply.
 * Does not identify or upsert a company — caller already has companyId. */
export function abnResultToProfilePatch(result: AbnLookupResult): Partial<CompanyProfile> {
  return {
    abn: result.abn,
    legalName: result.legalName,
  };
}
