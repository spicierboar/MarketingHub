// Public Order Now storefront loader (Module 5). Guest-facing reads run through
// entitlement + availability gates. Under Supabase (no anon session) we bootstrap
// the company via service role, then scope all reads in runInServiceContext.

import {
  getCompany,
  getOrderingSettings,
  listOrderMenuItemsByCompany,
} from "@/lib/db";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { runInServiceContext } from "@/lib/db/service-context";
import { toDomain } from "@/lib/db/mapper";
import { companyHasAddon } from "@/lib/entitlements";
import { defaultOrderingSettings } from "@/lib/ordering";
import type { Company, OrderMenuItem, OrderingSettings } from "@/lib/types";

const COMPANY_ALIAS = { created_by: "createdBy" } as const;

export interface PublicOrderStorefront {
  company: Company;
  items: OrderMenuItem[];
  settings: OrderingSettings;
}

async function companyTenantId(companyId: string): Promise<{ company: Company; tenantId: string } | null> {
  const direct = await getCompany(companyId);
  if (direct) return { company: direct, tenantId: direct.tenantId };
  if (!isSupabaseConfigured()) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (!data) return null;
  const company = toDomain<Company>(data, COMPANY_ALIAS);
  return { company, tenantId: company.tenantId };
}

export async function loadPublicOrderStorefront(
  companyId: string,
): Promise<PublicOrderStorefront | null> {
  const resolved = await companyTenantId(companyId);
  if (!resolved || resolved.company.status === "archived") return null;

  return runInServiceContext(resolved.tenantId, async () => {
    if (!(await companyHasAddon(companyId, "order_button"))) return null;
    const [items, settingsRow] = await Promise.all([
      listOrderMenuItemsByCompany(companyId),
      getOrderingSettings(companyId),
    ]);
    const settings = settingsRow ?? defaultOrderingSettings(companyId);
    if (!settings.pickupEnabled && !settings.deliveryEnabled) return null;
    return { company: resolved.company, items, settings };
  });
}
