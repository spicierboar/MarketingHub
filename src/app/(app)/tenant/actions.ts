"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenant } from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { setActiveTenant } from "@/lib/auth/session";
import { logAction } from "@/lib/audit";

// Tenant switcher (T3): a user who belongs to several workspaces switches the
// active one. setActiveTenant verifies membership server-side.
export async function switchTenantAction(formData: FormData) {
  const user = await requireUser();
  const tenantId = String(formData.get("tenantId") || "");
  if (tenantId === user.tenantId) {
    revalidatePath("/dashboard");
    return;
  }
  const ok = await setActiveTenant(user.id, tenantId);
  if (!ok) throw new Error("You are not a member of that workspace.");
  const tenant = await getTenant(tenantId);
  await logAction(user, "tenant.switched", {
    tenantId,
    detail: `→ ${tenant?.name ?? tenantId}`,
  });
  redirect("/dashboard");
}
