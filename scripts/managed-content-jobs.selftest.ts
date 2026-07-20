import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const callbackSecret = "managed-content-self-test-secret";
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.CC_ENV = "development";
process.env.CC_LOCAL_DEMO = "true";
process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "true";
process.env.COMMAND_CENTRE_PUBLIC_URL = "https://command-centre.test";
process.env.CONTENT_ENGINE_CALLBACK_TARGET = "command-centre";
process.env.MANAGED_CONTENT_CALLBACK_SECRET = callbackSecret;
process.env.MANAGED_CONTENT_CALLBACK_REPLAY_WINDOW_SECONDS = "300";
process.env.CONTENT_ENGINE_BASE_URL = "https://content-engine.test";
process.env.CONTENT_ENGINE_API_KEY = "self-test-api-key";
process.env.MANAGED_CONTENT_POLL_BASE_MS = "1";
process.env.MANAGED_CONTENT_POLL_MAX_MS = "2";
process.env.MANAGED_CONTENT_POLL_MAX_ATTEMPTS = "2";

async function main() {
  const [db, service, repository, workflow, email, schemas] = await Promise.all(
    [
      import("../src/lib/db/index"),
      import("../src/lib/managed-content-jobs/service"),
      import("../src/lib/managed-content-jobs/repository"),
      import("../src/lib/managed-service/workflow"),
      import("../src/lib/email"),
      import("../src/lib/managed-content-jobs/schemas"),
    ],
  );

  repository.resetManagedContentJobMemoryForTests();
  const tenant = await db.createTenant({
    name: "Managed Content Test",
    kind: "agency",
    plan: "agency",
    status: "active",
  });
  const company = await db.createCompany({
    tenantId: tenant.id,
    name: "Managed Company",
    createdBy: "system:selftest",
  });
  const archivedCompany = await db.createCompany({
    tenantId: tenant.id,
    name: "Archived Managed Company",
    createdBy: "system:selftest",
  });
  await db.updateCompany(archivedCompany.id, { status: "archived" });
  const strategy = await db.createManagedStrategyCycle({
    tenantId: tenant.id,
    companyId: company.id,
    quarterStart: "2030-01-01",
    status: "approved",
    confirmedInputs: {
      profileConfirmedAt: "2029-12-01T00:00:00.000Z",
      goals: ["awareness"],
      packageId: "growth",
      locations: ["Sydney"],
      seasonalInputs: ["winter"],
    },
    guardrails: {
      channels: ["linkedin", "email"],
      themes: ["Winter launch"],
      publishWindows: ["2030-01"],
    },
    approvedAt: "2029-12-15T00:00:00.000Z",
    supersededAt: null,
  });

  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  const creativeToken = "creative-token";
  const budgetToken = "budget-token";
  const approvalBase = {
    tenantId: tenant.id,
    companyId: company.id,
    contentId: null,
    conceptId: null,
    plannedSlotId: null,
    adCampaignId: "ad-token-test",
    recipientEmail: "client@example.test",
    status: "pending",
    dueAt,
    revisionRound: 0,
    supersededById: null,
    reminder7dAt: null,
    reminder3dAt: null,
    staffEscalationAt: null,
    reminder7dKey: null,
    reminder3dKey: null,
    staffEscalationKey: null,
    respondedAt: null,
    directChargeDisclosureAcceptedAt: null,
  } as const;
  const creativeApproval = await db.createManagedApprovalRequest({
    ...approvalBase,
    scope: "paid_creative",
    tokenHash: workflow.hashApprovalToken(creativeToken),
  });
  const budgetApproval = await db.createManagedApprovalRequest({
    ...approvalBase,
    scope: "paid_budget_targeting",
    tokenHash: workflow.hashApprovalToken(budgetToken),
  });
  const paidAuthorization = await db.createManagedPaidAuthorization({
    tenantId: tenant.id,
    companyId: company.id,
    adCampaignId: "ad-token-test",
    monthKey: new Date().toISOString().slice(0, 7),
    requestedBudgetAud: 500,
    clientMonthlyCapAud: 1_000,
    creativeApprovalId: creativeApproval.id,
    budgetTargetingApprovalId: budgetApproval.id,
    disclosureAcceptedAt: null,
    status: "pending",
  });
  assert.equal(
    await db.respondManagedApprovalWithToken(
      workflow.hashApprovalToken(creativeToken),
      company.id,
      "approved",
    ),
    true,
  );
  assert.equal(
    await db.respondManagedApprovalWithToken(
      workflow.hashApprovalToken(budgetToken),
      company.id,
      "approved",
      {},
      true,
    ),
    true,
  );
  assert.equal(
    (await db.listManagedPaidAuthorizations(tenant.id, company.id)).find(
      (item) => item.id === paidAuthorization.id,
    )?.status,
    "approved",
  );
  assert.deepEqual(email.resendIdempotencyOptions("approval:test:client_7d"), {
    idempotencyKey: "approval:test:client_7d",
  });
  assert.equal(
    schemas.StaffManagedContentJobRequestSchema.safeParse({
      tenantId: tenant.id,
      role: "admin",
      channels: ["linkedin"],
      strategyContext: { forged: true },
      plannedPublishAt: "2030-01-20T10:00:00.000Z",
      companyId: company.id,
      requestId: "caller-truth",
      conceptId: "concept",
      plannedSlotId: "slot",
      brief: "brief",
    }).success,
    false,
  );

  const baseInput = {
    tenantId: tenant.id,
    companyId: company.id,
    requestId: "request-stable-1",
    conceptId: "concept-stable-1",
    strategyCycleId: strategy.id,
    packagePeriod: "2030-01",
    theme: "Winter launch",
    brief: "Introduce the winter service package.",
    strategyContext: { objective: "awareness" },
    channels: ["linkedin", "email"] as ("linkedin" | "email")[],
    assetReferences: [],
    plannedPublishAt: "2030-01-20T10:00:00.000Z",
  };
  await assert.rejects(
    service.submitManagedContentJob({
      ...baseInput,
      companyId: archivedCompany.id,
      requestId: "archived-authoritative-lookup",
    }),
    (error: unknown) =>
      error instanceof service.ManagedContentContractError &&
      error.status === 404,
  );

  function clearRuntimeMarkers() {
    for (const name of [
      "CC_ENV",
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_URL",
      "APP_ORIGIN",
      "CC_LOCAL_DEMO",
      "NEXT_PUBLIC_CC_LOCAL_DEMO",
      "CONTENT_ENGINE_MANAGED_JOBS_LIVE",
    ]) {
      delete process.env[name];
    }
  }

  function allowedProductionRuntime() {
    clearRuntimeMarkers();
    process.env.CC_ENV = "production";
    process.env.APP_ORIGIN = "https://command-centre.test";
    process.env.CONTENT_ENGINE_MANAGED_JOBS_LIVE = "true";
  }

  const blockedRuntimes = [
    {
      label: "key-only",
      forceLive: false,
      configure() {
        allowedProductionRuntime();
        delete process.env.CONTENT_ENGINE_MANAGED_JOBS_LIVE;
      },
    },
    {
      label: "preview",
      forceLive: true,
      configure() {
        allowedProductionRuntime();
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "preview";
      },
    },
    {
      label: "false-vercel",
      forceLive: true,
      configure() {
        allowedProductionRuntime();
        process.env.VERCEL = "0";
        delete process.env.VERCEL_ENV;
      },
    },
    {
      label: "local",
      forceLive: true,
      configure() {
        clearRuntimeMarkers();
        process.env.CC_ENV = "development";
        process.env.APP_ORIGIN = "http://localhost:3000";
        process.env.CONTENT_ENGINE_MANAGED_JOBS_LIVE = "true";
      },
    },
    {
      label: "conflicting-markers",
      forceLive: true,
      configure() {
        allowedProductionRuntime();
        process.env.VERCEL = "1";
        process.env.VERCEL_ENV = "production";
        process.env.CC_ENV = "development";
      },
    },
  ] as const;
  let blockedFetches = 0;
  const blockedFetcher: typeof fetch = async () => {
    blockedFetches += 1;
    throw new Error("blocked Content Engine fetch must not run");
  };
  for (const runtime of blockedRuntimes) {
    runtime.configure();
    assert.equal(
      service.managedContentJobsLive(),
      false,
      `${runtime.label}: effective managed-content readiness`,
    );
    const result = await service.submitManagedContentJob(
      {
        ...baseInput,
        requestId: `request-gate-${runtime.label}`,
        conceptId: `concept-gate-${runtime.label}`,
      },
      {
        ...(runtime.forceLive ? { live: true } : {}),
        fetcher: blockedFetcher,
      },
    );
    assert.equal("simulated" in result && result.simulated, true);
    assert.equal(blockedFetches, 0, `${runtime.label}: submission fetch count`);
  }

  allowedProductionRuntime();
  assert.equal(service.managedContentJobsLive(), true);
  let liveRequestPayload: Record<string, unknown> | undefined;
  const acceptanceFetch: typeof fetch = async (_input, init) => {
    liveRequestPayload = JSON.parse(String(init?.body)) as Record<
      string,
      unknown
    >;
    return Response.json(
      {
        schemaVersion: "1.0",
        jobId: "mcj_external_1",
        status: "accepted",
        statusUrl:
          "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_1",
        idempotentReplay: false,
      },
      { status: 202 },
    );
  };

  const first = await service.submitManagedContentJob(baseInput, {
    live: true,
    fetcher: acceptanceFetch,
  });
  assert.equal(first.job.externalJobId, "mcj_external_1");
  assert(liveRequestPayload);
  assert.equal(liveRequestPayload.callbackTarget, "command-centre");
  assert.equal("callbackUrl" in liveRequestPayload, false);
  const engineSchemaUrl = new URL(
    "../../content-engine/src/managed-content/schemas.ts",
    import.meta.url,
  ).href;
  const engineContract = (await import(engineSchemaUrl)) as {
    SubmitManagedContentJobSchema: {
      safeParse(value: unknown): { success: boolean };
    };
  };
  assert.equal(
    engineContract.SubmitManagedContentJobSchema.safeParse(liveRequestPayload)
      .success,
    true,
  );
  await repository.updateManagedJob(first.job.id, {
    nextPollAt: new Date(Date.now() - 1_000).toISOString(),
  });
  for (const runtime of blockedRuntimes) {
    runtime.configure();
    const blockedPoll = await service.pollDueManagedContentJobs(tenant.id, {
      fetcher: blockedFetcher,
    });
    assert.equal(blockedPoll.processed, 0);
    assert.equal(blockedFetches, 0, `${runtime.label}: polling fetch count`);
  }
  allowedProductionRuntime();
  await repository.updateManagedJob(first.job.id, { nextPollAt: null });
  const replay = await service.submitManagedContentJob(baseInput, {
    live: true,
    fetcher: acceptanceFetch,
  });
  assert.equal(replay.idempotentReplay, true);
  process.env.CONTENT_ENGINE_CALLBACK_URL =
    "https://command-centre.test/api/content-engine/events";
  await assert.rejects(
    service.submitManagedContentJob(
      {
        ...baseInput,
        requestId: "request-invalid-callback-config",
        conceptId: "concept-invalid-callback-config",
      },
      { live: true, fetcher: acceptanceFetch },
    ),
    (error: unknown) =>
      error instanceof service.ManagedContentContractError &&
      error.status === 503,
  );
  delete process.env.CONTENT_ENGINE_CALLBACK_URL;
  await assert.rejects(
    service.submitManagedContentJob(
      { ...baseInput, brief: "Changed immutable brief" },
      { live: true, fetcher: acceptanceFetch },
    ),
    (error: unknown) =>
      error instanceof service.ManagedContentContractError &&
      error.status === 409,
  );

  const nowMs = Date.now();
  const timestamp = Math.floor(nowMs / 1_000).toString();
  const parityBody = '{"ok":true}';
  const expected = `v1=${createHmac("sha256", callbackSecret)
    .update(`${timestamp}.evt_parity.${parityBody}`)
    .digest("hex")}`;
  assert.equal(
    service.signManagedContentEvent(
      callbackSecret,
      timestamp,
      "evt_parity",
      parityBody,
    ),
    expected,
  );
  assert.equal(
    service.verifyManagedContentEventSignature({
      secret: callbackSecret,
      timestamp: (Math.floor(nowMs / 1_000) - 301).toString(),
      eventId: "evt_parity",
      rawBody: parityBody,
      signature: service.signManagedContentEvent(
        callbackSecret,
        (Math.floor(nowMs / 1_000) - 301).toString(),
        "evt_parity",
        parityBody,
      ),
      nowMs,
    }),
    false,
  );

  function jobData(args: {
    jobId: string;
    requestId: string;
    status:
      | "accepted"
      | "queued"
      | "processing"
      | "ready"
      | "paused"
      | "failed";
  }) {
    const stamp = new Date().toISOString();
    let terminalPayload: Record<string, unknown> = {};
    if (args.status === "ready") {
      terminalPayload = {
        result: {
          schemaVersion: "1.0",
          primaryConcept: {
            title: "A warmer winter",
            narrative: "A service-led seasonal concept.",
          },
          channelAdaptations: [
            { channel: "linkedin", content: "LinkedIn winter copy" },
            { channel: "email", content: "Email winter copy" },
          ],
          visualMetadata: [],
          plannedPublishAt: "2030-01-20T10:00:00.000Z",
        },
      };
    } else if (args.status === "paused" || args.status === "failed") {
      const paused = args.status === "paused";
      terminalPayload = {
        error: {
          code: paused ? "request_paused" : "generation_failed",
          message: paused
            ? "Managed service paused until billing clears."
            : "Generation could not be completed.",
        },
      };
    }
    return {
      schemaVersion: "1.0",
      jobId: args.jobId,
      organisationId: tenant.id,
      companyId: company.id,
      commandCentreRequestId: args.requestId,
      status: args.status,
      attempts: 1,
      timestamps: {
        acceptedAt: stamp,
        updatedAt: stamp,
        startedAt: stamp,
        completedAt: stamp,
      },
      plannedPublishAt: "2030-01-20T10:00:00.000Z",
      statusHistory: [{ status: args.status, at: stamp, attempt: 1 }],
      callbackDeliveries: [],
      ...terminalPayload,
    };
  }

  async function deliver(event: Record<string, unknown>, atMs = Date.now()) {
    const rawBody = JSON.stringify(event);
    const eventId = String(event.eventId);
    const eventTimestamp = Math.floor(atMs / 1_000).toString();
    return service.receiveManagedContentEvent({
      rawBody,
      eventId,
      timestamp: eventTimestamp,
      signature: service.signManagedContentEvent(
        callbackSecret,
        eventTimestamp,
        eventId,
        rawBody,
      ),
      nowMs: atMs,
    });
  }

  const readyEvent = {
    schemaVersion: "1.0",
    eventId: "evt_ready_1",
    type: "content.ready",
    occurredAt: new Date().toISOString(),
    data: jobData({
      jobId: "mcj_external_1",
      requestId: baseInput.requestId,
      status: "ready",
    }),
  };
  assert.equal(await deliver(readyEvent), "processed");
  assert.equal(await deliver(readyEvent), "duplicate");
  const concepts = await db.listManagedContentConcepts(tenant.id, company.id);
  assert.equal(
    concepts.filter(
      (concept) => concept.unitKey === "content-engine:concept-stable-1",
    ).length,
    1,
  );
  const importedContent = (await db.listContent(tenant.id)).filter(
    (item) => item.managedConceptId === concepts[0]?.id,
  );
  assert.deepEqual(
    importedContent
      .map((item) => item.managedChannelKey)
      .filter((channel) => channel != null)
      .sort(),
    ["email", "linkedin"],
  );
  assert.equal(
    importedContent.find((item) => item.managedChannelKey == null)?.body,
    "A service-led seasonal concept.",
  );
  assert(
    !/provider|model|openai|groq|gemini/i.test(JSON.stringify(importedContent)),
  );
  const readyJob = await repository.getManagedJobByExternalId("mcj_external_1");
  assert(readyJob?.privateProvenance);

  const mismatch = {
    ...readyEvent,
    eventId: "evt_tenant_mismatch",
    data: { ...readyEvent.data, organisationId: "another-tenant" },
  };
  await assert.rejects(
    deliver(mismatch),
    (error: unknown) =>
      error instanceof service.ManagedContentContractError &&
      error.status === 403,
  );

  const secondInput = {
    ...baseInput,
    requestId: "request-stable-2",
    conceptId: "concept-stable-2",
  };
  const secondFetch: typeof fetch = async () =>
    Response.json(
      {
        schemaVersion: "1.0",
        jobId: "mcj_external_2",
        status: "accepted",
        statusUrl:
          "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_2",
        idempotentReplay: false,
      },
      { status: 202 },
    );
  await service.submitManagedContentJob(secondInput, {
    live: true,
    fetcher: secondFetch,
  });
  await deliver({
    schemaVersion: "1.0",
    eventId: "evt_failed_2",
    type: "content.failed",
    occurredAt: new Date().toISOString(),
    data: jobData({
      jobId: "mcj_external_2",
      requestId: secondInput.requestId,
      status: "failed",
    }),
  });
  const failedJob =
    await repository.getManagedJobByExternalId("mcj_external_2");
  assert(failedJob);
  assert.equal(
    (await repository.listManagedJobExceptions(failedJob.id))[0]?.kind,
    "content_generation_failed",
  );

  const pausedInput = {
    ...baseInput,
    requestId: "request-stable-paused",
    conceptId: "concept-stable-paused",
  };
  await service.submitManagedContentJob(pausedInput, {
    live: true,
    fetcher: async () =>
      Response.json(
        {
          schemaVersion: "1.0",
          jobId: "mcj_external_paused",
          status: "accepted",
          statusUrl:
            "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_paused",
          idempotentReplay: false,
        },
        { status: 202 },
      ),
  });
  await deliver({
    schemaVersion: "1.0",
    eventId: "evt_paused",
    type: "content.failed",
    occurredAt: new Date().toISOString(),
    data: jobData({
      jobId: "mcj_external_paused",
      requestId: pausedInput.requestId,
      status: "paused",
    }),
  });
  const pausedJob = await repository.getManagedJobByExternalId(
    "mcj_external_paused",
  );
  assert(pausedJob);
  assert.equal(pausedJob.status, "paused");
  assert.equal(pausedJob.nextPollAt, null);
  assert.equal(
    (await repository.listManagedJobExceptions(pausedJob.id))[0]?.kind,
    "managed_service_paused",
  );
  assert.match(pausedJob.lastError ?? "", /billing clears/);

  const thirdInput = {
    ...baseInput,
    requestId: "request-stable-3",
    conceptId: "concept-stable-3",
  };
  const thirdFetch: typeof fetch = async () =>
    Response.json(
      {
        schemaVersion: "1.0",
        jobId: "mcj_external_3",
        status: "accepted",
        statusUrl:
          "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_3",
        idempotentReplay: false,
      },
      { status: 202 },
    );
  await service.submitManagedContentJob(thirdInput, {
    live: true,
    fetcher: thirdFetch,
  });
  const pollingJob =
    await repository.getManagedJobByExternalId("mcj_external_3");
  assert(pollingJob);
  await repository.updateManagedJob(pollingJob.id, {
    nextPollAt: new Date(Date.now() - 1_000).toISOString(),
  });
  process.env.CONTENT_ENGINE_MANAGED_JOBS_LIVE = "true";
  const pollingFetch: typeof fetch = async () =>
    Response.json(
      jobData({
        jobId: "mcj_external_3",
        requestId: thirdInput.requestId,
        status: "ready",
      }),
    );
  const polling = await service.pollDueManagedContentJobs(tenant.id, {
    fetcher: pollingFetch,
  });
  assert.equal(polling.recovered, 1);
  assert.equal(
    (await repository.getManagedJobByExternalId("mcj_external_3"))?.status,
    "ready",
  );

  const exhaustingInput = {
    ...baseInput,
    requestId: "request-poll-exhaustion",
    conceptId: "concept-poll-exhaustion",
  };
  await service.submitManagedContentJob(exhaustingInput, {
    live: true,
    fetcher: async () =>
      Response.json(
        {
          schemaVersion: "1.0",
          jobId: "mcj_external_exhausting",
          status: "accepted",
          statusUrl:
            "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_exhausting",
          idempotentReplay: false,
        },
        { status: 202 },
      ),
  });
  const exhaustingJob = await repository.getManagedJobByExternalId(
    "mcj_external_exhausting",
  );
  assert(exhaustingJob);
  await repository.updateManagedJob(exhaustingJob.id, {
    pollAttempts: 1,
    nextPollAt: new Date(Date.now() - 1_000).toISOString(),
  });
  const exhaustedPolling = await service.pollDueManagedContentJobs(tenant.id, {
    fetcher: async () =>
      Response.json(
        jobData({
          jobId: "mcj_external_exhausting",
          requestId: exhaustingInput.requestId,
          status: "processing",
        }),
      ),
  });
  assert.equal(exhaustedPolling.exhausted, 1);
  const exhaustedJob = await repository.getManagedJobByExternalId(
    "mcj_external_exhausting",
  );
  assert.equal(exhaustedJob?.status, "poll_exhausted");
  assert.equal(exhaustedJob?.nextPollAt, null);

  const deadlineInput = {
    ...baseInput,
    requestId: "request-poll-deadline",
    conceptId: "concept-poll-deadline",
  };
  await service.submitManagedContentJob(deadlineInput, {
    live: true,
    fetcher: async () =>
      Response.json(
        {
          schemaVersion: "1.0",
          jobId: "mcj_external_deadline",
          status: "accepted",
          statusUrl:
            "https://content-engine.test/v1/orgs/test/content-jobs/mcj_external_deadline",
          idempotentReplay: false,
        },
        { status: 202 },
      ),
  });
  const deadlineJob = await repository.getManagedJobByExternalId(
    "mcj_external_deadline",
  );
  assert(deadlineJob);
  await repository.updateManagedJob(deadlineJob.id, {
    nextPollAt: new Date(Date.now() - 1_000).toISOString(),
  });
  let deadlineFetches = 0;
  const deadlineStartedAt = Date.now();
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => deadlineController.abort(), 25);
  const deadlinePolling = await service.pollDueManagedContentJobs(tenant.id, {
    deadlineMs: deadlineStartedAt + 500,
    signal: deadlineController.signal,
    maxJobs: 1,
    fetcher: async (_input, init) => {
      deadlineFetches += 1;
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          "abort",
          () => reject(signal.reason),
          { once: true },
        );
      });
    },
  });
  clearTimeout(deadlineTimer);
  assert.equal(deadlineFetches, 1);
  assert.equal(deadlinePolling.processed, 0);
  assert.equal(deadlinePolling.deadlineExceeded, true);
  assert.equal(deadlinePolling.deferred, 1);
  assert(Date.now() - deadlineStartedAt < 500);
  assert.equal(
    (await repository.getManagedJobByExternalId("mcj_external_deadline"))
      ?.pollAttempts,
    0,
  );
  for (let cancellation = 0; cancellation < 2; cancellation += 1) {
    await repository.updateManagedJob(deadlineJob.id, {
      nextPollAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25);
    const cancelled = await service.pollDueManagedContentJobs(tenant.id, {
      deadlineMs: started + 500,
      signal: controller.signal,
      maxJobs: 1,
      fetcher: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true },
          );
        }),
    });
    clearTimeout(timer);
    assert.equal(cancelled.deadlineExceeded, true);
  }
  const repeatedlyCancelled =
    await repository.getManagedJobByExternalId("mcj_external_deadline");
  assert.equal(repeatedlyCancelled?.pollAttempts, 0);
  assert.notEqual(repeatedlyCancelled?.status, "poll_exhausted");

  const leaseBase = {
    eventId: "evt_lease_reclaim",
    jobId: pollingJob.id,
    tenantId: tenant.id,
    companyId: company.id,
    eventType: "content.ready",
    payloadDigest: "digest-lease",
  };
  const leaseNow = "2030-01-01T00:00:00.000Z";
  assert.equal(
    await repository.claimManagedEvent({
      ...leaseBase,
      leaseOwner: "worker-1",
      nowIso: leaseNow,
      leaseSeconds: 5,
    }),
    "claimed",
  );
  assert.equal(
    await repository.claimManagedEvent({
      ...leaseBase,
      leaseOwner: "worker-2",
      nowIso: "2030-01-01T00:00:04.000Z",
      leaseSeconds: 5,
    }),
    "duplicate",
  );
  assert.equal(
    await repository.claimManagedEvent({
      ...leaseBase,
      leaseOwner: "worker-2",
      nowIso: "2030-01-01T00:00:06.000Z",
      leaseSeconds: 5,
    }),
    "claimed",
  );
  await assert.rejects(
    repository.completeManagedEvent(leaseBase.eventId, "worker-1"),
    /lease ownership was lost/,
  );
  await repository.completeManagedEvent(leaseBase.eventId, "worker-2");
  assert.equal(
    await repository.claimManagedEvent({
      ...leaseBase,
      leaseOwner: "worker-3",
      nowIso: "2030-01-01T00:00:12.000Z",
    }),
    "duplicate",
  );

  const retryBase = { ...leaseBase, eventId: "evt_failed_retry" };
  assert.equal(
    await repository.claimManagedEvent({
      ...retryBase,
      leaseOwner: "worker-1",
      nowIso: leaseNow,
    }),
    "claimed",
  );
  await repository.completeManagedEvent(
    retryBase.eventId,
    "worker-1",
    "simulated failure",
  );
  assert.equal(
    await repository.claimManagedEvent({
      ...retryBase,
      leaseOwner: "worker-2",
      nowIso: "2030-01-01T00:00:01.000Z",
    }),
    "claimed",
  );

  const migration47 = await readFile(
    "supabase/legacy-migrations/0047_managed_service_commercial_billing.sql",
    "utf8",
  );
  const migration48 = await readFile(
    "supabase/legacy-migrations/0048_managed_service_workflow.sql",
    "utf8",
  );
  const migration49 = await readFile(
    "supabase/legacy-migrations/0049_managed_content_jobs.sql",
    "utf8",
  );
  const migration50 = await readFile(
    "supabase/legacy-migrations/pending/0050_content_desk_delegation_replay_ledger.sql",
    "utf8",
  );
  const managedJobsRoute = await readFile(
    "src/app/api/managed-content/jobs/route.ts",
    "utf8",
  );
  assert.match(migration47, /serviceBilling/);
  assert.match(
    migration48,
    /managed_strategy_cycles_id_tenant_company_unique_idx/,
  );
  assert.match(
    migration48,
    /managed_content_concepts_id_tenant_company_unique_idx/,
  );
  assert.match(migration49, /managed_content_jobs_strategy_tenant_company_fk/);
  assert.match(
    migration49,
    /managed_content_jobs_imported_concept_tenant_company_fk/,
  );
  assert.match(migration50, /content_desk_delegation_uses/);
  assert.match(migration50, /consume_content_desk_delegation/);
  assert.match(migration50, /on conflict \(issuer, jti\) do nothing/);
  assert.match(migration50, /enable row level security/);
  assert.match(managedJobsRoute, /authenticateContentDeskRequest/);
  assert.match(managedJobsRoute, /isContentDeskOperator/);
  assert.match(managedJobsRoute, /canAccessCompany/);
  assert.match(managedJobsRoute, /submitManagedContentJobForStaff/);
  assert.doesNotMatch(managedJobsRoute, /getCurrentUser/);

  console.log("managed-content Command Centre self-test: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
