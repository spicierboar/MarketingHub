// Entitlement engine (Module 3 — payment-tier matrix). The thin gate layer the
// deliverable modules (AI visuals / video, photo shoots, restaurant menus,
// "Order Now") call to check whether a given CLIENT COMPANY has purchased the
// add-on that unlocks the feature.
//
// The base PLAN (plans.ts / billing.ts) is a tenant-level subscription; add-ons
// are per-company. companyHasAddon / assertCompanyAddon are company-scoped single
// lookups (used at a feature's entry point, AFTER the caller has already gated
// company access via assertCompanyAccess). companyAddonMap / tenantAddonSummary
// take the tenant id (the isolation rule for anything list-shaped).

import {
  getCompanyEntitlement,
  listCompanyEntitlements,
} from "@/lib/db";
import { ADDON_ORDER, ADDONS } from "@/lib/addons";
import type { AddonId, CompanyEntitlement } from "@/lib/types";

// The gate. True iff the company has an ACTIVE entitlement for the add-on.
// Fail-closed: an unknown add-on id or a cancelled/absent row → false.
export async function companyHasAddon(
  companyId: string,
  addonId: AddonId,
): Promise<boolean> {
  const ent = await getCompanyEntitlement(companyId, addonId);
  return ent?.status === "active";
}

// Throwing form for a feature entry point. The deliverable modules call this so
// an un-entitled request is refused with a clear, upsell-shaped message.
export async function assertCompanyAddon(
  companyId: string,
  addonId: AddonId,
): Promise<void> {
  if (!(await companyHasAddon(companyId, addonId))) {
    const name = ADDONS[addonId]?.name ?? addonId;
    throw new Error(
      `The "${name}" add-on isn't enabled for this company. Enable it on the Billing page to use this feature.`,
    );
  }
}

// The on/off state of every add-on for one company (matrix row / company card).
export async function companyAddonMap(
  tenantId: string,
  companyId: string,
): Promise<Record<AddonId, boolean>> {
  const rows = await listCompanyEntitlements(tenantId, companyId);
  const active = new Set(
    rows.filter((e) => e.status === "active").map((e) => e.addonId),
  );
  return Object.fromEntries(ADDON_ORDER.map((a) => [a, active.has(a)])) as Record<
    AddonId,
    boolean
  >;
}

// The add-ons a company currently has (for a read-only badge list).
export async function activeAddonsForCompany(
  tenantId: string,
  companyId: string,
): Promise<AddonId[]> {
  const rows = await listCompanyEntitlements(tenantId, companyId);
  return ADDON_ORDER.filter((a) =>
    rows.some((e) => e.addonId === a && e.status === "active"),
  );
}

export interface TenantAddonSummary {
  activeCount: number; // total active entitlements across the tenant
  estMonthlyAud: number; // sum of catalogue prices for active entitlements
  byAddon: Record<AddonId, number>; // how many companies have each add-on active
  entitlements: CompanyEntitlement[]; // active rows (for per-company rendering)
}

// Tenant-wide roll-up for the Billing page: how many add-ons are live and the
// estimated add-on revenue on top of the base plan.
export async function tenantAddonSummary(
  tenantId: string,
): Promise<TenantAddonSummary> {
  const rows = (await listCompanyEntitlements(tenantId)).filter(
    (e) => e.status === "active",
  );
  const byAddon = Object.fromEntries(ADDON_ORDER.map((a) => [a, 0])) as Record<
    AddonId,
    number
  >;
  let estMonthlyAud = 0;
  for (const e of rows) {
    if (e.addonId in byAddon) {
      byAddon[e.addonId] += 1;
      estMonthlyAud += ADDONS[e.addonId]?.priceAudMonthly ?? 0;
    }
  }
  return { activeCount: rows.length, estMonthlyAud, byAddon, entitlements: rows };
}
