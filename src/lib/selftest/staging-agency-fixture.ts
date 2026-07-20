import {
  STAGING_FIXTURE_KEY,
  createStagingAgencyFixture,
  stagingFixtureAuthMetadata,
  type StagingAgencyFixture,
} from "@/lib/fixtures/staging-agency";

export interface StagingFixtureCheck {
  name: string;
  ok: boolean;
  detail: string;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>,
  );
}

function addCheck(
  checks: StagingFixtureCheck[],
  name: string,
  ok: boolean,
  detail: string,
): void {
  checks.push({ name, ok, detail });
}

export function validateStagingAgencyFixture(
  fixture: StagingAgencyFixture = createStagingAgencyFixture(),
): StagingFixtureCheck[] {
  const checks: StagingFixtureCheck[] = [];
  const companyIds = new Set(fixture.companies.map((company) => company.id));
  const approvers = fixture.users.filter((user) => user.fixtureRole === "Client Approver");
  const approverIds = new Set(approvers.map((user) => user.id));
  const tierCounts = countBy(fixture.companies.map((company) => company.profile.stagingFixture.serviceTier));
  const roleCounts = countBy(fixture.users.map((user) => user.fixtureRole));
  const searchVisibility = fixture.companies.filter((company) =>
    company.profile.stagingFixture.addons.includes("Search Visibility"),
  );
  const growthSearchOptions = fixture.companies.filter(
    (company) =>
      company.profile.stagingFixture.serviceTier === "Growth" &&
      company.profile.managedService?.serviceOptions?.searchVisibility === true,
  );
  const allIds = [
    fixture.tenant.id,
    ...fixture.users.map((user) => user.id),
    ...fixture.companies.map((company) => company.id),
    ...fixture.assets.map((asset) => asset.id),
  ];

  addCheck(
    checks,
    "stagingFixture.identity",
    fixture.fixtureKey === STAGING_FIXTURE_KEY &&
      new Set(allIds).size === allIds.length,
    `key=${fixture.fixtureKey} uniqueIds=${new Set(allIds).size}/${allIds.length}`,
  );
  addCheck(
    checks,
    "stagingFixture.companyDistribution",
    fixture.companies.length === 10 &&
      tierCounts.Starter === 4 &&
      tierCounts.Growth === 4 &&
      tierCounts.Managed === 2,
    `companies=${fixture.companies.length} starter=${tierCounts.Starter ?? 0} growth=${tierCounts.Growth ?? 0} managed=${tierCounts.Managed ?? 0}`,
  );
  addCheck(
    checks,
    "stagingFixture.searchVisibility",
    searchVisibility.length === 1 &&
      searchVisibility[0]?.profile.stagingFixture.serviceTier === "Growth" &&
      growthSearchOptions.length === 1 &&
      growthSearchOptions[0]?.id === searchVisibility[0]?.id,
    `addon=${searchVisibility.length} growthOption=${growthSearchOptions.length} tier=${searchVisibility[0]?.profile.stagingFixture.serviceTier ?? "none"}`,
  );
  addCheck(
    checks,
    "stagingFixture.rolesOnly",
    Object.keys(roleCounts).every((role) =>
      ["Admin", "Staff", "Client Approver"].includes(role),
    ) &&
      roleCounts.Admin === 1 &&
      roleCounts.Staff === 2 &&
      roleCounts["Client Approver"] === 10,
    `admin=${roleCounts.Admin ?? 0} staff=${roleCounts.Staff ?? 0} approvers=${roleCounts["Client Approver"] ?? 0}`,
  );
  const operatorMetadata = fixture.users
    .filter(
      (user) => user.fixtureRole === "Admin" || user.fixtureRole === "Staff",
    )
    .map((user) => stagingFixtureAuthMetadata(user, fixture.tenant.id));
  const clientMetadata = approvers.map((user) =>
    stagingFixtureAuthMetadata(user, fixture.tenant.id),
  );
  addCheck(
    checks,
    "stagingFixture.operatorAppMetadata",
    operatorMetadata.length === 3 &&
      operatorMetadata.every(
        (metadata) =>
          ["Admin", "Staff"].includes(metadata.appMetadata.role) &&
          metadata.appMetadata.tenant_id === fixture.tenant.id &&
          !("role" in metadata.userMetadata) &&
          !("tenant_id" in metadata.userMetadata),
      ) &&
      clientMetadata.every(
        (metadata) => Object.keys(metadata.appMetadata).length === 0,
      ),
    `operators=${operatorMetadata.length} tenant=${fixture.tenant.id}`,
  );

  const accessCounts = countBy(
    fixture.access
      .filter((access) => approverIds.has(access.userId))
      .map((access) => access.userId),
  );
  const companyAccessCounts = countBy(
    fixture.access.map((access) => access.companyId),
  );
  const approverIsolation =
    approvers.length === fixture.companies.length &&
    approvers.every((approver) => accessCounts[approver.id] === 1) &&
    fixture.companies.every((company) => companyAccessCounts[company.id] === 1) &&
    fixture.access.every(
      (access) => approverIds.has(access.userId) && companyIds.has(access.companyId),
    ) &&
    fixture.memberships
      .filter((member) => approverIds.has(member.userId))
      .every((member) => member.role === "member" && member.portalOnly === true);
  addCheck(
    checks,
    "stagingFixture.approverIsolation",
    approverIsolation,
    `approvers=${approvers.length} isolated=${approvers.filter((user) => accessCounts[user.id] === 1).length}`,
  );

  const tenantIsolation =
    fixture.companies.every((company) => company.tenantId === fixture.tenant.id) &&
    fixture.memberships.every((member) => member.tenantId === fixture.tenant.id) &&
    fixture.assets.every((asset) => companyIds.has(asset.companyId)) &&
    fixture.adBudgets.every((budget) => companyIds.has(budget.companyId));
  addCheck(
    checks,
    "stagingFixture.tenantIsolation",
    tenantIsolation,
    `tenant=${fixture.tenant.id} companies=${companyIds.size}`,
  );

  const profileCompleteness = fixture.companies.every((company) => {
    const profile = company.profile;
    const metadata = profile.stagingFixture;
    return (
      profile.businessType === "restaurant_cafe" &&
      !!profile.restaurant?.cuisineStyle &&
      profile.restaurant.serviceModes.length > 0 &&
      !!profile.tradingHours &&
      !!profile.brandVoice &&
      metadata.testOnly &&
      metadata.identifiers.domain.endsWith(".test") &&
      metadata.identifiers.abnLike.startsWith("TEST ONLY") &&
      metadata.goals.length >= 2 &&
      metadata.menuHighlights.length >= 3 &&
      metadata.serviceDetails.length > 0 &&
      metadata.monthlyAdCapAud > 0 &&
      profile.managedService?.serviceOptions?.monthlyAdCapAud ===
        metadata.monthlyAdCapAud &&
      metadata.timezone.startsWith("Australia/")
    );
  });
  addCheck(
    checks,
    "stagingFixture.profileCompleteness",
    profileCompleteness,
    `complete=${fixture.companies.filter((company) => company.profile.stagingFixture.testOnly).length}/${fixture.companies.length}`,
  );

  const clientAssets = fixture.assets.filter((asset) => asset.source === "upload");
  const generatedAssets = fixture.assets.filter((asset) => asset.source === "ai_generated");
  const visualAudit =
    clientAssets.length === 10 &&
    clientAssets.every(
      (asset) =>
        asset.status === "approved" &&
        asset.usageRights.consentObtained &&
        asset.usageRights.licenceRef?.startsWith("TEST-ONLY-RIGHTS-") &&
        asset.tags.includes("rights-audit"),
    ) &&
    generatedAssets.length === 10 &&
    generatedAssets.every(
      (asset) =>
        asset.status === "draft" &&
        asset.folder?.startsWith("Private/") &&
        asset.aiModel === "fixture-simulated-image-model" &&
        !!asset.aiPrompt?.startsWith("TEST FIXTURE ONLY") &&
        asset.estCostUsd === 0 &&
        asset.tags.includes("private"),
    );
  addCheck(
    checks,
    "stagingFixture.visualRightsAndProvenance",
    visualAudit,
    `clientProvided=${clientAssets.length} generatedPrivate=${generatedAssets.length}`,
  );

  const sideEffectSafe =
    Object.values(fixture.sideEffects).every((enabled) => enabled === false) &&
    fixture.users.every((user) => user.email.endsWith("@staging-fixture.invalid")) &&
    fixture.companies.every((company) =>
      company.profile.stagingFixture.connectors.every(
        (connector) =>
          connector.mode === "simulated" &&
          connector.liveOperationsAllowed === false &&
          connector.externalAccountRef.startsWith("TEST-ONLY-"),
      ),
    ) &&
    fixture.adBudgets.every(
      (budget) =>
        budget.monthlyBudgetUsd === 0 &&
        budget.feeFlatUsd === 0 &&
        budget.feePercent === 0,
    ) &&
    !fixture.tenant.stripeCustomerId &&
    !fixture.tenant.stripeSubscriptionId;
  addCheck(
    checks,
    "stagingFixture.noRealSideEffects",
    sideEffectSafe,
    "reserved emails/domains; zero live ad budget; no billing or publishing records",
  );

  const deterministic =
    JSON.stringify(fixture) === JSON.stringify(createStagingAgencyFixture());
  addCheck(
    checks,
    "stagingFixture.deterministic",
    deterministic,
    `bytes=${JSON.stringify(fixture).length}`,
  );

  return checks;
}

export function assertValidStagingAgencyFixture(
  fixture: StagingAgencyFixture = createStagingAgencyFixture(),
): void {
  const failed = validateStagingAgencyFixture(fixture).filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      `Invalid staging fixture: ${failed.map((check) => `${check.name} (${check.detail})`).join("; ")}`,
    );
  }
}

export async function runStagingAgencyFixtureSelfTest(): Promise<{
  ok: boolean;
  checks: StagingFixtureCheck[];
}> {
  const checks = validateStagingAgencyFixture();
  return { ok: checks.every((check) => check.ok), checks };
}
