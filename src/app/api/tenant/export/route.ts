// Tenant data export (GDPR / Privacy Act data-subject / portability). Owner-only.
// Bundles every record the tenant owns into a JSON download. Publishing tokens
// are redacted. Scoped strictly to the acting owner's OWN tenant — never a
// tenant id from the request.

import { NextResponse } from "next/server";
import { exportTenantData, getTenant } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isTenantOwner } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isTenantOwner(user)) {
    return NextResponse.json({ error: "owner only" }, { status: 403 });
  }
  const tenant = await getTenant(user.tenantId);
  const data = await exportTenantData(user.tenantId);
  await logAction(user, "tenant.data_exported", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: "Full tenant data export",
  });
  const slug = (tenant?.name ?? "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}-export.json"`,
    },
  });
}
