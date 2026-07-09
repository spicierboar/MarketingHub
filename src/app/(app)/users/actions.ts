"use server";

import { revalidatePath } from "next/cache";
import {
  addMembership,
  createUser,
  getMembership,
  getUser,
  getUserByEmail,
  grantAccess,
  revokeAccess,
  revokeUserSessions,
  setMemberRoleTitle,
  setUserActive,
} from "@/lib/db";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { ROLE_TITLE_TIER, type Role, type RoleTitle } from "@/lib/types";

export async function createUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "user") as Role;
  const companyId = String(formData.get("companyId") || "");
  if (!email || !name) throw new Error("Name and email are required");
  // Tenant pin BEFORE any mutation: the assigned company must belong to the
  // acting admin's tenant.
  if (companyId && !(await canAccessCompany(admin, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }

  // Identity is global; membership is per-tenant. If the email already exists,
  // do NOT mint a duplicate identity — attach a membership for the existing
  // user to this tenant instead.
  const existing = await getUserByEmail(email);
  const user = existing ?? (await createUser({ email, name, role }));
  await addMembership({
    tenantId: admin.tenantId,
    userId: user.id,
    role: role === "user" ? "member" : "admin",
  });
  if (companyId) await grantAccess(user.id, companyId);

  await logAction(admin, "user.created", {
    targetType: "user",
    targetId: user.id,
    detail: `${name} (${role})`,
  });
  revalidatePath("/users");
}

export async function setUserActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const active = formData.get("active") === "true";
  // Tenant pin: the target must be a member of the acting admin's tenant.
  const membership = await getMembership(admin.tenantId, userId);
  if (!membership) throw new Error("User is not a member of your organisation");
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");

  await setUserActive(userId, active);
  if (!active) await revokeUserSessions(userId); // deactivation kills all sessions

  await logAction(admin, active ? "user.reactivated" : "user.deactivated", {
    targetType: "user",
    targetId: userId,
    detail: user.email,
  });
  revalidatePath("/users");
}

// Assign a granular role title (§9); the enforcement tier syncs to match.
export async function setRoleTitleAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const roleTitle = String(formData.get("roleTitle") || "") as RoleTitle;
  // Tenant pin: the target must be a member of the acting admin's tenant.
  const membership = await getMembership(admin.tenantId, userId);
  if (!membership) throw new Error("User is not a member of your organisation");
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  // Reject unknown titles — an invalid title would map the enforcement tier to
  // undefined and corrupt the account.
  if (!(roleTitle in ROLE_TITLE_TIER)) throw new Error("Unknown role title");
  await setMemberRoleTitle(admin.tenantId, userId, roleTitle);
  await logAction(admin, "user.role_changed", {
    targetType: "user",
    targetId: userId,
    detail: `${user.email} → ${roleTitle}`,
  });
  revalidatePath("/users");
}

export async function revokeSessionsAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  // Tenant pin: the target must be a member of the acting admin's tenant.
  const membership = await getMembership(admin.tenantId, userId);
  if (!membership) throw new Error("User is not a member of your organisation");
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  await revokeUserSessions(userId);
  await logAction(admin, "user.sessions_revoked", {
    targetType: "user",
    targetId: userId,
    detail: user.email,
  });
  revalidatePath("/users");
}

export async function grantAccessAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const companyId = String(formData.get("companyId") || "");
  if (!userId || !companyId) return;
  // Tenant pins: target user must be a member of the admin's tenant AND the
  // company must belong to the admin's tenant.
  const membership = await getMembership(admin.tenantId, userId);
  if (!membership) throw new Error("User is not a member of your organisation");
  if (!(await canAccessCompany(admin, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await grantAccess(userId, companyId);
  await logAction(admin, "user.access_granted", {
    targetType: "user",
    targetId: userId,
    companyId,
  });
  revalidatePath("/users");
}

export async function revokeAccessAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const companyId = String(formData.get("companyId") || "");
  // Tenant pins: target user must be a member of the admin's tenant AND the
  // company must belong to the admin's tenant.
  const membership = await getMembership(admin.tenantId, userId);
  if (!membership) throw new Error("User is not a member of your organisation");
  if (!(await canAccessCompany(admin, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await revokeAccess(userId, companyId);
  await logAction(admin, "user.access_revoked", {
    targetType: "user",
    targetId: userId,
    companyId,
  });
  revalidatePath("/users");
}
