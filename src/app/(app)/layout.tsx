import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser, isAdmin, isTenantOwner, isPlatformAdmin, isPortalUser } from "@/lib/auth/rbac";
import { getSecuritySettings, getTenant, membershipsForUser } from "@/lib/db";
import { envRibbonLabel } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (await isPortalUser(user)) redirect("/client");
  const [s, tenant, memberships] = await Promise.all([
    getSecuritySettings(user.tenantId), getTenant(user.tenantId), membershipsForUser(user.id),
  ]);
  const tenants = (await Promise.all(memberships.map(async (m) => {
    const t = await getTenant(m.tenantId);
    return t ? { id: t.id, name: t.name } : null;
  }))).filter((t): t is { id: string; name: string } => t !== null);
  const banner = s.crisisMode
    ? { tone: "danger" as const, text: `Crisis Communications Mode is active — publishing is frozen and all social replies are escalated.${s.crisisNote ? ` (${s.crisisNote})` : ""}` }
    : s.sandboxMode ? { tone: "warning" as const, text: "Sandbox / training mode is active — publishing is disabled." } : null;
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} tenantName={tenant?.name ?? "Workspace"} activeTenantId={user.tenantId} tenants={tenants} isAdmin={isAdmin(user)} isOwner={isTenantOwner(user)} isPlatformAdmin={isPlatformAdmin(user)} branding={tenant?.branding ?? null} banner={banner} envLabel={envRibbonLabel()}>
      {children}
    </AppShell>
  );
}
