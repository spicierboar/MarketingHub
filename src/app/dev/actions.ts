"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addMembership,
  createUser,
  getMembership,
  getTenant,
  getUserByEmail,
  grantAccess,
  listCompanies,
  membershipsForUser,
  updateMembership,
  updateUserName,
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
import { runInServiceContext } from "@/lib/db/service-context";
import { logAction } from "@/lib/audit";
import { resolvePlatformAgencyTenant } from "@/lib/platform-agency";
import { applyStagingAgencyFixture } from "@/lib/fixtures/apply-staging-agency";
import { applyStagingRetailFixture } from "@/lib/fixtures/apply-staging-retail";
import { applyStagingSalesFixture } from "@/lib/fixtures/apply-staging-sales";
import {
  STAGING_FIXTURE_KEY,
  STAGING_FIXTURE_TENANT_ID,
  stagingFixtureDisplayName,
} from "@/lib/fixtures/staging-agency";
import {
  STAGING_GENERAL_RETAIL_FIXTURE_KEY,
  STAGING_GENERAL_RETAIL_TENANT_ID,
  STAGING_IGA_FIXTURE_KEY,
  STAGING_IGA_TENANT_ID,
  createStagingGeneralRetailFixture,
  createStagingIgaRetailFixture,
  findStagingRetailPackForSlug,
  stagingRetailFixtureDisplayName,
  stagingRetailStoreFixtureKey,
} from "@/lib/fixtures/staging-retail";
import {
  STAGING_SALES_APPROVER_SLUGS,
  STAGING_SALES_CLIENTS,
  STAGING_SALES_EMAIL,
  STAGING_SALES_FIXTURE_KEY,
  createStagingSalesFixture,
  stagingSalesClientFixtureKey,
  stagingSalesFixtureDisplayName,
} from "@/lib/fixtures/staging-sales";
import type { ActingUser, Tenant, TenantMember, TenantRole, User } from "@/lib/types";
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
  const fixture =
    stagingFixtureDisplayName(email) ??
    stagingRetailFixtureDisplayName(email) ??
    stagingSalesFixtureDisplayName(email);
  if (fixture) return fixture;
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
      kind: "sales_rep";
      appRole: User["role"];
      tenantRole: TenantRole;
      roleTitle: "sales_rep";
    }
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
  if (normalized === STAGING_SALES_EMAIL) {
    return {
      kind: "sales_rep",
      appRole: "user",
      tenantRole: "member",
      roleTitle: "sales_rep",
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
  const retail = findStagingRetailPackForSlug(companySlug);
  const isSalesClient = (STAGING_SALES_APPROVER_SLUGS as readonly string[]).includes(
    companySlug,
  );
  const fixtureKey = retail
    ? stagingRetailStoreFixtureKey(retail.pack, companySlug)
    : isSalesClient
      ? stagingSalesClientFixtureKey(companySlug)
      : `${STAGING_FIXTURE_KEY}:restaurant:${companySlug}`;

  // Quick-login has no cookie session yet — listCompanies uses the RLS client,
  // and anon cannot EXECUTE has_company_access. Resolve under service context.
  const find = async (tid: string) => {
    const companies = await runInServiceContext(tid, () => listCompanies(tid));
    const byFixture = companies.find((c) => {
      const meta = (c.profile as { stagingFixture?: { fixtureKey?: string } })
        .stagingFixture;
      return meta?.fixtureKey === fixtureKey;
    });
    if (byFixture) return byFixture.id;
    const needle = companySlug.replace(/-/g, " ").toLowerCase();
    const byName = companies.find((c) => c.name.toLowerCase().includes(needle));
    return byName?.id ?? null;
  };

  let companyId = await find(tenantId);
  if (!companyId && appEnv() === "staging" && isSupabaseConfigured()) {
    if (retail) {
      await ensureStagingRetailPackApplied(retail.pack);
      companyId = await find(retail.tenantId);
    } else if (isSalesClient) {
      await ensureStagingSalesReady();
      companyId = await find(STAGING_FIXTURE_TENANT_ID);
    } else {
      await ensureStagingAgencyFixtureApplied();
      companyId = await find(STAGING_FIXTURE_TENANT_ID);
    }
  }
  if (companyId) return companyId;
  throw new Error(
    retail
      ? `No retail company for approver slug "${companySlug}". On /dev, click “Seed staging IGA” or “Seed staging general retail”, then try again.`
      : isSalesClient
        ? `No sales demo client for approver slug "${companySlug}". On /dev, click “Seed staging sales book”, then try again.`
        : `No client company for approver slug "${companySlug}". On /dev, click “Seed staging restaurants”, then try again.`,
  );
}

async function resolveStagingTenant() {
  // Prefer the deterministic restaurant fixture tenant so restaurant companies resolve.
  const fixture = await getTenant(STAGING_FIXTURE_TENANT_ID);
  if (fixture?.status === "active") {
    return resolvePlatformAgencyTenant(STAGING_FIXTURE_TENANT_ID);
  }
  return resolvePlatformAgencyTenant();
}

/** Resolve the tenant seat for a quick-login email (retail packs use their own tenants). */
async function resolveTenantForQuickSeat(seat: StagingQuickSeat): Promise<Tenant> {
  if (seat.kind === "client_approver") {
    const retail = findStagingRetailPackForSlug(seat.companySlug);
    if (retail) {
      await ensureStagingRetailPackApplied(retail.pack);
      const tenant = await getTenant(retail.tenantId);
      if (!tenant || tenant.status !== "active") {
        throw new Error(
          `Retail fixture tenant missing for ${seat.companySlug}. Seed IGA / general retail on /dev.`,
        );
      }
      return tenant;
    }
  }
  return resolveStagingTenant();
}

async function ensureStagingAgencyFixtureApplied() {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase service role is not configured.");
  return applyStagingAgencyFixture(sb);
}

async function ensureStagingRetailPackApplied(
  pack: typeof STAGING_IGA_FIXTURE_KEY | typeof STAGING_GENERAL_RETAIL_FIXTURE_KEY,
) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase service role is not configured.");
  const fixture =
    pack === STAGING_IGA_FIXTURE_KEY
      ? createStagingIgaRetailFixture()
      : createStagingGeneralRetailFixture();
  return applyStagingRetailFixture(sb, fixture);
}

/** Create/refresh restaurants when the staging DB has an empty agency seat. */
async function ensureStagingRestaurantsReady(): Promise<void> {
  const fixtureTenant = await getTenant(STAGING_FIXTURE_TENANT_ID);
  if (!fixtureTenant) {
    await ensureStagingAgencyFixtureApplied();
    return;
  }
  const companies = await runInServiceContext(STAGING_FIXTURE_TENANT_ID, () =>
    listCompanies(STAGING_FIXTURE_TENANT_ID),
  );
  if (companies.length < 10) {
    await ensureStagingAgencyFixtureApplied();
  }
}

async function ensureStagingRetailReady(
  pack: typeof STAGING_IGA_FIXTURE_KEY | typeof STAGING_GENERAL_RETAIL_FIXTURE_KEY,
): Promise<void> {
  const tenantId =
    pack === STAGING_IGA_FIXTURE_KEY
      ? STAGING_IGA_TENANT_ID
      : STAGING_GENERAL_RETAIL_TENANT_ID;
  const expected =
    pack === STAGING_IGA_FIXTURE_KEY
      ? createStagingIgaRetailFixture().companies.length
      : createStagingGeneralRetailFixture().companies.length;
  const fixtureTenant = await getTenant(tenantId);
  if (!fixtureTenant) {
    await ensureStagingRetailPackApplied(pack);
    return;
  }
  const companies = await runInServiceContext(tenantId, () =>
    listCompanies(tenantId),
  );
  if (companies.length < expected) {
    await ensureStagingRetailPackApplied(pack);
  }
}

async function ensureStagingSalesFixtureApplied() {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("Supabase service role is not configured.");
  await ensureStagingRestaurantsReady();
  return applyStagingSalesFixture(sb);
}

/** Ensure Arjun's sales demo book exists on the restaurant fixture tenant. */
async function ensureStagingSalesReady(): Promise<void> {
  await ensureStagingRestaurantsReady();
  const expected = createStagingSalesFixture().companies.length;
  const expectedKey = stagingSalesClientFixtureKey(STAGING_SALES_CLIENTS[0]!.slug);
  const companies = await runInServiceContext(STAGING_FIXTURE_TENANT_ID, () =>
    listCompanies(STAGING_FIXTURE_TENANT_ID),
  );
  const salesCount = companies.filter((c) => {
    const meta = (c.profile as { stagingFixture?: { fixtureKey?: string } })
      .stagingFixture;
    return meta?.fixtureKey?.startsWith(`${STAGING_SALES_FIXTURE_KEY}:`);
  }).length;
  const hasCurrentBook = companies.some((c) => {
    const meta = (c.profile as { stagingFixture?: { fixtureKey?: string } })
      .stagingFixture;
    return meta?.fixtureKey === expectedKey;
  });
  if (salesCount < expected || !hasCurrentBook) {
    await ensureStagingSalesFixtureApplied();
  }
}

async function assertStagingSeedRequest(formData: FormData): Promise<void> {
  if (!devToolsOpen() || appEnv() !== "staging") {
    throw new Error("Staging fixture seed is only available on staging.");
  }
  if (localDemoEnabled()) {
    throw new Error("Local demo uses in-memory seed — use Seed / reset demo data.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured on this deployment.");
  }
  const hdrs = await headers();
  const providedSecret = String(formData.get("selftestSecret") || "");
  if (
    !quickLoginRequestAllowed({
      headers: hdrs,
      providedSecret,
    })
  ) {
    throw new Error(
      selfTestSecretConfigured()
        ? "Seed requires same-origin POST and a valid CC_SELFTEST_SECRET."
        : "Seed requires a same-origin browser request.",
    );
  }
}

/** Staging-only: upsert ten restaurants + approvers into Supabase (idempotent). */
export async function seedStagingAgencyFixtureAction(
  formData: FormData,
): Promise<void> {
  try {
    await assertStagingSeedRequest(formData);
    const summary = await ensureStagingAgencyFixtureApplied();
    revalidatePath("/dev");
    redirect(
      `/dev?seeded=staging&companies=${summary.companies}&approvers=${summary.approvers}`,
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Staging seed failed";
    failQuickLogin(msg);
  }
}

/** Staging-only: upsert IGA retail stores + approvers (idempotent). */
export async function seedStagingIgaRetailFixtureAction(
  formData: FormData,
): Promise<void> {
  try {
    await assertStagingSeedRequest(formData);
    const summary = await ensureStagingRetailPackApplied(STAGING_IGA_FIXTURE_KEY);
    revalidatePath("/dev");
    redirect(
      `/dev?seeded=iga&companies=${summary.companies}&approvers=${summary.approvers}`,
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "IGA retail seed failed";
    failQuickLogin(msg);
  }
}

/** Staging-only: upsert general retail stores + approvers (idempotent). */
export async function seedStagingGeneralRetailFixtureAction(
  formData: FormData,
): Promise<void> {
  try {
    await assertStagingSeedRequest(formData);
    const summary = await ensureStagingRetailPackApplied(
      STAGING_GENERAL_RETAIL_FIXTURE_KEY,
    );
    revalidatePath("/dev");
    redirect(
      `/dev?seeded=general-retail&companies=${summary.companies}&approvers=${summary.approvers}`,
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "General retail seed failed";
    failQuickLogin(msg);
  }
}

/** Staging-only: upsert field-sales seat + demo book (idempotent). */
export async function seedStagingSalesFixtureAction(
  formData: FormData,
): Promise<void> {
  try {
    await assertStagingSeedRequest(formData);
    const summary = await ensureStagingSalesFixtureApplied();
    revalidatePath("/dev");
    redirect(
      `/dev?seeded=sales&companies=${summary.companies}&approvers=${summary.approvers}`,
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Sales book seed failed";
    failQuickLogin(msg);
  }
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

  // Approver / sales login needs the matching fixture pack under its tenant.
  if (appEnv() === "staging" && isSupabaseConfigured()) {
    if (seat.kind === "client_approver") {
      const retail = findStagingRetailPackForSlug(seat.companySlug);
      if (retail) {
        await ensureStagingRetailReady(retail.pack);
      } else if (
        (STAGING_SALES_APPROVER_SLUGS as readonly string[]).includes(seat.companySlug)
      ) {
        await ensureStagingSalesReady();
      } else {
        await ensureStagingRestaurantsReady();
      }
    } else if (seat.kind === "sales_rep") {
      await ensureStagingSalesReady();
    } else {
      await ensureStagingRestaurantsReady();
    }
  }

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

  const desiredName =
    stagingFixtureDisplayName(email) ??
    stagingRetailFixtureDisplayName(email) ??
    stagingSalesFixtureDisplayName(email) ??
    nameFromEmail(email);
  if (user.name !== desiredName) {
    user = (await updateUserName(user.id, desiredName)) ?? { ...user, name: desiredName };
  }

  const tenant = await resolveTenantForQuickSeat(seat);
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

  if (seat.kind === "sales_rep") {
    const salesCompanies = await runInServiceContext(tenant.id, () =>
      listCompanies(tenant.id),
    );
    for (const company of salesCompanies) {
      const meta = (company.profile as { stagingFixture?: { fixtureKey?: string } })
        .stagingFixture;
      if (meta?.fixtureKey?.startsWith(`${STAGING_SALES_FIXTURE_KEY}:client:`)) {
        await grantAccess(user.id, company.id);
      }
    }
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
      const seat = stagingQuickSeat(email);
      const preferredTenant = await resolveTenantForQuickSeat(seat);
      membership =
        memberships.find((m) => m.tenantId === preferredTenant.id) ??
        memberships[0];
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
