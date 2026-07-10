// Public bookings storefront loader (W7 M50). Guest-facing reads run through
// entitlement + availability gates. Under Supabase we bootstrap the company via
// service role, then scope all reads in runInServiceContext.

import {
  getBookingSettings,
  getCompany,
  listServicePeriodsByCompany,
} from "@/lib/db";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { runInServiceContext } from "@/lib/db/service-context";
import { toDomain } from "@/lib/db/mapper";
import { companyHasAddon } from "@/lib/entitlements";
import { defaultBookingSettings } from "@/lib/bookings";
import type { BookingSettings, Company, ServicePeriod } from "@/lib/types";

const COMPANY_ALIAS = { created_by: "createdBy" } as const;

export interface PublicBookingsStorefront {
  company: Company;
  periods: ServicePeriod[];
  settings: BookingSettings;
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

export async function loadPublicBookingsStorefront(
  companyId: string,
): Promise<PublicBookingsStorefront | null> {
  const resolved = await companyTenantId(companyId);
  if (!resolved || resolved.company.status === "archived") return null;

  return runInServiceContext(resolved.tenantId, async () => {
    if (!(await companyHasAddon(companyId, "bookings"))) return null;
    const [periods, settingsRow] = await Promise.all([
      listServicePeriodsByCompany(companyId),
      getBookingSettings(companyId),
    ]);
    const settings = settingsRow ?? defaultBookingSettings(companyId);
    if (!settings.enabled || periods.length === 0) return null;
    return { company: resolved.company, periods, settings };
  });
}
