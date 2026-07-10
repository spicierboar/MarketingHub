import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
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

  return (
    <div>
      <CompanyToolsNav
        companyId={company.id}
        companyName={company.name}
        status={company.status}
      />
      {children}
    </div>
  );
}
