"use server";

import { revalidatePath } from "next/cache";
import {
  createLegalHold,
  getLegalHold,
  releaseLegalHold,
  updateSecuritySettings,
  getSecuritySettings,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import type { LegalHoldScope } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

// Crisis Communications Mode (§33) — freezes publishing + escalates all replies.
export async function toggleCrisisAction(formData: FormData) {
  const user = await requireAdmin();
  const on = !(await getSecuritySettings(user.tenantId)).crisisMode;
  await updateSecuritySettings(user.tenantId, {
    crisisMode: on,
    crisisNote: on ? text(formData, "note") || undefined : undefined,
    updatedById: user.id,
  });
  await logAction(user, on ? "crisis.enabled" : "crisis.disabled", {
    detail: on ? text(formData, "note") : "Crisis mode lifted",
  });
  revalidatePath("/admin");
  revalidatePath("/publishing");
}

// Sandbox / training mode (§56) — blocks publishing, labels outputs as test.
export async function toggleSandboxAction() {
  const user = await requireAdmin();
  const on = !(await getSecuritySettings(user.tenantId)).sandboxMode;
  await updateSecuritySettings(user.tenantId, { sandboxMode: on, updatedById: user.id });
  await logAction(user, on ? "sandbox.enabled" : "sandbox.disabled", {});
  revalidatePath("/admin");
  revalidatePath("/publishing");
}

// Data retention (§53) + AI cost cap settings.
export async function saveSecuritySettingsAction(formData: FormData) {
  const user = await requireAdmin();
  const retentionDays = Math.max(30, Number(formData.get("retentionDays")) || 730);
  const aiMonthlyCapUsd = Math.max(0, Number(formData.get("aiMonthlyCapUsd")) || 0);
  await updateSecuritySettings(user.tenantId, { retentionDays, aiMonthlyCapUsd, updatedById: user.id });
  await logAction(user, "security.settings_saved", {
    detail: `retention ${retentionDays}d · AI cap $${aiMonthlyCapUsd}`,
  });
  revalidatePath("/admin");
}

// Legal hold (§54) — apply / release.
export async function applyLegalHoldAction(formData: FormData) {
  const scope = text(formData, "scope") as LegalHoldScope;
  const targetId = text(formData, "targetId");
  const companyId = text(formData, "companyId");
  const reason = text(formData, "reason");
  if (!(["content", "social", "company"] as string[]).includes(scope)) {
    throw new Error("Invalid legal hold scope.");
  }
  if (!targetId || !companyId || !reason) {
    throw new Error("Scope target, company and reason are required.");
  }
  // Tenant pin: admin + company must belong to the acting user's tenant.
  const user = await assertAdminCompanyAccess(companyId);
  await createLegalHold({ tenantId: user.tenantId, scope, targetId, companyId, reason, appliedById: user.id });
  await logAction(user, "legal_hold.applied", {
    targetType: scope,
    targetId,
    companyId,
    detail: reason,
  });
  revalidatePath("/admin/legal-hold");
}

export async function releaseLegalHoldAction(formData: FormData) {
  const user = await requireAdmin();
  const holdId = text(formData, "holdId");
  const hold = await getLegalHold(holdId);
  if (!hold) throw new Error("Legal hold not found");
  // Tenant pin: the hold must belong to the acting user's tenant.
  if (hold.tenantId !== user.tenantId) {
    throw new Error("Forbidden: no access to this legal hold");
  }
  await releaseLegalHold(holdId, user.id);
  await logAction(user, "legal_hold.released", {
    targetType: hold.scope,
    targetId: hold.targetId,
    companyId: hold.companyId,
    detail: hold.reason,
  });
  revalidatePath("/admin/legal-hold");
}
