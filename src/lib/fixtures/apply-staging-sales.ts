/**
 * Idempotent staging field-sales demo apply (service-role only).
 * Attaches Casey Rivera + book of clients to the restaurant fixture tenant.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { stagingFixtureAuthMetadata } from "@/lib/fixtures/staging-agency";
import {
  createStagingSalesFixture,
  STAGING_SALES_FIXTURE_KEY,
  type StagingSalesFixture,
} from "@/lib/fixtures/staging-sales";
import type { StagingFixtureUser } from "@/lib/fixtures/staging-agency";

export type StagingSalesApplySummary = {
  tenantId: string;
  fixtureKey: typeof STAGING_SALES_FIXTURE_KEY;
  companies: number;
  users: number;
  approvers: number;
};

async function expectOk<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

function asFixtureUser(
  user: StagingSalesFixture["salesUser"] | StagingSalesFixture["approvers"][number],
  fixtureRole: "Staff" | "Client Approver",
): StagingFixtureUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    fixtureKey: user.fixtureKey,
    fixtureRole,
  };
}

async function ensureSalesFixtureAuthUsers(
  sb: SupabaseClient,
  fixture: StagingSalesFixture,
): Promise<Map<string, string>> {
  const perPage = 1000;
  const existingUsers: {
    id: string;
    email?: string;
    app_metadata?: Record<string, unknown>;
  }[] = [];
  for (let page = 1; ; page += 1) {
    const listed = await sb.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      throw new Error(`list sales fixture auth users: ${listed.error.message}`);
    }
    existingUsers.push(...listed.data.users);
    if (listed.data.users.length < perPage) break;
  }
  const byEmail = new Map(
    existingUsers.map((user) => [String(user.email ?? "").toLowerCase(), user]),
  );
  const actualIds = new Map<string, string>();

  const users = [
    asFixtureUser(fixture.salesUser, "Client Approver"),
    ...fixture.approvers.map((a) => asFixtureUser(a, "Client Approver")),
  ];

  for (const user of users) {
    if (!user.email.endsWith("@staging-fixture.invalid")) {
      throw new Error(`refusing non-reserved fixture email: ${user.email}`);
    }
    // Field sales + client approvers are non-operators (no app_metadata.role).
    const metadata = stagingFixtureAuthMetadata(user, fixture.tenantId);
    let authUser = byEmail.get(user.email.toLowerCase());
    if (!authUser) {
      const created = await sb.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
        app_metadata: metadata.appMetadata,
        user_metadata: metadata.userMetadata,
      });
      if (created.error || !created.data.user) {
        throw new Error(
          `create sales fixture auth user ${user.fixtureKey}: ${created.error?.message ?? "no user"}`,
        );
      }
      authUser = created.data.user;
      byEmail.set(user.email.toLowerCase(), authUser);
    }
    actualIds.set(user.id, authUser.id);
  }
  return actualIds;
}

/** Apply (or re-apply) the field-sales demo book onto the restaurant fixture tenant. */
export async function applyStagingSalesFixture(
  sb: SupabaseClient,
  fixture: StagingSalesFixture = createStagingSalesFixture(),
): Promise<StagingSalesApplySummary> {
  const tenant = await expectOk(
    "load sales fixture tenant",
    sb
      .from("tenants")
      .select("id,status")
      .eq("id", fixture.tenantId)
      .maybeSingle(),
  );
  if (!tenant || (tenant as { status?: string }).status !== "active") {
    throw new Error(
      `Restaurant fixture tenant ${fixture.tenantId} missing or inactive — seed staging restaurants first.`,
    );
  }

  const actualIds = await ensureSalesFixtureAuthUsers(sb, fixture);
  const salesAuthId = actualIds.get(fixture.salesUser.id);
  if (!salesAuthId) throw new Error("sales fixture auth id is missing");

  const allUsers = [fixture.salesUser, ...fixture.approvers];
  const approverAuthIds = fixture.approvers
    .map((a) => actualIds.get(a.id))
    .filter((id): id is string => Boolean(id));
  if (approverAuthIds.length !== fixture.approvers.length) {
    throw new Error(
      `expected ${fixture.approvers.length} sales approver auth ids, got ${approverAuthIds.length}`,
    );
  }

  const companyIds = fixture.companies.map((c) => c.id);
  const existingApproverAccess = await expectOk(
    "preflight sales approver access",
    sb.from("company_access").select("user_id,company_id").in("user_id", approverAuthIds),
  );
  const companyIdSet = new Set(companyIds);
  const unexpectedAccess = (existingApproverAccess ?? []).filter(
    (row: { company_id: string }) => !companyIdSet.has(row.company_id),
  );
  if (unexpectedAccess.length > 0) {
    throw new Error(
      `sales approver identities have ${unexpectedAccess.length} non-fixture access rows; refusing cross-tenant mutation`,
    );
  }

  await expectOk(
    "upsert sales fixture app users",
    sb.from("app_users").upsert(
      allUsers.map((user) => ({
        id: actualIds.get(user.id),
        email: user.email,
        name: user.name,
        active: true,
        platform_admin: false,
        created_at: user.createdAt,
      })),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert sales fixture memberships",
    sb.from("tenant_members").upsert(
      fixture.memberships.map((membership) => ({
        tenant_id: membership.tenantId,
        user_id: actualIds.get(membership.userId),
        role: membership.role,
        role_title: membership.roleTitle ?? null,
        portal_only: membership.portalOnly ?? false,
        capabilities: membership.capabilities ?? [],
        created_at: membership.createdAt,
      })),
      { onConflict: "tenant_id,user_id" },
    ),
  );

  await expectOk(
    "upsert sales fixture companies",
    sb.from("companies").upsert(
      fixture.companies.map((company) => ({
        id: company.id,
        tenant_id: company.tenantId,
        name: company.name,
        status: company.status,
        profile: company.profile,
        documents: company.documents,
        created_by: salesAuthId,
        created_at: company.createdAt,
        updated_at: company.updatedAt,
      })),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "clear sales fixture access",
    sb
      .from("company_access")
      .delete()
      .in(
        "user_id",
        [salesAuthId, ...approverAuthIds],
      )
      .in("company_id", companyIds),
  );
  await expectOk(
    "upsert sales fixture access",
    sb.from("company_access").upsert(
      fixture.access.map((access) => ({
        user_id: actualIds.get(access.userId),
        company_id: access.companyId,
      })),
      { onConflict: "user_id,company_id" },
    ),
  );

  const companyRows = (await expectOk(
    "verify sales fixture companies",
    sb.from("companies").select("id").in("id", companyIds),
  )) as unknown[];
  if (companyRows.length !== companyIds.length) {
    throw new Error(
      `post-seed sales company count is ${companyRows.length}, expected ${companyIds.length}`,
    );
  }

  return {
    tenantId: fixture.tenantId,
    fixtureKey: fixture.fixtureKey,
    companies: companyRows.length,
    users: allUsers.length,
    approvers: fixture.approvers.length,
  };
}
