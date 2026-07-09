import { AppShell } from "@/components/app-shell";
import { requireUser, isAdmin, isTenantOwner, isPlatformAdmin } from "@/lib/auth/rbac";
import { getSecuritySettings, getTenant, membershipsForUser } from "@/lib/db";
import { envRibbonLabel } from "@/lib/env";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // requireUser() enforces the onboarding + terms gate (moved into the auth
  // funnel so server actions + API routes are covered too, not just this layout).
  const user = await requireUser();
  const [s, tenant, memberships] = await Promise.all([
    getSecuritySettings(user.tenantId),
    getTenant(user.tenantId),
    membershipsForUser(user.id),
  ]);
  // The workspaces this user can switch between (only rendered when >1).
  const tenants = (
    await Promise.all(
      memberships.map(async (m) => {
        const t = await getTenant(m.tenantId);
        return t ? { id: t.id, name: t.name } : null;
      }),
    )
  ).filter((t): t is { id: string; name: string } => t !== null);
  const banner = s.crisisMode
    ? { tone: "danger" as const, text: `Crisis Communications Mode is active — publishing is frozen and all social replies are escalated.${s.crisisNote ? ` (${s.crisisNote})` : ""}` }
    : s.sandboxMode
      ? { tone: "warning" as const, text: "Sandbox / training mode is active — publishing is disabled." }
      : null;
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      tenantName={tenant?.name ?? "Workspace"}
      activeTenantId={user.tenantId}
      tenants={tenants}
      isAdmin={isAdmin(user)}
      isOwner={isTenantOwner(user)}
      isPlatformAdmin={isPlatformAdmin(user)}
      branding={tenant?.branding ?? null}
      banner={banner}
      envLabel={envRibbonLabel()}
    >
      {children}
    </AppShell>
  );
}
