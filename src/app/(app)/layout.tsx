import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  requireUser,
  isAdmin,
  isTenantOwner,
  isPlatformAdmin,
  isPortalUser,
  isSalesRep,
  canAccessFieldSales,
  userHasPermission,
  canCreateContent,
} from "@/lib/auth/rbac";
import {
  accessForUser,
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
  const admin = isAdmin(user);

  // One company list per navigation — accessibleCompanyIds would list again.
  const [s, tenant, memberships, allCompanies, entitlements, accessRows] =
    await Promise.all([
      getSecuritySettings(user.tenantId),
      getTenant(user.tenantId),
      membershipsForUser(user.id),
      listCompanies(user.tenantId),
      listCompanyEntitlements(user.tenantId),
      admin ? Promise.resolve(null) : accessForUser(user.id),
    ]);

  const tenantCompanyIds = new Set(allCompanies.map((c) => c.id));
  const allowed = admin
    ? tenantCompanyIds
    : new Set(
        (accessRows ?? [])
          .map((a) => a.companyId)
          .filter((id) => tenantCompanyIds.has(id)),
      );

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

  // Reuse the active tenant row; only fetch other memberships.
  const otherTenantIds = memberships
    .map((m) => m.tenantId)
    .filter((id) => id !== user.tenantId);
  const otherTenants = await Promise.all(otherTenantIds.map((id) => getTenant(id)));
  const tenants = [
    ...(tenant ? [{ id: tenant.id, name: tenant.name }] : []),
    ...otherTenants
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ id: t.id, name: t.name })),
  ];

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
      isAdmin={admin}
      isOwner={isTenantOwner(user)}
      isPlatformAdmin={isPlatformAdmin(user)}
      canApprove={userHasPermission(user, "approve_content")}
      canCreate={canCreateContent(user)}
      canViewAudit={userHasPermission(user, "view_audit")}
      canFieldSales={canAccessFieldSales(user)}
      isSalesRepFocused={isSalesRep(user) && !admin}
      branding={tenant?.branding ?? null}
      banner={banner}
      envLabel={envRibbonLabel()}
    >
      {children}
    </AppShell>
  );
}
