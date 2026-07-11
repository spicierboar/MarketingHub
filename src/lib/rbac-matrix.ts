// Additive permission catalog + suggested role presets.
// Maps onto existing tenant roles (owner/admin/member) without replacing them.
// Optional grants live on tenant_members.capabilities (migration 0036).

import type { User } from "@/lib/types";

// Local mirrors of rbac.ts helpers — keep this module free of a circular import
// with auth/rbac (which re-exports requirePermission → userHasPermission).
function isPlatformAdmin(user: User): boolean {
  return user.platformAdmin === true;
}
function isAdmin(user: User): boolean {
  return user.role === "admin" || user.role === "super_admin";
}
function isTenantOwner(user: User): boolean {
  return user.tenantRole === "owner" || user.role === "super_admin";
}

export type Permission =
  | "manage_budgets"
  | "approve_content"
  | "view_audit"
  | "manage_campaigns"
  | "create_content"
  | "legal_review"
  | "customer_service"
  | "ai_service"
  | "read_only";

export type SuggestedRole =
  | "campaign_manager"
  | "content_creator"
  | "approver"
  | "legal_reviewer"
  | "analyst"
  | "customer_service"
  | "finance_reviewer"
  | "read_only"
  | "ai_service";

export interface PermissionMeta {
  label: string;
  description: string;
}

/** Catalog of fine-grained permissions (capability strings stored on membership). */
export const PERMISSION_CATALOG: Record<Permission, PermissionMeta> = {
  manage_budgets: {
    label: "Manage budgets",
    description: "Set and allocate ad / campaign budgets.",
  },
  approve_content: {
    label: "Approve content",
    description: "Approve or reject content in standard approval queues.",
  },
  view_audit: {
    label: "View audit",
    description: "Read the append-only audit log.",
  },
  manage_campaigns: {
    label: "Manage campaigns",
    description: "Create and manage campaign plans.",
  },
  create_content: {
    label: "Create content",
    description: "Draft and edit marketing content.",
  },
  legal_review: {
    label: "Legal review",
    description: "Review high-risk / compliance-routed content.",
  },
  customer_service: {
    label: "Customer service",
    description: "Handle reviews, mentions, and client replies.",
  },
  ai_service: {
    label: "AI service",
    description: "Invoke AI drafting / orchestration tools.",
  },
  read_only: {
    label: "Read only",
    description: "View dashboards and reports without mutating.",
  },
};

/** Suggested role → permission set (presets for admin UI chips). */
export const SUGGESTED_ROLE_PERMISSIONS: Record<SuggestedRole, Permission[]> = {
  campaign_manager: ["manage_campaigns", "create_content", "approve_content"],
  content_creator: ["create_content"],
  approver: ["approve_content"],
  legal_reviewer: ["legal_review", "approve_content", "view_audit"],
  analyst: ["view_audit", "read_only"],
  customer_service: ["customer_service", "read_only"],
  finance_reviewer: ["manage_budgets", "view_audit"],
  read_only: ["read_only"],
  ai_service: ["ai_service", "create_content"],
};

/**
 * How each suggested role typically maps onto the existing tenant tier.
 * Documentation / UI only — enforcement still uses capabilities + isAdmin fallback.
 */
export const SUGGESTED_ROLE_TENANT_TIER: Record<
  SuggestedRole,
  "owner" | "admin" | "member"
> = {
  campaign_manager: "admin",
  content_creator: "member",
  approver: "admin",
  legal_reviewer: "admin",
  analyst: "member",
  customer_service: "member",
  finance_reviewer: "admin",
  read_only: "member",
  ai_service: "member",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_CATALOG) as Permission[];

export const ALL_SUGGESTED_ROLES = Object.keys(
  SUGGESTED_ROLE_PERMISSIONS,
) as SuggestedRole[];

function capabilitiesOf(user: User): Permission[] | undefined {
  const caps = (user as User & { capabilities?: string[] }).capabilities;
  if (caps == null) return undefined;
  return caps.filter((c): c is Permission => c in PERMISSION_CATALOG);
}

/**
 * Permission check (additive, backward compatible):
 * 1. Platform admin → true
 * 2. Explicit capability grant → true
 * 3. Tenant admin / owner → true (preserves existing admin flows)
 * 4. Legacy users with no capabilities field → isAdmin fallback
 */
export function userHasPermission(user: User, permission: Permission): boolean {
  if (isPlatformAdmin(user)) return true;

  const caps = capabilitiesOf(user);
  if (caps !== undefined) {
    if (caps.includes(permission)) return true;
    // Admins/owners keep full access even when capabilities are set.
    if (isAdmin(user) || isTenantOwner(user)) return true;
    return false;
  }

  // Legacy membership (no capabilities column / unset) — same as today.
  return isAdmin(user);
}

export function isPermission(value: string): value is Permission {
  return value in PERMISSION_CATALOG;
}

export function applySuggestedRole(role: SuggestedRole): Permission[] {
  return [...SUGGESTED_ROLE_PERMISSIONS[role]];
}
