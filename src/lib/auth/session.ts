// Session handling. Two interchangeable backends behind ONE contract:
//
//  • Demo (default): passwordless — a cookie-backed session resolves to an
//    individual user. No password is ever issued. Runs with zero accounts.
//  • Production (when Supabase is configured): Supabase Auth — magic link /
//    OAuth SSO (Google/Microsoft) / passkeys, with mandatory admin 2FA enforced
//    in the Supabase dashboard.
//
// T1 tenancy: identity is GLOBAL (one person, one email — ≙ auth.users);
// membership is PER-TENANT. getCurrentUser resolves the session's active
// tenant membership and stamps the user with tenantId/tenantRole, deriving the
// legacy `role` tier from the membership (owner → super_admin, admin → admin,
// member → user) — so every existing tier check operates within the tenant.
// A user with no membership cannot act.

import { cookies } from "next/headers";
import {
  createSessionRecord,
  getMembership,
  getSessionByToken,
  getUser,
  membershipsForUser,
  revokeSession,
} from "@/lib/db";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import type { ActingUser, RoleTitle, TenantMember, User } from "@/lib/types";
import { TENANT_ROLE_TIER } from "@/lib/types";

export const SESSION_COOKIE = "cc_session";
export const TENANT_COOKIE = "cc_tenant"; // active tenant for multi-tenant users

// Switch the active tenant (tenant switcher / post-signup). Verifies the user
// is actually a member before setting the cookie — never trust the client.
export async function setActiveTenant(userId: string, tenantId: string): Promise<boolean> {
  const membership = await getMembership(tenantId, userId);
  if (!membership) return false;
  const jar = await cookies();
  jar.set(TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

// Stamp tenancy context from a membership onto the user record.
function withMembership(user: User, m: TenantMember): ActingUser {
  return {
    ...user,
    tenantId: m.tenantId,
    tenantRole: m.role,
    role: TENANT_ROLE_TIER[m.role],
    roleTitle: m.roleTitle,
  };
}

export async function getCurrentUser(): Promise<ActingUser | null> {
  // Production: resolve the Supabase Auth session → app_users row.
  if (isSupabaseConfigured()) {
    return getSupabaseUser();
  }
  // Demo: cookie-backed passwordless session.
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getSessionByToken(token);
  if (!session) return null;
  const user = await getUser(session.userId);
  if (!user || !user.active) return null;
  // Resolve the ACTIVE tenant, in priority order, each verified against the
  // user's REAL memberships (a stale/forged cookie can never grant access):
  //   1. the tenant-switcher cookie (cc_tenant) — set when a multi-tenant user
  //      switches workspace;
  //   2. the tenant the session was started in;
  //   3. their deterministic default membership.
  const activeTenant = jar.get(TENANT_COOKIE)?.value;
  const membership =
    (activeTenant ? await getMembership(activeTenant, user.id) : undefined) ??
    (session.tenantId ? await getMembership(session.tenantId, user.id) : undefined) ??
    (await defaultMembership(user.id));
  if (!membership) return null;
  return withMembership(user, membership);
}

// Deterministic default membership for a user (stable tenant on every login).
async function defaultMembership(userId: string): Promise<TenantMember | undefined> {
  const memberships = [...(await membershipsForUser(userId))].sort((a, b) =>
    a.tenantId.localeCompare(b.tenantId),
  );
  return memberships[0];
}

// Map the Supabase Auth user to the application user + tenant membership.
// app_users carries identity; tenant_members carries per-tenant role. The
// active tenant comes from the tenant cookie, else the first membership.
async function getSupabaseUser(): Promise<ActingUser | null> {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const {
    data: { user: authUser },
  } = await sb.auth.getUser();
  if (!authUser) return null;
  const { data } = await sb
    .from("app_users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!data || !data.active) return null;

  const jar = await cookies();
  const activeTenant = jar.get(TENANT_COOKIE)?.value;
  // Deterministic order so a multi-tenant user always defaults to the same
  // tenant; the active-tenant cookie (set by the tenant switcher in T3) narrows
  // to a specific membership, verified against the user's real memberships.
  let q = sb
    .from("tenant_members")
    .select("*")
    .eq("user_id", authUser.id)
    .order("tenant_id", { ascending: true });
  if (activeTenant) q = q.eq("tenant_id", activeTenant);
  const { data: memberships } = await q.limit(1);
  const m = memberships?.[0];
  if (!m) return null;

  const user: User = {
    id: data.id as string,
    email: data.email as string,
    name: data.name as string,
    role: "user",
    active: data.active as boolean,
    platformAdmin: (data.platform_admin as boolean) ?? false,
    createdAt: data.created_at as string,
  };
  return withMembership(user, {
    tenantId: m.tenant_id as string,
    userId: user.id,
    role: m.role as TenantMember["role"],
    roleTitle: (m.role_title as RoleTitle | null) ?? undefined,
    createdAt: m.created_at as string,
  });
}

// Demo-only: start a passwordless cookie session in the user's default tenant.
// In production Supabase issues the session via magic link / OAuth / passkey.
export async function startSession(userId: string): Promise<void> {
  if (isSupabaseConfigured()) return;
  const memberships = await membershipsForUser(userId);
  const session = await createSessionRecord(userId, memberships[0]?.tenantId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function endSession(): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = await getServerSupabase();
    if (sb) await sb.auth.signOut();
    return;
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
  jar.delete(TENANT_COOKIE);
}
