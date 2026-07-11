import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { resolveBusinessType } from "@/lib/business-profiles";
import { activeAddonsForCompany } from "@/lib/entitlements";
import { CompanyToolsNav } from "@/components/company-tools-nav";

export default async function CompanyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const [businessType, activeAddons] = await Promise.all([
    Promise.resolve(resolveBusinessType(company)),
    activeAddonsForCompany(user.tenantId, company.id),
  ]);

  return (
    <div>
      <CompanyToolsNav
        companyId={company.id}
        companyName={company.name}
        status={company.status}
        businessType={businessType}
        activeAddons={activeAddons}
        serviceLevel={company.profile.managedService?.serviceLevel}
      />
      {children}
    </div>
  );
}
