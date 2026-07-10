"use server";

import { revalidatePath } from "next/cache";
import {
  createLegalHold,
  getLegalHold,
  getMembership,
  getUser,
  releaseLegalHold,
  updateSecuritySettings,
  getSecuritySettings,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  beginMfaEnrollment,
  completeMfaEnrollment,
  startImpersonation,
  stopImpersonation,
} from "@/lib/security-slice";
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

export async function beginMfaEnrollmentAction() {
  const user = await requireAdmin();
  const result = beginMfaEnrollment(user.tenantId, user.id);
  await logAction(user, result.ok ? "mfa.enrollment_started" : "mfa.enrollment_stub", {
    detail: result.message ?? result.record.status,
  });
  revalidatePath("/admin");
}

export async function completeMfaEnrollmentAction() {
  const user = await requireAdmin();
  const result = completeMfaEnrollment(user.tenantId, user.id);
  if (!result.ok) throw new Error(result.message ?? "MFA completion failed");
  await logAction(user, "mfa.enrollment_completed", { detail: "OAuth MFA enabled" });
  revalidatePath("/admin");
}

export async function startImpersonationAction(formData: FormData) {
  const user = await requireAdmin();
  const targetUserId = text(formData, "targetUserId");
  if (!targetUserId) throw new Error("Target user required");
  const target = await getUser(targetUserId);
  if (!target) throw new Error("User not found");
  const membership = await getMembership(user.tenantId, targetUserId);
  if (!membership) throw new Error("User is not a member of this tenant");
  const result = startImpersonation(user, {
    id: target.id,
    email: target.email,
    tenantId: user.tenantId,
  });
  if (!result.ok) throw new Error(result.error ?? "Impersonation blocked");
  await logAction(user, "impersonation.started", {
    targetType: "user",
    targetId: target.id,
    detail: result.audit?.detail,
  });
  revalidatePath("/admin");
}

export async function stopImpersonationAction() {
  const user = await requireAdmin();
  const result = stopImpersonation(user);
  if (!result.ok) throw new Error(result.error ?? "No active impersonation");
  await logAction(user, "impersonation.stopped", {
    targetType: "user",
    targetId: result.audit?.targetUserId,
    detail: result.audit?.detail,
  });
  revalidatePath("/admin");
}
