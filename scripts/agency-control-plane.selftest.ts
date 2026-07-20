import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAgencyControlPlane,
  latestConfirmedProfileByCompany,
} from "../src/lib/agency-control-plane";
import {
  collectAllChunkPages,
  collectAllPages,
  dedupeById,
} from "../src/lib/db/pagination";
import { chunkIds } from "../src/lib/db/chunk-ids";
import {
  diagnosticAccessAllowed,
  localDemoMutationAllowed,
  localDemoPostAllowed,
} from "../src/lib/dev-access";
import { sendEmail } from "../src/lib/email";
import { dispatchWorkflowEmail } from "../src/lib/marketing-automation-connectors";
import { isRetryEligiblePost } from "../src/lib/publish-queue";
import type { ManagedContentJobRecord } from "../src/lib/managed-content-jobs/repository";
import type {
  Company,
  ManagedContentConcept,
  ManagedPlannedSlot,
  ManagedStrategyCycle,
  ScheduledPost,
} from "../src/lib/types";

const nowIso = "2026-07-19T00:00:00.000Z";
const tenantId = "tenant-a";

function company(
  id: string,
  tenant: string,
  billingStatus: "active" | "paused" = "active",
): Company {
  return {
    id,
    tenantId: tenant,
    name: `Company ${id}`,
    status: "ai_ready",
    profile: {
      serviceAreas: ["Brisbane"],
      services: ["Service"],
      callsToAction: ["Book"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      managedService: {
        serviceLevel: "managed_exceptions",
        serviceBilling: {
          status: billingStatus,
          activePackageId: "growth",
          serviceOptions: {
            searchVisibility: false,
            websiteConnectionSetup: false,
            websitePublishing: false,
            hostedLandingPage: false,
            monthlyAdCapAud: 0,
          },
        },
      },
    },
    documents: [],
    createdBy: "staff",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function strategy(companyId: string, tenant: string): ManagedStrategyCycle {
  return {
    id: `cycle-${companyId}`,
    tenantId: tenant,
    companyId,
    quarterStart: "2026-07-01",
    status: "approved",
    confirmedInputs: {
      profileConfirmedAt: "2026-07-01T00:00:00.000Z",
      goals: ["Growth"],
      packageId: "growth",
      locations: ["Brisbane"],
      seasonalInputs: [],
    },
    guardrails: {
      channels: ["facebook"],
      themes: ["Trust"],
      publishWindows: ["weekday"],
    },
    approvedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function concept(companyId: string, tenant: string): ManagedContentConcept {
  return {
    id: `concept-${companyId}`,
    tenantId: tenant,
    companyId,
    strategyCycleId: `cycle-${companyId}`,
    packagePeriod: "2026-07",
    unitKey: "unit-1",
    title: "Campaign concept",
    theme: "Trust",
    status: "approved",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function slots(companyId: string, tenant: string): ManagedPlannedSlot[] {
  return [
    "2026-07-24T09:00:00.000Z",
    "2026-07-28T09:00:00.000Z",
    "2026-08-02T09:00:00.000Z",
    "2026-08-06T09:00:00.000Z",
  ].map((plannedPublishAt, index) => ({
    id: `slot-${companyId}-${index}`,
    tenantId: tenant,
    companyId,
    conceptId: `concept-${companyId}`,
    adaptationId: `adaptation-${index}`,
    plannedPublishAt,
    finalContentDueAt: "2026-07-10T09:00:00.000Z",
    status: "approved",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
  }));
}

function failedJob(
  id: string,
  companyId: string,
  tenant: string,
): ManagedContentJobRecord {
  return {
    id,
    tenantId: tenant,
    companyId,
    requestId: `request-${id}`,
    conceptId: `concept-${companyId}`,
    idempotencyKey: `key-${id}`,
    requestFingerprint: `fingerprint-${id}`,
    request: {
      tenantId: tenant,
      companyId,
      requestId: `request-${id}`,
      conceptId: `concept-${companyId}`,
      packagePeriod: "2026-07",
      theme: "Trust",
      brief: "Create a campaign concept.",
      strategyContext: {},
      channels: ["facebook"],
      assetReferences: [],
      plannedPublishAt: "2026-08-02T09:00:00.000Z",
    },
    schemaVersion: "1.0",
    status: "failed",
    pollAttempts: 3,
    lastError: "Provider request failed",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

const active = company("company-a", tenantId);
const foreign = company("company-b", "tenant-b", "paused");
const activeSlots = slots(active.id, tenantId);
const foreignFailedPost: ScheduledPost = {
  id: "post-foreign",
  contentId: "content-foreign",
  companyId: foreign.id,
  platform: "Facebook",
  scheduledDate: "2026-07-18",
  status: "failed",
  createdById: "staff",
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

const base = {
  tenantId,
  nowIso,
  companies: [active, foreign],
  strategyCycles: [strategy(active.id, tenantId), strategy(foreign.id, "tenant-b")],
  concepts: [concept(active.id, tenantId), concept(foreign.id, "tenant-b")],
  slots: [...activeSlots, ...slots(foreign.id, "tenant-b")],
  approvals: [],
  deliveryRuns: [],
  scheduledPosts: [foreignFailedPost],
  publishLogs: [
    {
      id: "log-foreign",
      companyId: foreign.id,
      platform: "Facebook",
      status: "failed" as const,
      attempt: 1,
      detail: "Foreign failure",
      actorId: "system",
      createdAt: "2026-07-18T00:00:00.000Z",
    },
  ],
  managedJobs: [failedJob("job-foreign", foreign.id, "tenant-b")],
};

const automatic = buildAgencyControlPlane(base);
assert.equal(automatic.managedClients, 1, "foreign tenant company must be excluded");
assert.equal(automatic.activeClients, 1);
assert.equal(automatic.runningAutomatically, 1);
assert.equal(automatic.exceptionClients, 0);
assert.equal(automatic.exceptionTotal, 0);
assert.equal(automatic.retryablePublishingCount, 0);

const exception = buildAgencyControlPlane({
  ...base,
  managedJobs: [
    ...base.managedJobs,
    failedJob("job-local", active.id, tenantId),
  ],
});
assert.equal(exception.runningAutomatically, 0);
assert.equal(exception.exceptionClients, 1);
assert.equal(exception.exceptionTotal, 1);
assert.equal(exception.exceptions[0]?.stage, "Content");
assert.equal(exception.exceptions[0]?.risk, "critical");
assert.match(exception.exceptions[0]?.title ?? "", /failed/i);

const newerUnconfirmed = {
  ...strategy(active.id, tenantId),
  id: "cycle-newer-unconfirmed",
  confirmedInputs: {
    ...strategy(active.id, tenantId).confirmedInputs,
    profileConfirmedAt: "",
  },
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};
const mismatchRegression = buildAgencyControlPlane({
  ...base,
  strategyCycles: [strategy(active.id, tenantId), newerUnconfirmed],
});
assert.equal(
  latestConfirmedProfileByCompany([
    strategy(active.id, tenantId),
    newerUnconfirmed,
  ]).get(active.id)?.id,
  `cycle-${active.id}`,
);
assert.match(
  mismatchRegression.metrics.find((metric) => metric.label === "Profiles confirmed")
    ?.detail ?? "",
  /^1 of 1/,
);
assert.equal(
  mismatchRegression.exceptions.some((item) => item.id === `profile:${active.id}`),
  false,
  "metrics and exception classification must share latest-confirmed-profile semantics",
);

const ordinaryScheduled: ScheduledPost = {
  ...foreignFailedPost,
  id: "ordinary-due",
  companyId: active.id,
  status: "scheduled",
  scheduledDate: "2026-07-18",
};
const failedEligible: ScheduledPost = {
  ...ordinaryScheduled,
  id: "failed-eligible",
  status: "failed",
};
const failedLog = {
  id: "failed-log",
  companyId: active.id,
  platform: "Facebook",
  scheduledPostId: failedEligible.id,
  contentId: failedEligible.contentId,
  status: "failed" as const,
  attempt: 1,
  detail: "retry me",
  actorId: "staff",
  createdAt: "2026-07-18T00:00:00.000Z",
};
const retryClock = {
  nowIso,
  today: "2026-07-19",
  hhmm: "12:00",
};
assert.equal(isRetryEligiblePost(ordinaryScheduled, [], retryClock), false);
assert.equal(isRetryEligiblePost(failedEligible, [failedLog], retryClock), true);

async function asyncChecks() {
  const synthetic = Array.from({ length: 1_607 }, (_, index) => ({ id: index }));
  let queries = 0;
  const paged = await collectAllPages(
    (from, to) => {
      queries += 1;
      return Promise.resolve({
        data: synthetic.slice(from, to + 1),
        error: null,
      });
    },
    "synthetic portfolio",
  );
  assert.equal(paged.length, 1_607);
  assert.equal(queries, 4, "1,607 rows should require four 500-row queries");

  const clientIds = Array.from({ length: 1_607 }, (_, index) => `company-${index}`);
  const postIds = Array.from({ length: 1_607 }, (_, index) => `post-${index}`);
  const publishRows = [
    ...clientIds.map((companyId, index) => ({
      id: `log-${index}`,
      companyId,
      postId: postIds[index]!,
    })),
    ...Array.from({ length: 1_100 }, (_, index) => ({
      id: `overflow-${index}`,
      companyId: clientIds[0]!,
      postId: postIds[0]!,
    })),
  ];
  const queryChunks = chunkIds(postIds).flatMap((posts) =>
    chunkIds(clientIds).map((companies) => ({ posts, companies })),
  );
  let publishQueries = 0;
  const completePublishRows = await collectAllChunkPages(
    queryChunks,
    ({ posts, companies }, from, to) => {
      publishQueries += 1;
      const postSet = new Set(posts);
      const companySet = new Set(companies);
      const matching = publishRows.filter(
        (row) => postSet.has(row.postId) && companySet.has(row.companyId),
      );
      return Promise.resolve({
        data: matching.slice(from, to + 1),
        error: null,
      });
    },
    "synthetic publish logs",
  );
  assert.equal(
    completePublishRows.length,
    2_707,
    "all publish logs across 1,607 clients and capped pages must be returned",
  );
  assert.ok(
    publishQueries > queryChunks.length,
    "a chunk exceeding the row cap must fetch subsequent pages",
  );
  assert.equal(
    dedupeById([...completePublishRows, completePublishRows[0]!]).length,
    completePublishRows.length,
    "chunk results must dedupe deterministically by publish-log id",
  );

  const original = {
    ccEnv: process.env.CC_ENV,
    localDemo: process.env.CC_LOCAL_DEMO,
    publicLocalDemo: process.env.NEXT_PUBLIC_CC_LOCAL_DEMO,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
    secret: process.env.CC_SELFTEST_SECRET,
    resend: process.env.RESEND_API_KEY,
    workflowLive: process.env.WORKFLOW_LIVE,
  };
  try {
    process.env.CC_ENV = "development";
    process.env.CC_LOCAL_DEMO = "true";
    process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "true";
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
      writable: true,
      enumerable: true,
    });
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    process.env.CC_SELFTEST_SECRET = "test-secret";
    process.env.RESEND_API_KEY = "configured-but-must-not-send";
    process.env.WORKFLOW_LIVE = "true";

    const localhostHeaders = new Headers({ host: "localhost:3000" });
    assert.equal(localDemoMutationAllowed(localhostHeaders), true);
    assert.equal(
      localDemoMutationAllowed(
        new Headers({
          host: "preview.example.test",
          "x-forwarded-host": "localhost:3000",
        }),
        "https://preview.example.test/api/dev/seed",
      ),
      false,
      "x-forwarded-host must never spoof localhost authorization",
    );
    assert.equal(
      localDemoMutationAllowed(
        new Headers({
          host: "localhost:3000",
          "x-forwarded-host": "attacker.example",
        }),
        "http://localhost:3000/api/dev/seed",
      ),
      true,
      "forwarded host must not override the actual local Host/URL",
    );
    const sameOriginPost = new Headers({
      host: "127.0.0.1:3000",
      origin: "http://127.0.0.1:3000",
    });
    assert.equal(
      localDemoPostAllowed(
        sameOriginPost,
        "http://127.0.0.1:3000/api/dev/seed",
        "POST",
      ),
      true,
    );
    assert.equal(
      localDemoPostAllowed(
        new Headers({ host: "localhost:3000" }),
        "http://localhost:3000/api/dev/seed",
        "POST",
      ),
      false,
      "browser mutation without Origin must be rejected",
    );
    assert.equal(
      localDemoPostAllowed(
        new Headers({
          host: "localhost:3000",
          origin: "https://attacker.example",
        }),
        "http://localhost:3000/api/dev/seed",
        "POST",
      ),
      false,
      "cross-site mutation must be rejected",
    );
    assert.equal(
      localDemoPostAllowed(
        new Headers({
          host: "localhost:3000",
          origin: "https://localhost:3000",
        }),
        "http://localhost:3000/api/dev/seed",
        "POST",
      ),
      false,
      "same host with a different scheme is not same-origin",
    );
    assert.equal(
      localDemoPostAllowed(
        new Headers({
          host: "localhost:3000",
          origin: "http://localhost:3000",
        }),
        "http://localhost:3000/api/dev/seed",
        "GET",
      ),
      false,
      "GET must never authorize a seed mutation",
    );
    assert.equal(
      localDemoMutationAllowed(
        new Headers({ host: "localhost:3000" }),
        "http://attacker.example/api/dev/seed",
      ),
      false,
      "Host and received URL must agree",
    );
    process.env.VERCEL_ENV = "preview";
    assert.equal(
      localDemoMutationAllowed(localhostHeaders),
      false,
      "preview must never accept a spoofed localhost host",
    );
    const previewHeaders = new Headers({ host: "preview.example.test" });
    assert.equal(
      diagnosticAccessAllowed({
        headers: previewHeaders,
        providedSecret: "wrong-secret",
        user: { role: "admin" },
      }),
      false,
      "wrong secret must not unlock staging diagnostics",
    );
    assert.equal(
      diagnosticAccessAllowed({
        headers: previewHeaders,
        providedSecret: "test-secret",
        user: { role: "user" },
      }),
      true,
      "matching CC_SELFTEST_SECRET unlocks staging diagnostics without an Admin session",
    );
    delete process.env.CC_SELFTEST_SECRET;
    assert.equal(
      diagnosticAccessAllowed({
        headers: previewHeaders,
        user: { role: "user" },
      }),
      true,
      "staging stays open when CC_SELFTEST_SECRET is unset",
    );
    process.env.CC_SELFTEST_SECRET = "test-secret";

    delete process.env.VERCEL_ENV;
    const email = await sendEmail({
      to: "fixture@example.test",
      subject: "Must be simulated",
      html: "<p>test</p>",
    });
    assert.deepEqual(email, {
      ok: false,
      detail: "SIMULATED LOCAL DEMO — no email provider request was made",
      simulated: true,
    });
    const workflowEmail = await dispatchWorkflowEmail({
      to: "fixture@example.test",
      subject: "Must be simulated",
      htmlBody: "<p>test</p>",
    });
    assert.equal(workflowEmail.mode, "simulated");
    assert.match(workflowEmail.detail, /no email provider request/);
  } finally {
    for (const [key, value] of Object.entries({
      CC_ENV: original.ccEnv,
      CC_LOCAL_DEMO: original.localDemo,
      NEXT_PUBLIC_CC_LOCAL_DEMO: original.publicLocalDemo,
      VERCEL: original.vercel,
      VERCEL_ENV: original.vercelEnv,
      NODE_ENV: original.nodeEnv,
      CC_SELFTEST_SECRET: original.secret,
      RESEND_API_KEY: original.resend,
      WORKFLOW_LIVE: original.workflowLive,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const actionSource = readFileSync(
    new URL("../src/app/(app)/publishing/actions.ts", import.meta.url),
    "utf8",
  );
  const componentSource = readFileSync(
    new URL("../src/components/agency-control-plane.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actionSource, /retryFailedPosts/);
  assert.match(componentSource, /action=\{retryFailedPublishingAction\}/);
  assert.doesNotMatch(
    componentSource.match(/<form action=\{retryFailedPublishingAction\}>[\s\S]*?<\/form>/)?.[0] ?? "",
    /publishDueAction/,
  );
  const seedRouteSource = readFileSync(
    new URL("../src/app/api/dev/seed/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    seedRouteSource,
    /export\s+(?:async\s+)?function\s+GET/,
    "seed mutation route must not expose GET",
  );
}

void asyncChecks()
  .then(() =>
    console.log(
      "agency-control-plane selftest passed: access, pagination, retry-only, email, profile classification, and isolation",
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
