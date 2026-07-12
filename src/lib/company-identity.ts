// Business identity for MCC company accounts.
//
// Product rule: (business/trading name + ABN) is the account identity key.
// - Same ABN + different business name → separate accounts (allowed).
// - Same business name + same ABN → duplicate (block create / identity updates).
// Technical PK remains Company.id; this is the business uniqueness rule.

import type { Company } from "@/lib/types";

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

export type CompanyIdentityMatch = {
  company: Company;
  reason: "name_and_abn";
};

/**
 * Find an existing non-archived company with the same business name + ABN.
 * ABN-only or name-only matches are NOT duplicates (separate trading names
 * under one ABN are separate accounts).
 */
export function findDuplicateByNameAndAbn(
  companies: Company[],
  businessName: string,
  abn: string | undefined | null,
  opts?: { excludeCompanyId?: string },
): CompanyIdentityMatch | null {
  const nameKey = normalizeBusinessName(businessName);
  const abnKey = normalizeAbnDigits(abn);
  if (!nameKey || abnKey.length !== 11) return null;

  for (const c of companies) {
    if (opts?.excludeCompanyId && c.id === opts.excludeCompanyId) continue;
    if (c.status === "archived") continue;
    if (normalizeBusinessName(c.name) !== nameKey) continue;
    if (normalizeAbnDigits(c.profile.abn) !== abnKey) continue;
    return { company: c, reason: "name_and_abn" };
  }
  return null;
}

/** User-facing block message when (name + ABN) already exists. */
export function duplicateNameAbnMessage(existing: Company): string {
  const abn = formatAbnDisplay(existing.profile.abn) || "this ABN";
  return (
    `A client account already exists for "${existing.name}" with ABN ${abn}. ` +
    `Business name + ABN identify an account — use a different trading name ` +
    `for another brand under the same ABN, or open the existing client.`
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
