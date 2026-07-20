import assert from "node:assert/strict";
import { db, resetStore } from "../src/lib/db/store";
import {
  STAGING_FIXTURE_KEY,
  STAGING_FIXTURE_TENANT_ID,
  createStagingAgencyFixture,
} from "../src/lib/fixtures/staging-agency";
import {
  listManagedJobExceptions,
  listManagedJobs,
} from "../src/lib/managed-content-jobs/repository";
import {
  lookupSimulatedPublish,
  publishIdempotencyKey,
  publishPostNow,
} from "../src/lib/publish-queue";
import { TENANT_ROLE_TIER, type ActingUser } from "../src/lib/types";

type StoreKey = keyof ReturnType<typeof db>;
const PRIMARY_ROUTE_COVERAGE: Record<
  string,
  {
    required: StoreKey[];
    applicability: "all_fixture_companies" | "not_applicable";
    reason?: string;
  }
> = {
  "/dashboard": {
    required: ["managedDeliveryRuns", "managedStrategyCycles"],
    applicability: "all_fixture_companies",
  },
  "/approvals": {
    required: ["managedApprovalRequests"],
    applicability: "all_fixture_companies",
  },
  "/companies": {
    required: ["companies"],
    applicability: "all_fixture_companies",
  },
  "/requests": {
    required: ["requests"],
    applicability: "all_fixture_companies",
  },
  "/campaigns": {
    required: ["campaigns", "campaignItems"],
    applicability: "all_fixture_companies",
  },
  "/content": {
    required: ["content", "assets"],
    applicability: "all_fixture_companies",
  },
  "/calendar": {
    required: ["managedPlannedSlots", "scheduledPosts"],
    applicability: "all_fixture_companies",
  },
  "/publishing": {
    required: ["scheduledPosts", "publishLogs"],
    applicability: "all_fixture_companies",
  },
  "/recommendations": {
    required: ["recommendations"],
    applicability: "all_fixture_companies",
  },
  "/analytics": {
    required: ["campaigns", "publishLogs"],
    applicability: "all_fixture_companies",
  },
  "/client": {
    required: ["managedDeliveryRuns", "content"],
    applicability: "all_fixture_companies",
  },
  "/client/approvals": {
    required: ["managedApprovalRequests"],
    applicability: "all_fixture_companies",
  },
  "/client/calendar": {
    required: ["scheduledPosts"],
    applicability: "all_fixture_companies",
  },
  "/client/reports": {
    required: ["campaigns", "publishLogs"],
    applicability: "all_fixture_companies",
  },
  "/client/account": {
    required: ["taxInvoices"],
    applicability: "all_fixture_companies",
  },
  "/platform-admin": {
    required: [],
    applicability: "not_applicable",
    reason: "Platform template administration is global, not client data.",
  },
};

const SECONDARY_DOMAINS: Record<string, keyof ReturnType<typeof db>> = {
  "brand-brain": "ragKnowledgeSources",
  governance: "evidence",
  assets: "assets",
  "generation-provenance": "aiRuns",
  "paid-media": "adCampaigns",
  crm: "crmContacts",
  reviews: "companyReviews",
  inbox: "socialMentions",
  email: "emailCampaigns",
  sms: "smsCampaigns",
  cms: "cmsPages",
  recommendations: "recommendations",
  tasks: "tasks",
  bookings: "reservations",
  ordering: "restaurantOrders",
  menus: "menuDesigns",
  loyalty: "loyaltyPrograms",
  invoices: "taxInvoices",
  audit: "audit",
  workflows: "marketingWorkflows",
  privacy: "privacyRequests",
  learning: "learningHypotheses",
  "operational-exceptions": "publishLogs",
};

function rowsForFixtureCompany(
  store: ReturnType<typeof db>,
  key: keyof ReturnType<typeof db>,
  companyIds: Set<string>,
): unknown[] {
  const rows = store[key];
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const companyId = (row as { companyId?: string }).companyId;
    return companyId ? companyIds.has(companyId) : false;
  });
}

const fixture = createStagingAgencyFixture();
const companyIds = new Set(fixture.companies.map((company) => company.id));
const approvers = fixture.users.filter((user) => user.fixtureRole === "Client Approver");

async function completeSeedSnapshot(store: ReturnType<typeof db>): Promise<string> {
  const jobs = await listManagedJobs(STAGING_FIXTURE_TENANT_ID);
  const exceptions = (
    await Promise.all(jobs.map((job) => listManagedJobExceptions(job.id)))
  ).flat();
  // No runtime fields are excluded: reset must reproduce the complete
  // serializable store plus the separate managed-job memory state.
  return JSON.stringify({ store, managedJobs: jobs, managedJobExceptions: exceptions });
}

resetStore();
const first = await completeSeedSnapshot(db());
resetStore();
let store = db();
const second = await completeSeedSnapshot(store);

assert.equal(first, second, "complete serializable seed/reset state must be deterministic");

function prepareSeededPublish(): {
  postId: string;
  actor: ActingUser;
} {
  const current = db();
  const post = current.scheduledPosts.find((item) => item.status === "scheduled");
  assert.ok(post, "seed must contain a scheduled post for reset publishing");
  const content = current.content.find((item) => item.id === post.contentId);
  assert.ok(content, "seeded scheduled content missing");
  content.status = "scheduled";
  content.assetIds = [];
  const integration = current.integrations.find(
    (item) =>
      item.companyId === post.companyId &&
      item.platform.toLowerCase() === post.platform.toLowerCase(),
  );
  assert.ok(integration, "seeded scheduled post integration missing");
  integration.status = "connected";
  const company = current.companies.find((item) => item.id === post.companyId);
  assert.ok(company, "seeded scheduled post company missing");
  const managedService = company.profile.managedService;
  assert.ok(managedService?.serviceBilling, "seeded company service billing missing");
  managedService.serviceBilling.status = "active";
  const security = current.security.find(
    (item) => item.tenantId === company.tenantId,
  );
  if (security) {
    security.crisisMode = false;
    security.sandboxMode = false;
  }
  const controls = current.publishingControls.find(
    (item) => item.tenantId === company.tenantId,
  );
  if (controls) {
    controls.freezeAll = false;
    controls.automatedPublishingDisabled = false;
    controls.frozenCompanyIds = [];
    controls.frozenPlatforms = [];
    controls.frozenCampaignIds = [];
  }
  current.legalHolds.splice(
    0,
    current.legalHolds.length,
    ...current.legalHolds.filter(
      (item) => item.scope !== "content" || item.targetId !== content.id,
    ),
  );
  const actor: ActingUser = {
    id: "system:reset-selftest",
    email: "reset-selftest@marketing-command-centre.system",
    name: "Reset self-test",
    role: TENANT_ROLE_TIER.owner,
    active: true,
    tenantId: company.tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
  return { postId: post.id, actor };
}

const firstSeededPublish = prepareSeededPublish();
const firstPublish = await publishPostNow(
  firstSeededPublish.postId,
  firstSeededPublish.actor,
  { bypassCeilingCheck: true },
);
assert.equal(firstPublish?.log.status, "published", "seeded post must publish");
const firstKey = publishIdempotencyKey(firstSeededPublish.postId, 1);
assert.ok(lookupSimulatedPublish(firstKey), "simulated publish registry was not populated");

resetStore();
store = db();
assert.equal(
  lookupSimulatedPublish(firstKey),
  undefined,
  "resetStore must clear simulated publishing idempotency state",
);
const secondSeededPublish = prepareSeededPublish();
assert.equal(
  secondSeededPublish.postId,
  firstSeededPublish.postId,
  "reset must restore the same deterministic seeded post id",
);
const secondPublish = await publishPostNow(
  secondSeededPublish.postId,
  secondSeededPublish.actor,
  { bypassCeilingCheck: true },
);
assert.equal(
  secondPublish?.log.status,
  "published",
  "same seeded post must publish after reset",
);
const duplicate = await publishPostNow(
  secondSeededPublish.postId,
  secondSeededPublish.actor,
  { bypassCeilingCheck: true },
);
assert.equal(duplicate, null, "same seeded post must not publish twice after reset");
assert.equal(
  db().publishLogs.filter(
    (log) =>
      log.scheduledPostId === secondSeededPublish.postId &&
      log.status === "published",
  ).length,
  1,
  "post-reset seeded id must have exactly one successful publish",
);

resetStore();
store = db();
assert.equal(
  store.tenants.filter((tenant) => tenant.id === STAGING_FIXTURE_TENANT_ID).length,
  1,
  "fixture tenant must be loaded exactly once",
);
assert.equal(
  store.companies.filter((company) => companyIds.has(company.id)).length,
  10,
  "all ten fictional restaurants must be loaded",
);

for (const [route, coverage] of Object.entries(PRIMARY_ROUTE_COVERAGE)) {
  assert.ok(route.startsWith("/"), `invalid primary route declaration: ${route}`);
  if (coverage.applicability === "not_applicable") {
    assert.ok(coverage.reason, `${route} needs a non-applicability reason`);
    assert.equal(coverage.required.length, 0);
    continue;
  }
  for (const company of fixture.companies) {
    for (const key of coverage.required) {
      const records =
        key === "companies"
          ? store.companies.filter((row) => row.id === company.id)
          : rowsForFixtureCompany(store, key, new Set([company.id]));
      assert.ok(
        records.length > 0,
        `${route} requires ${String(key)} for applicable client ${company.name}`,
      );
    }
  }
}

for (const approver of approvers) {
  const access = store.access.filter((row) => row.userId === approver.id);
  assert.equal(access.length, 1, `${approver.email} must see exactly one restaurant`);
  const companyId = access[0]!.companyId;
  assert.ok(companyIds.has(companyId), `${approver.email} escaped fixture tenant`);
  assert.ok(store.content.some((row) => row.companyId === companyId), "client content missing");
  assert.ok(
    store.managedApprovalRequests.some((row) => row.companyId === companyId),
    "client approval missing",
  );
  assert.ok(store.scheduledPosts.some((row) => row.companyId === companyId), "client calendar missing");
  assert.ok(store.taxInvoices.some((row) => row.companyId === companyId), "client account invoice missing");
  assert.ok(
    store.managedStrategyCycles.some((row) => row.companyId === companyId),
    "client strategy missing",
  );
}

for (const [domain, key] of Object.entries(SECONDARY_DOMAINS)) {
  assert.ok(
    rowsForFixtureCompany(store, key, companyIds).length > 0,
    `${domain} (${String(key)}) has no fixture representative`,
  );
}

for (const company of fixture.companies) {
  const profile = company.profile.stagingFixture;
  assert.equal(profile.testOnly, true);
  assert.ok(profile.identifiers.domain.endsWith(".test"));
  assert.ok(
    store.managedPlannedSlots.some((row) => row.companyId === company.id),
    `${company.name} has no 30-day slot`,
  );
  assert.ok(
    store.managedContentConcepts.some((row) => row.companyId === company.id),
    `${company.name} has no concept`,
  );
  assert.ok(
    store.assets.some((row) => row.companyId === company.id && row.tags.includes("test-only")),
    `${company.name} has no safe fixture asset`,
  );
}

const fixtureScopedCollections = [
  store.managedDeliveryRuns,
  store.managedStrategyCycles,
  store.managedContentConcepts,
  store.managedChannelAdaptations,
  store.managedPlannedSlots,
  store.managedApprovalRequests,
  store.managedPaidAuthorizations,
  store.managedEngagementRoutes,
];
for (const rows of fixtureScopedCollections) {
  for (const row of rows.filter((item) => item.tenantId === STAGING_FIXTURE_TENANT_ID)) {
    assert.ok(companyIds.has(row.companyId), `tenant-scoped row leaked to ${row.companyId}`);
  }
}

assert.ok(
  store.publishLogs.some(
    (row) =>
      companyIds.has(row.companyId) &&
      row.detail.includes("SIMULATED") &&
      row.detail.includes("no provider request"),
  ),
  "operational failure must be labelled simulated",
);
assert.ok(
  store.integrations
    .filter((row) => companyIds.has(row.companyId))
    .every((row) => row.status !== "connected"),
  "fixture publishing integrations must not claim a live connection",
);
assert.ok(
  store.adAccounts
    .filter((row) => companyIds.has(row.companyId))
    .every((row) => row.status !== "connected"),
  "fixture ad integrations must not claim a live connection",
);
assert.ok(
  fixture.users.every((user) => user.email.endsWith("@staging-fixture.invalid")),
  "fixture users must use reserved invalid email domains",
);
assert.ok(
  store.audit.some(
    (row) =>
      row.tenantId === STAGING_FIXTURE_TENANT_ID &&
      row.detail?.includes("external side effects disabled"),
  ),
  "safe fixture load must be auditable",
);
const generationJobs = await listManagedJobs(STAGING_FIXTURE_TENANT_ID);
const generationExceptions = await listManagedJobExceptions("demo-02-generation-job");
assert.ok(
  generationJobs.some(
    (job) =>
      job.status === "ready" &&
      job.privateProvenance?.mode === "simulated" &&
      job.privateProvenance?.externalNetwork === false,
  ),
  "ready generation job with private simulated provenance is missing",
);
assert.ok(
  generationExceptions.some(
    (item) => item.status === "open" && item.message.includes("no network call"),
  ),
  "generation operational exception is missing",
);

console.log(
  `local demo seed self-test passed: ${Object.keys(PRIMARY_ROUTE_COVERAGE).length} primary routes, ` +
    `${Object.keys(SECONDARY_DOMAINS).length} secondary domains, ` +
    `${fixture.companies.length} isolated restaurants (${STAGING_FIXTURE_KEY})`,
);
