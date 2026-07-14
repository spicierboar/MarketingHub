// Role-based access control + tenant/company scoping (SaaS T1).
//
// Tenancy model: identity is global; membership is per-tenant. The session
// resolver (auth/session.ts) stamps the acting user with tenantId/tenantRole
// and derives the legacy `role` tier from the membership — so every tier check
// below means "within the active tenant". `super_admin` ≙ tenant OWNER.
// The platform operator (`platformAdmin`) curates platform-level resources and
// gets NO implicit access to tenant data.
//
// This is the app-layer mirror of the Postgres Row-Level Security policies
// used in the production Supabase path.

import { redirect } from "next/navigation";
import {
  accessForUser,
  currentTerms,
  getCompany,
  getMembership,
  getTenant,
  hasAcceptedTerms,
  listCompanies,
} from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { userHasPermission, type Permission } from "@/lib/rbac-matrix";
import type { ActingUser, User } from "@/lib/types";
export type { ActingUser } from "@/lib/types";
export { userHasPermission } from "@/lib/rbac-matrix";
export type { Permission } from "@/lib/rbac-matrix";

// Company ids a portal client may access — member role, scoped to the active tenant.
async function portalCompanyIdsInTenant(user: ActingUser): Promise<string[]> {
  if (user.tenantRole !== "member") return [];
  const tenantIds = new Set((await listCompanies(user.tenantId)).map((c) => c.id));
  return (await accessForUser(user.id))
    .map((a) => a.companyId)
    .filter((id) => tenantIds.has(id));
}

// Portal user = explicit portal_only on membership, or tenant member with exactly
// one company_access row in the tenant (inference path when flag unset).
export async function isPortalUser(user: ActingUser): Promise<boolean> {
  if (user.tenantRole !== "member") return false;
  const membership = await getMembership(user.tenantId, user.id);
  if (membership?.portalOnly === true) return true;
  return (await portalCompanyIdsInTenant(user)).length === 1;
}

export async function portalCompanyId(user: ActingUser): Promise<string | null> {
  const ids = await portalCompanyIdsInTenant(user);
  return ids.length === 1 ? ids[0] : null;
}

// Central post-login redirect: portal → /client, incomplete owner → /onboarding, else /dashboard.
export async function postLoginRedirectPath(user: ActingUser): Promise<string> {
  if (await isPortalUser(user)) return "/client";
  const tenant = await getTenant(user.tenantId);
  // Agency seats are ops workspaces — client wizard must not trap agency owners.
  if (
    tenant &&
    !tenant.onboardingCompletedAt &&
    tenant.kind !== "agency" &&
    isTenantOwner(user)
  ) {
    return "/onboarding";
  }
  return "/dashboard";
}

export function isAdmin(user: User): boolean {
  return user.role === "admin" || user.role === "super_admin";
}

export function isSalesRep(user: ActingUser): boolean {
  return (user.roleTitle as string | undefined) === "sales_rep";
}

export function canAccessFieldSales(user: ActingUser): boolean {
  return isAdmin(user) || isSalesRep(user);
}

export function isTenantOwner(user: User): boolean {
  return user.tenantRole === "owner" || user.role === "super_admin";
}

// Platform operator — curates the platform template library, ops surfaces.
export function isPlatformAdmin(user: User): boolean {
  return user.platformAdmin === true;
}

// Company ids a user may see — ALWAYS an explicit list, never a "[] means all"
// sentinel (that convention died with single-tenancy: it would leak across
// tenants). Tenant admins get every company of their tenant; members get their
// assigned subset (intersected with the tenant, defensively).
export async function accessibleCompanyIds(user: ActingUser): Promise<string[]> {
  const tenantCompanies = await listCompanies(user.tenantId);
  if (isAdmin(user)) return tenantCompanies.map((c) => c.id);
  const tenantIds = new Set(tenantCompanies.map((c) => c.id));
  return (await accessForUser(user.id))
    .map((a) => a.companyId)
    .filter((id) => tenantIds.has(id));
}

// Tenant check FIRST — a company outside the user's tenant is invisible even
// to tenant admins. This single function is why every company-scoped action
// is tenant-isolated: they all pass through here.
export async function canAccessCompany(
  user: ActingUser,
  companyId: string,
): Promise<boolean> {
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== user.tenantId) return false;
  if (isAdmin(user)) return true;
  return (await accessForUser(user.id)).some((a) => a.companyId === companyId);
}

// Raw session guard: signed-in or redirect to /login. Does NOT enforce the
// onboarding/terms gate — used by the gate routes themselves (/onboarding,
// /accept-terms) so they don't redirect to themselves in a loop.
export async function requireUserRaw(): Promise<ActingUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// The onboarding + terms gate, enforced HERE (not just in the (app) layout) so
// that it also covers server actions and API routes — a layout only runs on
// page navigations, so a layout-only gate is bypassable by a direct action/API
// call. Every guarded surface funnels through requireUser (directly or via
// requireAdmin/requireTenantOwner/assertCompanyAccess), so putting the gate here
// closes that hole. The two gate routes use requireUserRaw to avoid a loop.
async function enforceOnboardingAndTerms(user: ActingUser): Promise<void> {
  const tenant = await getTenant(user.tenantId);
  // A not-yet-onboarded HOLDING tenant's OWNER must finish client onboarding.
  // Platform agency seats (kind=agency) are ops — never trap them in the client wizard.
  if (
    tenant &&
    !tenant.onboardingCompletedAt &&
    tenant.kind !== "agency" &&
    isTenantOwner(user)
  ) {
    redirect("/onboarding");
  }
  // Everyone must have accepted the CURRENT terms version.
  const terms = await currentTerms();
  if (terms && !(await hasAcceptedTerms(user.id, terms.version))) {
    redirect("/accept-terms");
  }
}

// Guards for server components / actions. Redirect to /login when signed out,
// then enforce the onboarding + terms gate on every call.
export async function requireUser(): Promise<ActingUser> {
  const user = await requireUserRaw();
  await enforceOnboardingAndTerms(user);
  return user;
}

// Raw owner guard (no onboarding/terms gate) — for the onboarding wizard's own
// actions/pages, which run BEFORE onboarding is complete.
export async function requireTenantOwnerRaw(): Promise<ActingUser> {
  const user = await requireUserRaw();
  if (!isTenantOwner(user)) redirect("/dashboard");
  return user;
}

export async function requireAdmin(): Promise<ActingUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");
  return user;
}

/** Additive permission gate — admins/owners still pass via userHasPermission. */
export async function requirePermission(permission: Permission): Promise<ActingUser> {
  const user = await requireUser();
  if (!userHasPermission(user, permission)) redirect("/dashboard");
  return user;
}

export async function requireSalesRepOrAdmin(): Promise<ActingUser> {
  const user = await requireUser();
  if (!canAccessFieldSales(user)) redirect("/dashboard");
  return user;
}

// Billing and other commercial decisions belong to the tenant OWNER — a
// tenant admin runs marketing, not the subscription.
export async function requireTenantOwner(): Promise<ActingUser> {
  const user = await requireUser();
  if (!isTenantOwner(user)) redirect("/dashboard");
  return user;
}

export async function requirePlatformAdmin(): Promise<ActingUser> {
  const user = await requireUser();
  if (!isPlatformAdmin(user)) redirect("/dashboard");
  return user;
}

export async function requirePortalUser(): Promise<{
  user: ActingUser;
  companyId: string;
}> {
  const user = await requireUser();
  if (!(await isPortalUser(user))) redirect("/dashboard");
  const companyId = await portalCompanyId(user);
  if (!companyId) redirect("/dashboard");
  return { user, companyId };
}

// For server actions where redirect isn't appropriate — throws instead.
export async function assertCompanyAccess(companyId: string): Promise<ActingUser> {
  const user = await requireUser();
  if (!(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  return user;
}

// Admin-only actions that operate on a company (or a record belonging to one).
// requireAdmin alone is NOT a tenancy guard — an admin of ANOTHER tenant passes
// it. Every admin action must pin the target company to the actor's tenant.
export async function assertAdminCompanyAccess(companyId: string): Promise<ActingUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only admins can perform this action");
  if (!(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  return user;
}
