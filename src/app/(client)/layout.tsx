import { ClientShell } from "@/components/client-shell";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant } from "@/lib/db";
import { envRibbonLabel } from "@/lib/env";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, companyId } = await requirePortalUser();
  const [tenant, company] = await Promise.all([getTenant(user.tenantId), getCompany(companyId)]);
  return (
    <ClientShell
      user={{ name: user.name, email: user.email }}
      tenantName={tenant?.name ?? "Workspace"}
      companyName={company?.name ?? "Your business"}
      branding={tenant?.branding ?? null}
      envLabel={envRibbonLabel()}
    >
      {children}
    </ClientShell>
  );
}
