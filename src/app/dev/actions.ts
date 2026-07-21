"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addMembership,
  createUser,
  getMembership,
  getUserByEmail,
  grantAccess,
  listCompanies,
  membershipsForUser,
  updateMembership,
} from "@/lib/db";
import { startSession, endSession, setActiveTenant } from "@/lib/auth/session";
import { postLoginRedirectPath } from "@/lib/auth/rbac";
import { resetStore } from "@/lib/db/store";
import {
  localDemoMutationAllowed,
  quickLoginRequestAllowed,
  selfTestSecretConfigured,
  stagingQuickLoginEmailAllowed,
} from "@/lib/dev-access";
import { localDemoEnabled, devToolsOpen, appEnv } from "@/lib/env";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { logAction } from "@/lib/audit";
import { resolvePlatformAgencyTenant } from "@/lib/platform-agency";
import { STAGING_FIXTURE_KEY } from "@/lib/fixtures/staging-agency";
import type { ActingUser, TenantMember, TenantRole, User } from "@/lib/types";
import { TENANT_ROLE_TIER } from "@/lib/types";


function failQuickLogin(message: string): never {
  redirect(`/dev?error=${encodeURIComponent(message.slice(0, 300))}`);
}

async function assertLocalDemoMutationAllowed(): Promise<void> {
  if (!localDemoMutationAllowed(await headers())) {
    throw new Error(
      "Local-demo mutations require CC_LOCAL_DEMO on a non-deployed localhost development server.",
    );
  }
}

/** Quick login is for local demo OR staging (never production). */
async function assertQuickLoginAllowed(
  formData: FormData,
): Promise<void> {
  if (!devToolsOpen()) {
    throw new Error("Dev tools are locked in production.");
  }
  if (!localDemoEnabled() && appEnv() !== "staging") {
    throw new Error(
      "Quick login needs local demo (CC_LOCAL_DEMO) or a staging deployment.",
    );
  }
  const hdrs = await headers();
  const providedSecret = String(formData.get("selftestSecret") || "");
  if (
    !quickLoginRequestAllowed({
      headers: hdrs,
      providedSecret,
    })
  ) {
    if (selfTestSecretConfigured()) {
      throw new Error(
        "Quick login requires a same-origin request and a valid CC_SELFTEST_SECRET.",
      );
    }
    throw new Error("Quick login requires a same-origin browser request.");
  }
  if (appEnv() === "staging" && !localDemoEnabled()) {
    const email = String(formData.get("email") || "").trim();
    if (!stagingQuickLoginEmailAllowed(email)) {
      throw new Error(
        "Staging quick-login is limited to fixture emails listed on /dev.",
      );
    }
  }
}

/** Re-seed the complete in-memory local-demo fixture. */
export async function seedDemoDataAction(_formData?: FormData): Promise<void> {
  await assertLocalDemoMutationAllowed();
  resetStore();
  revalidatePath("/", "layout");
  redirect("/dev?seeded=1");
}

/** Clear session + re-seed (fresh demo). */
export async function clearAndReseedAction(_formData?: FormData): Promise<void> {
  await assertLocalDemoMutationAllowed();
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

type StagingQuickSeat =
  | { kind: "agency_owner"; appRole: User["role"]; tenantRole: TenantRole; roleTitle: "group_admin" }
  | { kind: "agency_staff"; appRole: User["role"]; tenantRole: TenantRole; roleTitle: "content_operator" }
  | {
      kind: "client_approver";
      appRole: User["role"];
      tenantRole: TenantRole;
      roleTitle: "approver";
      companySlug: string;
    };

/** Map allowlisted fixture emails to the seat they must hold on staging. */
function stagingQuickSeat(email: string): StagingQuickSeat {
  const normalized = email.trim().toLowerCase();
  if (normalized === "admin@staging-fixture.invalid") {
    return {
      kind: "agency_owner",
      appRole: "admin",
      tenantRole: "owner",
      roleTitle: "group_admin",
    };
  }
  if (normalized === "staff-1@staging-fixture.invalid") {
    return {
      kind: "agency_staff",
      appRole: "admin",
      tenantRole: "admin",
      roleTitle: "content_operator",
    };
  }
  const approver = normalized.match(
    /^approver-([a-z0-9-]+)@staging-fixture\.invalid$/,
  );
  if (approver?.[1]) {
    return {
      kind: "client_approver",
      appRole: "user",
      tenantRole: "member",
      roleTitle: "approver",
      companySlug: approver[1],
    };
  }
  throw new Error(`No staging seat mapping for ${email}`);
}

async function resolveApproverCompanyId(
  tenantId: string,
  companySlug: string,
): Promise<string> {
  const companies = await listCompanies(tenantId);
  const fixtureKey = `${STAGING_FIXTURE_KEY}:restaurant:${companySlug}`;
  const byFixture = companies.find((c) => {
    const meta = (c.profile as { stagingFixture?: { fixtureKey?: string } })
      .stagingFixture;
    return meta?.fixtureKey === fixtureKey;
  });
  if (byFixture) return byFixture.id;
  const needle = companySlug.replace(/-/g, " ").toLowerCase();
  const byName = companies.find((c) => c.name.toLowerCase().includes(needle));
  if (byName) return byName.id;
  throw new Error(
    `No client company for approver slug "${companySlug}". Seed the staging restaurant fixture first.`,
  );
}

async function resolveStagingTenant() {
  return resolvePlatformAgencyTenant();
}

/**
 * When auth.users already exists (e.g. prior magic-link attempts) but app_users
 * does not, createUser fails — link the identity via admin generateLink (no email).
 */
async function linkExistingAuthUser(email: string, appRole: User["role"]): Promise<User> {
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
      role: appRole,
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
    role: (row.role as User["role"]) ?? appRole,
    active: (row.active as boolean) ?? true,
    platformAdmin: (row.platform_admin as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}

/** Ensure the allowlisted fixture email has the correct staging seat (not always owner). */
async function ensureStagingUser(email: string): Promise<User> {
  const seat = stagingQuickSeat(email);
  let user = await getUserByEmail(email);
  if (!user) {
    try {
      user = await createUser({
        email,
        name: nameFromEmail(email),
        role: seat.appRole,
      });
    } catch (createErr) {
      try {
        user = await linkExistingAuthUser(email, seat.appRole);
      } catch (linkErr) {
        const a = createErr instanceof Error ? createErr.message : String(createErr);
        const b = linkErr instanceof Error ? linkErr.message : String(linkErr);
        throw new Error(`Could not provision ${email}: ${a} | ${b}`);
      }
    }
  }
  if (!user.active) throw new Error("Account deactivated.");

  const tenant = await resolveStagingTenant();
  const existing = await getMembership(tenant.id, user.id);
  const membershipPatch = {
    role: seat.tenantRole,
    roleTitle: seat.roleTitle,
    portalOnly: seat.kind === "client_approver" ? true : false,
  } as const;

  if (!existing) {
    await addMembership({
      tenantId: tenant.id,
      userId: user.id,
      ...membershipPatch,
    });
  } else {
    await updateMembership(tenant.id, user.id, membershipPatch);
  }

  if (seat.kind === "client_approver") {
    const companyId = await resolveApproverCompanyId(tenant.id, seat.companySlug);
    await grantAccess(user.id, companyId);
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
    await assertQuickLoginAllowed(formData);
    const email = String(formData.get("email") || "").trim();
    if (!email) throw new Error("Email is required.");

    let user: User;
    if (localDemoEnabled()) {
      const found = await getUserByEmail(email);
      if (!found) throw new Error(`No seeded account for ${email}`);
      if (!found.active) throw new Error("Account deactivated.");
      user = found;
    } else {
      user = await ensureStagingUser(email);
    }

    const memberships = [...(await membershipsForUser(user.id))].sort((a, b) =>
      a.tenantId.localeCompare(b.tenantId),
    );
    let membership = memberships[0];
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
    await setActiveTenant(user.id, membership.tenantId);

    await logAction(user, "user.login", {
      tenantId: membership.tenantId,
      detail:
        appEnv() === "staging" && isSupabaseConfigured()
          ? "Staging /dev quick-login (no magic link)"
          : "Dev tools quick-login",
    });

    redirect(await postLoginRedirectPath(actingFromMembership(user, membership)));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Quick login failed";
    failQuickLogin(msg);
  }
}
