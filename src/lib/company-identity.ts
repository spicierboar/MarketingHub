// Business identity for MCC company accounts.
//
// Product rule: (business/trading name + ABN + postcode) is the account identity key.
// - Same ABN + different business name → separate accounts (allowed).
// - Same ABN + same name + different postcode → separate locations (allowed).
// - Same business name + same ABN + same postcode → duplicate (block create / identity updates).
// Technical PK remains Company.id; this is the business uniqueness rule.

import { parseAddressText } from "@/lib/business-info/format";
import type { Company, CompanyProfile } from "@/lib/types";

/** Strip to ABN digits only (AU 11-digit). */
export function normalizeAbnDigits(raw: string | undefined | null): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** True when the value looks like a complete AU ABN (11 digits). */
export function isCompleteAbn(raw: string | undefined | null): boolean {
  return normalizeAbnDigits(raw).length === 11;
}

/** Format 11 digits as "XX XXX XXX XXX". Returns "" if incomplete. */
export function formatAbnDisplay(raw: string | undefined | null): string {
  const d = normalizeAbnDigits(raw);
  if (d.length !== 11) return String(raw ?? "").trim();
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
}

/** Case-fold + collapse whitespace for business-name comparison. */
export function normalizeBusinessName(name: string | undefined | null): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Digits-only postcode for identity comparison (AU 4-digit typical). */
export function normalizePostcode(raw: string | undefined | null): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** True when postcode looks usable for identity (AU: 4 digits). */
export function isCompletePostcode(raw: string | undefined | null): boolean {
  const d = normalizePostcode(raw);
  return d.length >= 3 && d.length <= 10;
}

/**
 * Resolve postcode from structured address, free-text address, or explicit value.
 */
export function resolveCompanyPostcode(
  profile: Pick<CompanyProfile, "structuredAddress" | "businessAddress"> | undefined | null,
  explicit?: string | null,
): string {
  const fromExplicit = normalizePostcode(explicit);
  if (fromExplicit) return fromExplicit;
  const fromStructured = normalizePostcode(profile?.structuredAddress?.postcode);
  if (fromStructured) return fromStructured;
  if (profile?.businessAddress?.trim()) {
    return normalizePostcode(
      parseAddressText(profile.businessAddress, "AU").postcode,
    );
  }
  return "";
}

export type CompanyIdentityMatch = {
  company: Company;
  reason: "name_abn_postcode";
};

/**
 * Find an existing non-archived company with the same business name + ABN + postcode.
 * Matches on any two of three alone are NOT duplicates (multi-location / multi-brand).
 */
export function findDuplicateByNameAndAbn(
  companies: Company[],
  businessName: string,
  abn: string | undefined | null,
  postcode: string | undefined | null,
  opts?: { excludeCompanyId?: string },
): CompanyIdentityMatch | null {
  const nameKey = normalizeBusinessName(businessName);
  const abnKey = normalizeAbnDigits(abn);
  const postKey = normalizePostcode(postcode);
  if (!nameKey || abnKey.length !== 11 || !isCompletePostcode(postKey)) {
    return null;
  }

  for (const c of companies) {
    if (opts?.excludeCompanyId && c.id === opts.excludeCompanyId) continue;
    if (c.status === "archived") continue;
    if (normalizeBusinessName(c.name) !== nameKey) continue;
    if (normalizeAbnDigits(c.profile.abn) !== abnKey) continue;
    if (resolveCompanyPostcode(c.profile) !== postKey) continue;
    return { company: c, reason: "name_abn_postcode" };
  }
  return null;
}

/** User-facing block message when (name + ABN + postcode) already exists. */
export function duplicateNameAbnMessage(existing: Company): string {
  const abn = formatAbnDisplay(existing.profile.abn) || "this ABN";
  const post =
    resolveCompanyPostcode(existing.profile) ||
    existing.profile.structuredAddress?.postcode ||
    "this postcode";
  return (
    `A client account already exists for "${existing.name}" with ABN ${abn} ` +
    `at postcode ${post}. Business name + ABN + postcode identify an account — ` +
    `use a different trading name or postcode for another brand/location under ` +
    `the same ABN, or open the existing client.`
  );
}

/**
 * Parse / validate ABN from form input.
 * Empty → ok with no value. Non-empty must be 11 digits.
 */
export function parseAbnInput(raw: string | undefined | null): {
  ok: true;
  abn?: string;
} | { ok: false; error: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, abn: undefined };
  const digits = normalizeAbnDigits(trimmed);
  if (digits.length !== 11) {
    return {
      ok: false,
      error: "ABN must be 11 digits (spaces optional), e.g. 51 824 753 556.",
    };
  }
  return { ok: true, abn: formatAbnDisplay(digits) };
}

/**
 * Parse / validate postcode from form input.
 * Empty → ok with no value. Non-empty must be complete.
 */
export function parsePostcodeInput(raw: string | undefined | null): {
  ok: true;
  postcode?: string;
} | { ok: false; error: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, postcode: undefined };
  const digits = normalizePostcode(trimmed);
  if (!isCompletePostcode(digits)) {
    return {
      ok: false,
      error: "Enter a valid postcode (e.g. 2000).",
    };
  }
  return { ok: true, postcode: digits };
}
