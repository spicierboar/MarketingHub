"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addMembership,
  createUser,
  getMembership,
  getUserByEmail,
  membershipsForUser,
  updateMembership,
} from "@/lib/db";
import { startSession, endSession, setActiveTenant } from "@/lib/auth/session";
import { postLoginRedirectPath } from "@/lib/auth/rbac";
import { resetStore } from "@/lib/db/store";
import { localDemoEnabled, devToolsOpen, appEnv } from "@/lib/env";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { logAction } from "@/lib/audit";
import { resolvePlatformAgencyTenant } from "@/lib/platform-agency";
import type { ActingUser, TenantMember, User } from "@/lib/types";
import { TENANT_ROLE_TIER } from "@/lib/types";

function failQuickLogin(message: string): never {
  redirect(`/dev?error=${encodeURIComponent(message.slice(0, 300))}`);
}

function assertDevTools() {
  if (!devToolsOpen()) {
    throw new Error("Dev tools are locked in production.");
  }
}

/** Quick login is for local demo OR staging (never production — gated by assertDevTools). */
function assertQuickLoginAllowed() {
  assertDevTools();
  if (!localDemoEnabled() && appEnv() !== "staging") {
    throw new Error(
      "Quick login needs local demo (CC_LOCAL_DEMO) or a staging deployment.",
    );
  }
}

/** Re-seed in-memory demo data (Wattle + BrightSpark). */
export async function seedDemoDataAction(_formData?: FormData): Promise<void> {
  assertDevTools();
  if (!localDemoEnabled()) {
    throw new Error(
      "Enable CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, then restart npm run dev.",
    );
  }
  resetStore();
  revalidatePath("/", "layout");
  redirect("/dev?seeded=1");
}

/** Clear session + re-seed (fresh demo). */
export async function clearAndReseedAction(_formData?: FormData): Promise<void> {
  assertDevTools();
  if (!localDemoEnabled()) {
    throw new Error(
      "Enable CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, then restart npm run dev.",
    );
  }
  await endSession();
  resetStore();
  revalidatePath("/", "layout");
  redirect("/dev?cleared=1");
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  const named = local
    .replace(/[._+-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return named || email;
}

async function resolveStagingTenant() {
  // Shared resolver also repairs a seat renamed/re-kinded by a prior client-onboarding bug.
  return resolvePlatformAgencyTenant();
}

/**
 * When auth.users already exists (e.g. prior magic-link attempts) but app_users
 * does not, createUser fails — link the identity via admin generateLink (no email).
 */
async function linkExistingAuthUser(email: string): Promise<User> {
  const svc = getServiceSupabase();
  if (!svc) throw new Error(`No account for ${email}`);

  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const authUser = data?.user;
  if (error || !authUser) {
    throw new Error(error?.message ?? `No auth identity for ${email}`);
  }

  const again = await getUserByEmail(email);
  if (again) return again;

  const { data: row, error: insertErr } = await svc
    .from("app_users")
    .insert({
      id: authUser.id,
      email: email.trim(),
      name: nameFromEmail(email),
      active: true,
    })
    .select("*")
    .single();
  if (insertErr || !row) {
    throw new Error(insertErr?.message ?? `Failed to provision app user for ${email}`);
  }

  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: "admin",
    active: (row.active as boolean) ?? true,
    platformAdmin: (row.platform_admin as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}

/** Ensure an active agency owner exists for staging Supabase quick login. */
async function ensureStagingUser(email: string): Promise<User> {
  let user = await getUserByEmail(email);
  if (!user) {
    try {
      user = await createUser({
        email,
        name: nameFromEmail(email),
        role: "admin",
      });
    } catch (createErr) {
      try {
        user = await linkExistingAuthUser(email);
      } catch (linkErr) {
        const a = createErr instanceof Error ? createErr.message : String(createErr);
        const b = linkErr instanceof Error ? linkErr.message : String(linkErr);
        throw new Error(`Could not provision ${email}: ${a} | ${b}`);
      }
    }
  }
  if (!user.active) throw new Error("Account deactivated.");

  // Always attach (or keep) membership on the platform agency seat — orphan
  // holding tenants from prior client-signup experiments must not be the only seat.
  // Promote leftover admin rows to owner so Legal publish is not blocked.
  const tenant = await resolveStagingTenant();
  const existing = await getMembership(tenant.id, user.id);
  if (!existing) {
    await addMembership({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });
  } else if (existing.role !== "owner") {
    await updateMembership(tenant.id, user.id, { role: "owner" });
  }
  return user;
}

function actingFromMembership(user: User, m: TenantMember): ActingUser {
  return {
    ...user,
    tenantId: m.tenantId,
    tenantRole: m.role,
    role: TENANT_ROLE_TIER[m.role],
    roleTitle: m.roleTitle,
    capabilities: m.capabilities,
  };
}

/** Instant login as a seeded demo user, or provision + sign in on staging. */
export async function quickLoginAction(formData: FormData): Promise<void> {
  try {
    assertQuickLoginAllowed();
    const email = String(formData.get("email") || "").trim();
    if (!email) throw new Error("Email is required.");

    let user: User;
    if (localDemoEnabled()) {
      const found = await getUserByEmail(email);
      if (!found) throw new Error(`No seeded account for ${email}`);
      if (!found.active) throw new Error("Account deactivated.");
      user = found;
    } else {
      // Staging + Supabase: look up or provision a minimal agency owner.
      user = await ensureStagingUser(email);
    }

    const memberships = [...(await membershipsForUser(user.id))].sort((a, b) =>
      a.tenantId.localeCompare(b.tenantId),
    );
    let membership = memberships[0];
    // Staging ops seat: prefer platform agency over orphan holding tenants.
    if (appEnv() === "staging" && isSupabaseConfigured()) {
      const agency = await resolveStagingTenant();
      membership =
        memberships.find((m) => m.tenantId === agency.id) ?? memberships[0];
    }
    if (!membership) {
      throw new Error(
        `No tenant membership for ${email}. Provisioning failed — check tenants / tenant_members.`,
      );
    }

    await startSession(user.id);
    // Set active tenant after auth cookies so a single response carries both.
    await setActiveTenant(user.id, membership.tenantId);

    await logAction(user, "user.login", {
      tenantId: membership.tenantId,
      detail:
        appEnv() === "staging" && isSupabaseConfigured()
          ? "Staging /dev quick-login (no magic link)"
          : "Dev tools quick-login",
    });

    // Do not call getCurrentUser() here — verifyOtp cookies may not be readable
    // until the next request. Redirect from DB membership instead.
    redirect(await postLoginRedirectPath(actingFromMembership(user, membership)));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Quick login failed";
    failQuickLogin(msg);
  }
}
