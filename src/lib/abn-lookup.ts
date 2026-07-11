// ABN lookup (AU) — env-gated ABR-style lookup for onboarding pre-fill.
// Deterministic simulation when ABN_LOOKUP_GUID is unset; never throws on
// network failure (falls back to simulated or returns null).
//
// INVARIANT: ABN is never a primary key or unique company index. One legal
// entity (ABN) may operate multiple Company records (sites/brands). Lookups
// only pre-fill profile.abn + legalName on the *current* company.

import { appEnv } from "@/lib/env";
import type { CompanyProfile } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export interface AbnLookupResult {
  abn: string;
  legalName: string;
  entityType?: string;
  gstRegistered?: boolean;
  status?: string;
  mode: "live" | "simulated";
}

// ---- env gate ----------------------------------------------------------------

function abnLookupGuid(): string | undefined {
  return process.env.ABN_LOOKUP_GUID?.trim() || undefined;
}

/** True when an ABR authentication GUID is configured. */
export function abnLookupConfigured(): boolean {
  return !!abnLookupGuid();
}

function abnLookupLive(): boolean {
  if (!abnLookupConfigured()) return false;
  const env = appEnv();
  if (env === "development" || env === "staging") return true;
  return process.env.ABN_LOOKUP_LIVE === "true";
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

// ---- deterministic simulation ------------------------------------------------

const DEMO_ABNS: Record<string, Omit<AbnLookupResult, "mode">> = {
  "51824753556": {
    abn: "51 824 753 556",
    legalName: "Harbour Roasters Pty Ltd",
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
  },
  "53004085616": {
    abn: "53 004 085 616",
    legalName: "Riverside Kitchen Pty Ltd",
    entityType: "Australian Private Company",
    gstRegistered: true,
    status: "Active",
  },
  "74172177893": {
    abn: "74 172 177 893",
    legalName: "Bright Spark Dental Pty Ltd",
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

function mapAbnJson(data: AbrAbnJson): AbnLookupResult | null {
  const abnRaw = data.Abn?.trim();
  const legalName = data.EntityName?.trim();
  if (!abnRaw || !legalName) return null;
  return {
    abn: formatAbn(abnRaw),
    legalName,
    entityType: data.EntityTypeName?.trim(),
    gstRegistered: data.Gst === "Registered" || data.Gst === "true",
    status: data.AbnStatus?.trim(),
    mode: "live",
  };
}

async function lookupAbnLive(abnDigits: string): Promise<AbnLookupResult | null> {
  const guid = abnLookupGuid();
  if (!guid) return null;
  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abnDigits)}&guid=${encodeURIComponent(guid)}`;
  const data = (await fetchAbrJson(url)) as AbrAbnJson | null;
  if (!data) return null;
  return mapAbnJson(data);
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

  const detailUrl = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(best.Abn)}&guid=${encodeURIComponent(guid)}`;
  const detail = (await fetchAbrJson(detailUrl)) as AbrAbnJson | null;
  if (detail) return mapAbnJson(detail);

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
      const live = isAbnQuery(trimmed)
        ? await lookupAbnLive(normaliseAbnDigits(trimmed))
        : await lookupNameLive(trimmed);
      if (live) return live;
    } catch {
      /* fall through to simulated */
    }
  }

  return simulateLookup(trimmed);
}

/** Map an ABN lookup result into company profile fields for apply.
 * Does not identify or upsert a company — caller already has companyId. */
export function abnResultToProfilePatch(result: AbnLookupResult): Partial<CompanyProfile> {
  return {
    abn: result.abn,
    legalName: result.legalName,
  };
}
