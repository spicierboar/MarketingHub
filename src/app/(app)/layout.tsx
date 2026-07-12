import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  requireUser,
  isAdmin,
  isTenantOwner,
  isPlatformAdmin,
  isPortalUser,
  canAccessFieldSales,
  accessibleCompanyIds,
} from "@/lib/auth/rbac";
import {
  getSecuritySettings,
  getTenant,
  listCompanies,
  listCompanyEntitlements,
  membershipsForUser,
} from "@/lib/db";
import { ADDON_ORDER } from "@/lib/addons";
import { resolveBusinessType } from "@/lib/business-profiles";
import { envRibbonLabel } from "@/lib/env";
import type { AddonId } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (await isPortalUser(user)) redirect("/client");
  const [s, tenant, memberships, allCompanies, allowedIds, entitlements] =
    await Promise.all([
      getSecuritySettings(user.tenantId),
      getTenant(user.tenantId),
      membershipsForUser(user.id),
      listCompanies(user.tenantId),
      accessibleCompanyIds(user),
      listCompanyEntitlements(user.tenantId),
    ]);
  const allowed = new Set(allowedIds);
  const activeByCompany = new Map<string, AddonId[]>();
  for (const e of entitlements) {
    if (e.status !== "active") continue;
    const list = activeByCompany.get(e.companyId) ?? [];
    list.push(e.addonId);
    activeByCompany.set(e.companyId, list);
  }
  const companies = allCompanies
    .filter((c) => allowed.has(c.id))
    .map((c) => {
      const active = new Set(activeByCompany.get(c.id) ?? []);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        businessType: resolveBusinessType(c),
        activeAddons: ADDON_ORDER.filter((a) => active.has(a)),
        serviceLevel: c.profile.managedService?.serviceLevel,
      };
    });
  const tenants = (await Promise.all(memberships.map(async (m) => {
    const t = await getTenant(m.tenantId);
    return t ? { id: t.id, name: t.name } : null;
  }))).filter((t): t is { id: string; name: string } => t !== null);
  const banner = s.crisisMode
    ? { tone: "danger" as const, text: `Crisis Communications Mode is active — publishing is frozen and all social replies are escalated.${s.crisisNote ? ` (${s.crisisNote})` : ""}` }
    : s.sandboxMode ? { tone: "warning" as const, text: "Sandbox / training mode is active — publishing is disabled." } : null;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      tenantName={tenant?.name ?? "Workspace"}
      activeTenantId={user.tenantId}
      tenants={tenants}
      companies={companies}
      isAdmin={isAdmin(user)}
      isOwner={isTenantOwner(user)}
      isPlatformAdmin={isPlatformAdmin(user)}
      canFieldSales={canAccessFieldSales(user)}
      branding={tenant?.branding ?? null}
      banner={banner}
      envLabel={envRibbonLabel()}
    >
      {children}
    </AppShell>
  );
}
