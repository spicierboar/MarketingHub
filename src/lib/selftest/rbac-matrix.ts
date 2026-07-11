// Self-test: additive RBAC matrix — legacy fallback + capability grants.

import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, User } from "@/lib/types";
import { userHasPermission } from "@/lib/rbac-matrix";

function acting(
  overrides: Partial<ActingUser> & Pick<User, "id" | "email" | "name">,
): ActingUser {
  const tenantRole = overrides.tenantRole ?? "member";
  return {
    id: overrides.id,
    email: overrides.email,
    name: overrides.name,
    role: overrides.role ?? TENANT_ROLE_TIER[tenantRole],
    active: true,
    createdAt: new Date().toISOString(),
    tenantId: overrides.tenantId ?? "t_test",
    tenantRole,
    capabilities: overrides.capabilities,
    platformAdmin: overrides.platformAdmin,
  };
}

/** Legacy member (no capabilities) must NOT get manage_budgets; admin must. */
export function checkRbacLegacyAdminFallback(): { ok: boolean; detail: string } {
  const member = acting({
    id: "u_m",
    email: "m@test.dev",
    name: "Member",
    tenantRole: "member",
  });
  const admin = acting({
    id: "u_a",
    email: "a@test.dev",
    name: "Admin",
    tenantRole: "admin",
  });
  const memberDenied = !userHasPermission(member, "manage_budgets");
  const adminAllowed = userHasPermission(admin, "manage_budgets");
  const ok = memberDenied && adminAllowed;
  return {
    ok,
    detail: `member=${userHasPermission(member, "manage_budgets")} admin=${adminAllowed} (want false,true)`,
  };
}

/** Explicit capability grant lets a member approve content without being admin. */
export function checkRbacCapabilityGrant(): { ok: boolean; detail: string } {
  const plain = acting({
    id: "u_plain",
    email: "plain@test.dev",
    name: "Plain",
    tenantRole: "member",
    capabilities: [],
  });
  const granted = acting({
    id: "u_appr",
    email: "appr@test.dev",
    name: "Approver",
    tenantRole: "member",
    capabilities: ["approve_content"],
  });
  const plainDenied = !userHasPermission(plain, "approve_content");
  const grantAllowed = userHasPermission(granted, "approve_content");
  const viewAuditStillDenied = !userHasPermission(granted, "view_audit");
  const ok = plainDenied && grantAllowed && viewAuditStillDenied;
  return {
    ok,
    detail: `plain=${!plainDenied} grant=${grantAllowed} auditLeak=${!viewAuditStillDenied} (want false,true,false)`,
  };
}
