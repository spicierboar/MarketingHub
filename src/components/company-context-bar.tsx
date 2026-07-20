"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  CompanyToolsNav,
  type CompanyToolsAccess,
} from "@/components/company-tools-nav";
import type { AddonId, BusinessType, ManagedServiceLevel } from "@/lib/types";

export type CompanyWorkspaceNavData = {
  id: string;
  name: string;
  status: string;
  businessType: BusinessType;
  activeAddons: AddonId[];
  serviceLevel?: ManagedServiceLevel;
};

/**
 * Client workspace strip for agency module routes with ?company=.
 * Renders the same CompanyToolsNav as /companies/[id] (primary + Brand/Produce/
 * Channels/Ads chips). Company layout already mounts CompanyToolsNav — skip there.
 */
export function CompanyContextBar({
  companies,
  access,
}: {
  companies: CompanyWorkspaceNavData[];
  access: CompanyToolsAccess;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname.startsWith("/companies/")) return null;
  const companyId = searchParams.get("company");
  if (!companyId) return null;
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;

  return (
    <CompanyToolsNav
      companyId={company.id}
      companyName={company.name}
      status={company.status}
      businessType={company.businessType}
      activeAddons={company.activeAddons}
      serviceLevel={company.serviceLevel}
      access={access}
    />
  );
}
