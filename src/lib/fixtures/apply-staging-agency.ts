/**
 * Idempotent staging restaurant fixture apply (service-role only).
 * Shared by CLI seed script and staging /dev seed action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createStagingAgencyFixture,
  stagingFixtureAuthMetadata,
  type StagingAgencyFixture,
} from "@/lib/fixtures/staging-agency";
import { upsertSaffronWalkthroughPack } from "@/lib/fixtures/saffron-walkthrough";
import { validateStagingAgencyFixture } from "@/lib/selftest/staging-agency-fixture";

export type StagingFixtureApplySummary = {
  tenantId: string;
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

async function ensureFixtureAuthUsers(
  sb: SupabaseClient,
  fixture: StagingAgencyFixture,
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
      throw new Error(`list fixture auth users: ${listed.error.message}`);
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
    const operatorRole = metadata.appMetadata.role ?? null;
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
          `create fixture auth user ${user.fixtureKey}: ${created.error?.message ?? "no user"}`,
        );
      }
      authUser = created.data.user;
      byEmail.set(user.email.toLowerCase(), authUser);
    } else if (
      operatorRole &&
      (authUser.app_metadata?.role !== operatorRole ||
        authUser.app_metadata?.tenant_id !== fixture.tenant.id)
    ) {
      const updated = await sb.auth.admin.updateUserById(authUser.id, {
        app_metadata: {
          ...authUser.app_metadata,
          ...metadata.appMetadata,
        },
      });
      if (updated.error || !updated.data.user) {
        throw new Error(
          `assign fixture auth role ${user.fixtureKey}: ${updated.error?.message ?? "no user"}`,
        );
      }
      authUser = updated.data.user;
      byEmail.set(user.email.toLowerCase(), authUser);
    }
    actualIds.set(user.id, authUser.id);
  }
  return actualIds;
}

function assetRow(
  asset: StagingAgencyFixture["assets"][number],
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

/** Apply (or re-apply) the ten-restaurant staging fixture via service role. */
export async function applyStagingAgencyFixture(
  sb: SupabaseClient,
  fixture: StagingAgencyFixture = createStagingAgencyFixture(),
): Promise<StagingFixtureApplySummary> {
  const checks = validateStagingAgencyFixture(fixture);
  const failed = checks.find((c) => !c.ok);
  if (failed) {
    throw new Error(`fixture self-test failed: ${failed.name} — ${failed.detail}`);
  }

  const actualIds = await ensureFixtureAuthUsers(sb, fixture);
  const admin = fixture.users.find((user) => user.fixtureRole === "Admin");
  if (!admin) throw new Error("fixture admin is missing");
  const adminId = actualIds.get(admin.id);
  if (!adminId) throw new Error("fixture admin auth id is missing");

  const fixtureApproverIds = fixture.users
    .filter((user) => user.fixtureRole === "Client Approver")
    .map((user) => actualIds.get(user.id))
    .filter((id): id is string => Boolean(id));
  if (fixtureApproverIds.length !== 10) {
    throw new Error(
      `expected 10 fixture approver ids, got ${fixtureApproverIds.length}`,
    );
  }
  const fixtureCompanyIds = fixture.companies.map((company) => company.id);
  const existingApproverAccess = await expectOk(
    "preflight fixture approver access",
    sb.from("company_access").select("user_id,company_id").in("user_id", fixtureApproverIds),
  );
  const fixtureCompanyIdSet = new Set(fixtureCompanyIds);
  const unexpectedAccess = (existingApproverAccess ?? []).filter(
    (row: { company_id: string }) => !fixtureCompanyIdSet.has(row.company_id),
  );
  if (unexpectedAccess.length > 0) {
    throw new Error(
      `fixture approver identities have ${unexpectedAccess.length} non-fixture access rows; refusing cross-tenant mutation`,
    );
  }

  await expectOk(
    "upsert fixture app users",
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
    "upsert fixture tenant",
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
    "upsert fixture memberships",
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
    "upsert fixture companies",
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
    "clear fixture approver access",
    sb
      .from("company_access")
      .delete()
      .in("user_id", fixtureApproverIds)
      .in("company_id", fixtureCompanyIds),
  );
  await expectOk(
    "upsert fixture approver access",
    sb.from("company_access").upsert(
      fixture.access.map((access) => ({
        user_id: actualIds.get(access.userId),
        company_id: access.companyId,
      })),
      { onConflict: "user_id,company_id" },
    ),
  );

  await expectOk(
    "upsert fixture assets",
    sb.from("assets").upsert(
      fixture.assets.map((asset) => assetRow(asset, actualIds)),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert inert fixture ad budgets",
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

  // Investor golden path: Saffron Laneway only (strategy, approvals, schedule, results, billing).
  await upsertSaffronWalkthroughPack(sb, fixture, actualIds);

  const companyRows = (await expectOk(
    "verify fixture companies",
    sb
      .from("companies")
      .select("id,tenant_id,profile")
      .eq("tenant_id", fixture.tenant.id),
  )) as unknown[];
  const accessRows = (await expectOk(
    "verify fixture approver access",
    sb.from("company_access").select("user_id,company_id").in("user_id", fixtureApproverIds),
  )) as { user_id: string; company_id: string }[];
  const membershipRows = (await expectOk(
    "verify fixture memberships",
    sb
      .from("tenant_members")
      .select("user_id,role,role_title,portal_only")
      .eq("tenant_id", fixture.tenant.id),
  )) as unknown[];
  const assetRows = (await expectOk(
    "verify fixture assets",
    sb.from("assets").select("id,company_id,status,source").in(
      "id",
      fixture.assets.map((asset) => asset.id),
    ),
  )) as unknown[];

  if (companyRows.length !== 10) {
    throw new Error(`post-seed company count is ${companyRows.length}, expected 10`);
  }
  if (
    accessRows.length !== 10 ||
    new Set(accessRows.map((row) => row.user_id)).size !== 10 ||
    new Set(accessRows.map((row) => row.company_id)).size !== 10
  ) {
    throw new Error(
      `post-seed approver access is ${accessRows.length}, expected exactly one per approver`,
    );
  }
  if (membershipRows.length !== fixture.memberships.length) {
    throw new Error(
      `post-seed membership count is ${membershipRows.length}, expected ${fixture.memberships.length}`,
    );
  }
  if (assetRows.length !== 20) {
    throw new Error(`post-seed asset count is ${assetRows.length}, expected 20`);
  }

  return {
    tenantId: fixture.tenant.id,
    companies: companyRows.length,
    users: fixture.users.length,
    approvers: fixtureApproverIds.length,
    assets: assetRows.length,
  };
}
