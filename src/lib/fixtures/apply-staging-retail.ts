/**
 * Idempotent staging IGA / general-retail fixture apply (service-role only).
 * Parallel to apply-staging-agency; separate tenants so restaurant seed stays intact.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { stagingFixtureAuthMetadata } from "@/lib/fixtures/staging-agency";
import type { StagingRetailFixture } from "@/lib/fixtures/staging-retail";

export type StagingRetailApplySummary = {
  tenantId: string;
  fixtureKey: string;
  vertical: StagingRetailFixture["vertical"];
  companies: number;
  users: number;
  approvers: number;
  assets: number;
};

async function expectOk<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function ensureRetailFixtureAuthUsers(
  sb: SupabaseClient,
  fixture: StagingRetailFixture,
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
      throw new Error(`list retail fixture auth users: ${listed.error.message}`);
    }
    existingUsers.push(...listed.data.users);
    if (listed.data.users.length < perPage) break;
  }
  const byEmail = new Map(
    existingUsers.map((user) => [String(user.email ?? "").toLowerCase(), user]),
  );
  const actualIds = new Map<string, string>();

  for (const user of fixture.users) {
    if (!user.email.endsWith("@staging-fixture.invalid")) {
      throw new Error(`refusing non-reserved fixture email: ${user.email}`);
    }
    const metadata = stagingFixtureAuthMetadata(user, fixture.tenant.id);
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
          `create retail fixture auth user ${user.fixtureKey}: ${created.error?.message ?? "no user"}`,
        );
      }
      authUser = created.data.user;
      byEmail.set(user.email.toLowerCase(), authUser);
    }
    // Shared admin/staff emails already exist on the restaurant tenant —
    // map to that auth row; do not overwrite app_metadata.tenant_id.
    actualIds.set(user.id, authUser.id);
  }
  return actualIds;
}

function assetRow(
  asset: StagingRetailFixture["assets"][number],
  actualIds: Map<string, string>,
) {
  return {
    id: asset.id,
    company_id: asset.companyId,
    location_id: asset.locationId ?? null,
    folder: asset.folder ?? null,
    name: asset.name,
    description: asset.description ?? null,
    asset_type: asset.assetType,
    source: asset.source,
    external_ref: asset.externalRef ?? null,
    file_name: asset.fileName ?? null,
    mime_type: asset.mimeType ?? null,
    size_bytes: asset.sizeBytes ?? null,
    tags: asset.tags,
    usage_rights: asset.usageRights,
    status: asset.status,
    created_by: actualIds.get(asset.createdById),
    approved_by: asset.approvedById ? actualIds.get(asset.approvedById) : null,
    approved_at: asset.approvedAt ?? null,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
    ai_model: asset.aiModel ?? null,
    ai_prompt: asset.aiPrompt ?? null,
    ai_run_id: null,
    est_cost_usd: asset.estCostUsd ?? null,
    sources_used: asset.sourcesUsed ?? [],
  };
}

function assertRetailFixture(fixture: StagingRetailFixture): void {
  const expectedCompanies = fixture.companies.length;
  if (expectedCompanies < 1) {
    throw new Error(`${fixture.fixtureKey}: expected at least one store`);
  }
  const approvers = fixture.users.filter((u) => u.fixtureRole === "Client Approver");
  if (approvers.length !== expectedCompanies) {
    throw new Error(
      `${fixture.fixtureKey}: expected ${expectedCompanies} approvers, got ${approvers.length}`,
    );
  }
  if (fixture.assets.length !== expectedCompanies * 2) {
    throw new Error(
      `${fixture.fixtureKey}: expected ${expectedCompanies * 2} assets, got ${fixture.assets.length}`,
    );
  }
  for (const user of fixture.users) {
    if (!user.email.endsWith("@staging-fixture.invalid")) {
      throw new Error(`refusing non-reserved fixture email: ${user.email}`);
    }
  }
}

/** Apply (or re-apply) an IGA or general-retail staging fixture via service role. */
export async function applyStagingRetailFixture(
  sb: SupabaseClient,
  fixture: StagingRetailFixture,
): Promise<StagingRetailApplySummary> {
  assertRetailFixture(fixture);

  const actualIds = await ensureRetailFixtureAuthUsers(sb, fixture);
  const admin = fixture.users.find((user) => user.fixtureRole === "Admin");
  if (!admin) throw new Error("retail fixture admin is missing");
  const adminId = actualIds.get(admin.id);
  if (!adminId) throw new Error("retail fixture admin auth id is missing");

  const fixtureApproverIds = fixture.users
    .filter((user) => user.fixtureRole === "Client Approver")
    .map((user) => actualIds.get(user.id))
    .filter((id): id is string => Boolean(id));
  const expectedCompanies = fixture.companies.length;
  if (fixtureApproverIds.length !== expectedCompanies) {
    throw new Error(
      `expected ${expectedCompanies} retail approver ids, got ${fixtureApproverIds.length}`,
    );
  }
  const fixtureCompanyIds = fixture.companies.map((company) => company.id);
  const existingApproverAccess = await expectOk(
    "preflight retail approver access",
    sb.from("company_access").select("user_id,company_id").in("user_id", fixtureApproverIds),
  );
  const fixtureCompanyIdSet = new Set(fixtureCompanyIds);
  const unexpectedAccess = (existingApproverAccess ?? []).filter(
    (row: { company_id: string }) => !fixtureCompanyIdSet.has(row.company_id),
  );
  if (unexpectedAccess.length > 0) {
    throw new Error(
      `retail approver identities have ${unexpectedAccess.length} non-fixture access rows; refusing cross-tenant mutation`,
    );
  }

  await expectOk(
    "upsert retail fixture app users",
    sb.from("app_users").upsert(
      fixture.users.map((user) => ({
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
    "upsert retail fixture tenant",
    sb.from("tenants").upsert(
      {
        id: fixture.tenant.id,
        name: fixture.tenant.name,
        kind: fixture.tenant.kind,
        plan: fixture.tenant.plan,
        status: fixture.tenant.status,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        onboarding: fixture.tenant.onboarding,
        onboarding_completed_at: fixture.tenant.onboardingCompletedAt,
        timezone: fixture.tenant.timezone,
        created_at: fixture.tenant.createdAt,
        updated_at: fixture.tenant.updatedAt,
      },
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert retail fixture memberships",
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
    "upsert retail fixture companies",
    sb.from("companies").upsert(
      fixture.companies.map((company) => ({
        id: company.id,
        tenant_id: company.tenantId,
        name: company.name,
        status: company.status,
        profile: company.profile,
        documents: company.documents.map((document) => ({
          ...document,
          uploadedBy: actualIds.get(document.uploadedBy),
        })),
        created_by: adminId,
        created_at: company.createdAt,
        updated_at: company.updatedAt,
      })),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "clear retail fixture approver access",
    sb
      .from("company_access")
      .delete()
      .in("user_id", fixtureApproverIds)
      .in("company_id", fixtureCompanyIds),
  );
  await expectOk(
    "upsert retail fixture approver access",
    sb.from("company_access").upsert(
      fixture.access.map((access) => ({
        user_id: actualIds.get(access.userId),
        company_id: access.companyId,
      })),
      { onConflict: "user_id,company_id" },
    ),
  );

  await expectOk(
    "upsert retail fixture assets",
    sb.from("assets").upsert(
      fixture.assets.map((asset) => assetRow(asset, actualIds)),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert inert retail fixture ad budgets",
    sb.from("ad_budgets").upsert(
      fixture.adBudgets.map((budget) => ({
        company_id: budget.companyId,
        monthly_budget_usd: 0,
        allocation: {},
        fee_model: budget.feeModel,
        fee_percent: 0,
        fee_flat_usd: 0,
        updated_by: adminId,
        updated_at: budget.updatedAt,
      })),
      { onConflict: "company_id" },
    ),
  );

  const companyRows = (await expectOk(
    "verify retail fixture companies",
    sb
      .from("companies")
      .select("id,tenant_id,profile")
      .eq("tenant_id", fixture.tenant.id),
  )) as unknown[];
  const accessRows = (await expectOk(
    "verify retail fixture approver access",
    sb.from("company_access").select("user_id,company_id").in("user_id", fixtureApproverIds),
  )) as { user_id: string; company_id: string }[];
  const membershipRows = (await expectOk(
    "verify retail fixture memberships",
    sb
      .from("tenant_members")
      .select("user_id,role,role_title,portal_only")
      .eq("tenant_id", fixture.tenant.id),
  )) as unknown[];
  const assetRows = (await expectOk(
    "verify retail fixture assets",
    sb.from("assets").select("id,company_id,status,source").in(
      "id",
      fixture.assets.map((asset) => asset.id),
    ),
  )) as unknown[];

  if (companyRows.length !== expectedCompanies) {
    throw new Error(
      `post-seed retail company count is ${companyRows.length}, expected ${expectedCompanies}`,
    );
  }
  if (
    accessRows.length !== expectedCompanies ||
    new Set(accessRows.map((row) => row.user_id)).size !== expectedCompanies ||
    new Set(accessRows.map((row) => row.company_id)).size !== expectedCompanies
  ) {
    throw new Error(
      `post-seed retail approver access is ${accessRows.length}, expected exactly one per approver`,
    );
  }
  if (membershipRows.length !== fixture.memberships.length) {
    throw new Error(
      `post-seed retail membership count is ${membershipRows.length}, expected ${fixture.memberships.length}`,
    );
  }
  if (assetRows.length !== expectedCompanies * 2) {
    throw new Error(
      `post-seed retail asset count is ${assetRows.length}, expected ${expectedCompanies * 2}`,
    );
  }

  return {
    tenantId: fixture.tenant.id,
    fixtureKey: fixture.fixtureKey,
    vertical: fixture.vertical,
    companies: companyRows.length,
    users: fixture.users.length,
    approvers: fixtureApproverIds.length,
    assets: assetRows.length,
  };
}
