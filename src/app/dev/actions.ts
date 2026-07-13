"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addMembership,
  createTenant,
  createUser,
  getUserByEmail,
  listTenants,
  membershipsForUser,
} from "@/lib/db";
import { startSession, endSession, getCurrentUser, setActiveTenant } from "@/lib/auth/session";
import { postLoginRedirectPath } from "@/lib/auth/rbac";
import { resetStore } from "@/lib/db/store";
import { localDemoEnabled, devToolsOpen, appEnv } from "@/lib/env";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { logAction } from "@/lib/audit";
import type { Tenant, User } from "@/lib/types";

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

async function resolveStagingTenant(): Promise<Tenant> {
  const tenants = await listTenants();
  const named = tenants.find(
    (t) => t.name === "Staging Agency" && t.status === "active",
  );
  if (named) return named;
  const active = tenants.find((t) => t.status === "active") ?? tenants[0];
  if (active) return active;
  return createTenant({
    name: "Staging Agency",
    kind: "agency",
    plan: "agency",
    status: "active",
    timezone: "Australia/Sydney",
  });
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
    } catch {
      user = await linkExistingAuthUser(email);
    }
  }
  if (!user.active) throw new Error("Account deactivated.");

  const memberships = await membershipsForUser(user.id);
  if (memberships.length === 0) {
    const tenant = await resolveStagingTenant();
    await addMembership({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });
    await setActiveTenant(user.id, tenant.id);
  }
  return user;
}

/** Instant login as a seeded demo user, or provision + sign in on staging. */
export async function quickLoginAction(formData: FormData): Promise<void> {
  assertQuickLoginAllowed();
  const email = String(formData.get("email") || "").trim();
  if (!email) throw new Error("Email is required.");

  let user: User | undefined;
  if (localDemoEnabled()) {
    user = await getUserByEmail(email);
    if (!user) throw new Error(`No seeded account for ${email}`);
    if (!user.active) throw new Error("Account deactivated.");
  } else {
    // Staging + Supabase: look up or provision a minimal agency owner.
    user = await ensureStagingUser(email);
  }

  await startSession(user.id);
  await logAction(user, "user.login", {
    detail:
      appEnv() === "staging" && isSupabaseConfigured()
        ? "Staging /dev quick-login (no magic link)"
        : "Dev tools quick-login",
  });
  const acting = await getCurrentUser();
  redirect(acting ? await postLoginRedirectPath(acting) : "/dashboard");
}
