// Ready-made promo allowance vs package entitlement (over-allowance → extra).
// Mirrors menu-design included/billable quota; period is month or quarter
// when promosIncludedPerMonth is fractional (e.g. Basic 1/3 ≈ 1/quarter).

import { resolveCompanyPackage } from "@/lib/marketing-packages";
import type {
  ClientPromoSelection,
  Company,
  PromoBillingClass,
  Tenant,
} from "@/lib/types";

/**
 * Quota period key.
 * Fractional monthly rates (&lt; 1) use calendar quarters (`YYYY-Qn`);
 * otherwise calendar months (`YYYY-MM`).
 */
export function promoPeriodKey(
  isoDate: string = new Date().toISOString(),
  promosIncludedPerMonth = 1,
): string {
  const ym = isoDate.slice(0, 7);
  if (promosIncludedPerMonth > 0 && promosIncludedPerMonth < 1) {
    const month = Number(ym.slice(5, 7));
    const q = Math.ceil(month / 3);
    return `${ym.slice(0, 4)}-Q${q}`;
  }
  return ym;
}

function selectionPeriodKey(
  s: ClientPromoSelection,
  promosIncludedPerMonth: number,
): string {
  if (s.periodKey) return s.periodKey;
  return promoPeriodKey(s.requestedAt || s.startDate, promosIncludedPerMonth);
}

/** Non-cancelled included promos that consume a quota slot for the period. */
export function includedPromosUsedInPeriod(
  selections: ClientPromoSelection[],
  periodKey: string,
  promosIncludedPerMonth = 1,
): number {
  return selections.filter(
    (s) =>
      s.billingClass === "included" &&
      selectionPeriodKey(s, promosIncludedPerMonth) === periodKey &&
      s.status !== "cancelled",
  ).length;
}

/** How many included promo slots this period allows. */
export function includedPromoLimitForPeriod(promosIncludedPerMonth: number): number {
  if (!Number.isFinite(promosIncludedPerMonth) || promosIncludedPerMonth <= 0) {
    return 0;
  }
  // Fractional monthly rates use a quarter period — convert to whole slots
  // (e.g. Basic 1/3 → 1/quarter; Custom 2/3 → 2/quarter). Do not clamp to 1.
  if (promosIncludedPerMonth < 1) {
    return Math.max(1, Math.round(promosIncludedPerMonth * 3));
  }
  return Math.round(promosIncludedPerMonth);
}

export function promoAllowanceSummary(
  company: Company,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
  asOfIso: string = new Date().toISOString(),
): {
  periodKey: string;
  used: number;
  limit: number;
  remaining: number;
  promosIncludedPerMonth: number;
} {
  const pkg = resolveCompanyPackage(company, tenant);
  const rate = pkg.promosIncludedPerMonth;
  const periodKey = promoPeriodKey(asOfIso, rate);
  const limit = includedPromoLimitForPeriod(rate);
  const used = includedPromosUsedInPeriod(
    company.profile.promoSelections ?? [],
    periodKey,
    rate,
  );
  return {
    periodKey,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    promosIncludedPerMonth: rate,
  };
}

/** Resolve billing class for a new promo request (included while quota remains). */
export function resolvePromoBillingClass(
  company: Company,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
  asOfIso: string = new Date().toISOString(),
): PromoBillingClass {
  const { remaining } = promoAllowanceSummary(company, tenant, asOfIso);
  return remaining > 0 ? "included" : "extra";
}

/**
 * Optional default custom-work fee from Custom package rate card.
 * Returns null → UI shows "Quoted by agency".
 */
export function resolveCustomWorkFeeAud(
  company: Company,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
): number | null {
  const pkg = resolveCompanyPackage(company, tenant);
  const rates = pkg.customModuleRates ?? {};
  for (const key of ["custom_work", "customWork", "extra_work", "extraWork"]) {
    const v = rates[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export function promoBillingLabel(billingClass: PromoBillingClass | undefined): string {
  return billingClass === "included" ? "Included" : "Extra";
}
