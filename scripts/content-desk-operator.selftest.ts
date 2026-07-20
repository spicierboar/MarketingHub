import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.CC_ENV = "development";
process.env.CC_LOCAL_DEMO = "true";
process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "true";
process.env.COMMAND_CENTRE_PUBLIC_URL = "https://command-centre.test";
process.env.CONTENT_DESK_INTERNAL_TOKEN =
  "content-desk-test-token-at-least-32-characters";
process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET =
  "content-desk-test-signing-secret-at-least-32-characters";

function signClaims(
  claims: Record<string, unknown>,
  secret = process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function main() {
  const [auth, audit, db, ledger, operator, repository, postRoute] =
    await Promise.all([
      import("../src/lib/content-desk/auth"),
      import("../src/lib/audit"),
      import("../src/lib/db/index"),
      import("../src/lib/content-desk/delegation-ledger"),
      import("../src/lib/content-desk/service"),
      import("../src/lib/managed-content-jobs/repository"),
      import("../src/app/api/managed-content/jobs/route"),
    ]);
  repository.resetManagedContentJobMemoryForTests();
  ledger.resetContentDeskDelegationMemoryForTests();

  const tenant = await db.createTenant({
    name: "Content Desk Test",
    kind: "agency",
    plan: "agency",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const otherTenant = await db.createTenant({
    name: "Isolated Tenant",
    kind: "agency",
    plan: "agency",
    status: "active",
  });
  const suspendedTenant = await db.createTenant({
    name: "Suspended Tenant",
    kind: "agency",
    plan: "agency",
    status: "suspended",
  });
  const operatorUser = await db.createUser({
    email: "desk-operator@example.test",
    name: "Desk Operator",
    role: "user",
  });
  await db.addMembership({
    tenantId: tenant.id,
    userId: operatorUser.id,
    role: "member",
    roleTitle: "content_operator",
    portalOnly: false,
  });
  await db.addMembership({
    tenantId: suspendedTenant.id,
    userId: operatorUser.id,
    role: "member",
    roleTitle: "content_operator",
    portalOnly: false,
  });
  const delegation = auth.signContentDeskDelegation(
    { actorId: operatorUser.id, tenantId: tenant.id, jti: "operator-test" },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_900_000_000 },
  );

  const request = (
    token?: string,
    actorToken: string | null = delegation,
  ) => {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (actorToken) headers.set("x-content-desk-actor", actorToken);
    return { headers };
  };
  const serviceToken = process.env.CONTENT_DESK_INTERNAL_TOKEN!;
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(undefined, null),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(serviceToken, null),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(undefined, delegation),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  assert.equal(
    (await auth.authenticateContentDeskRequest(
      request("wrong-token"),
      process.env,
      1_900_000_010,
    )).ok,
    false,
  );
  const authenticated = await auth.authenticateContentDeskRequest(
    request(serviceToken),
    process.env,
    1_900_000_010,
  );
  assert.equal(authenticated.ok, true);
  assert.equal(
    auth.constantTimeSecretEqual("different-length", "another-secret"),
    false,
  );
  if (!authenticated.ok) throw new Error("authentication fixture failed");
  const actor = authenticated.actor;
  assert.equal(actor.id, operatorUser.id);
  assert.equal(actor.email, operatorUser.email);
  assert.equal(actor.roleTitle, "content_operator");
  const authenticationReplay = await auth.authenticateContentDeskRequest(
    request(serviceToken),
    process.env,
    1_900_000_010,
  );
  assert.equal(authenticationReplay.ok, false);
  if (!authenticationReplay.ok) {
    assert.equal(authenticationReplay.status, 401);
    assert.match(authenticationReplay.error, /already consumed/);
  }
  const expiredDelegation = auth.signContentDeskDelegation(
    { actorId: operatorUser.id, tenantId: tenant.id, jti: "expired-test" },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_899_999_000 },
  );
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(serviceToken, expiredDelegation),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  const futureDelegation = auth.signContentDeskDelegation(
    { actorId: operatorUser.id, tenantId: tenant.id, jti: "future-test" },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_900_000_011 },
  );
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(serviceToken, futureDelegation),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  const malformedLifetime = signClaims({
    iss: "content-desk",
    aud: "command-centre",
    sub: operatorUser.id,
    tenantId: tenant.id,
    iat: 1_900_000_000,
    exp: 1_900_000_061,
    jti: "malformed-lifetime",
  });
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(serviceToken, malformedLifetime),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  const expiredAtBoundary = signClaims({
    iss: "content-desk",
    aud: "command-centre",
    sub: operatorUser.id,
    tenantId: tenant.id,
    iat: 1_899_999_950,
    exp: 1_900_000_010,
    jti: "expired-boundary",
  });
  assert.equal(
    (
      await auth.authenticateContentDeskRequest(
        request(serviceToken, expiredAtBoundary),
        process.env,
        1_900_000_010,
      )
    ).ok,
    false,
  );
  const suspendedDelegation = auth.signContentDeskDelegation(
    {
      actorId: operatorUser.id,
      tenantId: suspendedTenant.id,
      jti: "suspended-tenant",
    },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_900_000_000 },
  );
  const suspendedAuth = await auth.authenticateContentDeskRequest(
    request(serviceToken, suspendedDelegation),
    process.env,
    1_900_000_010,
  );
  assert.equal(suspendedAuth.ok, false);
  if (!suspendedAuth.ok) assert.equal(suspendedAuth.status, 403);
  const missingTenantDelegation = auth.signContentDeskDelegation(
    {
      actorId: operatorUser.id,
      tenantId: "00000000-0000-4000-8000-000000000099",
      jti: "missing-tenant",
    },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_900_000_000 },
  );
  const missingTenantAuth = await auth.authenticateContentDeskRequest(
    request(serviceToken, missingTenantDelegation),
    process.env,
    1_900_000_010,
  );
  assert.equal(missingTenantAuth.ok, false);
  if (!missingTenantAuth.ok) assert.equal(missingTenantAuth.status, 403);
  const viewer = await db.createUser({
    email: "desk-viewer@example.test",
    name: "Desk Viewer",
    role: "user",
  });
  await db.addMembership({
    tenantId: tenant.id,
    userId: viewer.id,
    role: "member",
    roleTitle: "viewer",
    portalOnly: false,
  });
  const viewerDelegation = auth.signContentDeskDelegation(
    { actorId: viewer.id, tenantId: tenant.id, jti: "viewer-test" },
    process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
    { nowSeconds: 1_900_000_000 },
  );
  const viewerAuth = await auth.authenticateContentDeskRequest(
    request(serviceToken, viewerDelegation),
    process.env,
    1_900_000_010,
  );
  assert.equal(viewerAuth.ok, false);
  if (!viewerAuth.ok) assert.equal(viewerAuth.status, 403);

  const company = await db.createCompany({
    tenantId: tenant.id,
    name: "Desk Managed Client",
    createdBy: actor.id,
  });
  await db.grantAccess(actor.id, company.id);
  const unassignedCompany = await db.createCompany({
    tenantId: tenant.id,
    name: "Unassigned Managed Client",
    createdBy: "another-operator",
  });
  const archivedCompany = await db.createCompany({
    tenantId: tenant.id,
    name: "Archived Managed Client",
    createdBy: actor.id,
  });
  await db.grantAccess(actor.id, archivedCompany.id);
  await db.updateCompany(archivedCompany.id, { status: "archived" });
  const isolatedCompany = await db.createCompany({
    tenantId: otherTenant.id,
    name: "Other Tenant Client",
    createdBy: "other",
  });
  await db.updateCompany(company.id, {
    profile: {
      ...company.profile,
      industry: "Hospitality",
      email: "client@example.test",
      serviceAreas: ["Sydney"],
      managedService: {
        serviceLevel: "fully_managed",
        marketingPackageId: "pro",
        serviceOptions: {
          searchVisibility: false,
          websiteConnectionSetup: true,
          websitePublishing: false,
          hostedLandingPage: false,
          monthlyAdCapAud: 1200,
        },
        serviceBilling: {
          status: "active",
          activePackageId: "growth",
          serviceOptions: {
            searchVisibility: false,
            websiteConnectionSetup: true,
            websitePublishing: false,
            hostedLandingPage: false,
            monthlyAdCapAud: 1200,
          },
        },
      },
    },
  });

  const cycle = await db.createManagedStrategyCycle({
    tenantId: tenant.id,
    companyId: company.id,
    quarterStart: "2030-01-01",
    status: "approved",
    confirmedInputs: {
      profileConfirmedAt: "2030-01-01T00:00:00.000Z",
      goals: ["Increase bookings"],
      packageId: "growth",
      locations: ["Sydney"],
      seasonalInputs: ["Summer"],
    },
    guardrails: {
      channels: ["instagram"],
      themes: ["Summer bookings"],
      publishWindows: ["Weekday mornings"],
    },
    approvedAt: "2030-01-02T00:00:00.000Z",
    supersededAt: null,
  });
  const concept = await db.createManagedContentConcept({
    tenantId: tenant.id,
    companyId: company.id,
    strategyCycleId: cycle.id,
    campaignId: null,
    packagePeriod: "2030-01",
    unitKey: "desk-test-concept",
    title: "Summer bookings",
    theme: "Summer bookings",
    status: "planned",
    reusableAssetId: null,
    quotaConsumedAt: "2030-01-03T00:00:00.000Z",
  });
  const adaptation = await db.createManagedChannelAdaptation({
    tenantId: tenant.id,
    companyId: company.id,
    conceptId: concept.id,
    channelKey: "instagram",
    copy: "Book a summer table.",
    status: "ready",
  });
  await db.createManagedPlannedSlot({
    tenantId: tenant.id,
    companyId: company.id,
    conceptId: concept.id,
    adaptationId: adaptation.id,
    plannedPublishAt: "2030-01-20T10:00:00.000Z",
    status: "planned",
    scheduledPostId: null,
  });
  const asset = await db.createAsset({
    companyId: company.id,
    name: "Approved summer visual",
    assetType: "image",
    source: "upload",
    tags: ["summer"],
    usageRights: {
      owner: company.name,
      licenceType: "owned",
      consentObtained: true,
      allowedChannels: ["instagram"],
    },
    status: "approved",
    createdById: actor.id,
    approvedById: actor.id,
    approvedAt: "2030-01-03T00:00:00.000Z",
    rightsConfirmedAt: "2030-01-03T00:00:00.000Z",
    rightsConfirmationEmail: actor.email,
  });
  await db.updateManagedContentConcept(concept.id, {
    reusableAssetId: asset.id,
  });

  await assert.rejects(
    operator.getClientWorkspace(actor, isolatedCompany.id),
    (error: unknown) =>
      error instanceof operator.ContentDeskOperatorError &&
      error.status === 404,
  );
  await assert.rejects(
    operator.getClientWorkspace(actor, unassignedCompany.id),
    (error: unknown) =>
      error instanceof operator.ContentDeskOperatorError &&
      error.status === 404,
  );
  const archivedNotFound = (error: unknown) =>
    error instanceof operator.ContentDeskOperatorError &&
    error.status === 404;
  await assert.rejects(
    operator.getClientWorkspace(actor, archivedCompany.id),
    archivedNotFound,
  );
  await assert.rejects(
    operator.updateClientStrategy(actor, archivedCompany.id, {
      channels: ["instagram"],
      themes: ["Archived theme"],
      publishWindows: ["Weekday mornings"],
    }),
    archivedNotFound,
  );
  await assert.rejects(
    operator.updateClientMode(actor, archivedCompany.id, "staff_directed"),
    archivedNotFound,
  );
  await assert.rejects(
    operator.regenerateClientConcept(
      actor,
      archivedCompany.id,
      "archived-concept",
    ),
    archivedNotFound,
  );
  const currentNow = Math.floor(Date.now() / 1_000);
  const archivedPostResponse = await postRoute.POST(
    new NextRequest("https://command-centre.test/api/managed-content/jobs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        "x-content-desk-actor": auth.signContentDeskDelegation(
          {
            actorId: actor.id,
            tenantId: tenant.id,
            jti: "archived-post",
          },
          process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!,
          { nowSeconds: currentNow },
        ),
      },
      body: JSON.stringify({
        companyId: archivedCompany.id,
        requestId: "archived-request",
        conceptId: "archived-concept",
        plannedSlotId: "archived-slot",
        assetIds: [],
        brief: "This request must not reach managed-content submission.",
      }),
    }),
  );
  assert.equal(archivedPostResponse.status, 404);

  const overview = await operator.getOperationsOverview(
    actor,
    new Date("2030-01-05T00:00:00.000Z"),
  );
  assert.equal(overview.totalClients, 1);
  assert.equal(overview.metrics.length, 10);
  assert(overview.metrics.every((metric) => Number.isInteger(metric.count)));
  assert.equal(overview.clients[0]?.id, company.id);

  const workspace = await operator.getClientWorkspace(
    actor,
    company.id,
    new Date("2030-01-05T00:00:00.000Z"),
  );
  assert.equal(workspace.companyId, company.id);
  assert.equal(workspace.schedule[0]?.explicit, true);
  assert.equal(workspace.concepts[0]?.adaptations[0]?.channel, "instagram");
  assert.equal(workspace.concepts[0]?.visualState, "ready");
  assert.equal(workspace.plan.monthlyAdCapAud, 1200);

  await operator.updateClientStrategy(actor, company.id, {
    channels: ["instagram"],
    themes: ["Summer bookings", "Private events"],
    publishWindows: ["Weekday mornings"],
  });
  await operator.updateClientMode(actor, company.id, "staff_directed");
  const afterMutation = await operator.getClientWorkspace(actor, company.id);
  assert.equal(afterMutation.strategy?.mode, "staff_directed");
  assert.deepEqual(afterMutation.strategy?.guardrails.themes, [
    "Summer bookings",
    "Private events",
  ]);

  const slotIdsBefore = (
    await db.listManagedPlannedSlots(tenant.id, company.id)
  ).map((item) => item.id);
  for (const status of ["pending_payment", "paused"] as const) {
    const current = await db.getCompany(company.id);
    assert(current?.profile.managedService?.serviceBilling);
    await db.updateCompany(company.id, {
      profile: {
        ...current.profile,
        managedService: {
          ...current.profile.managedService,
          serviceBilling: {
            ...current.profile.managedService.serviceBilling,
            status,
          },
        },
      },
    });
    await assert.rejects(
      operator.regenerateClientConcept(actor, company.id, concept.id),
      (error: unknown) =>
        error instanceof operator.ContentDeskOperatorError &&
        error.status === 409 &&
        /payment is unresolved/.test(error.message),
    );
  }
  const billingCleared = await db.getCompany(company.id);
  assert(billingCleared?.profile.managedService?.serviceBilling);
  await db.updateCompany(company.id, {
    profile: {
      ...billingCleared.profile,
      managedService: {
        ...billingCleared.profile.managedService,
        serviceBilling: {
          ...billingCleared.profile.managedService.serviceBilling,
          status: "active",
        },
      },
    },
  });
  const first = await operator.regenerateClientConcept(
    actor,
    company.id,
    concept.id,
  );
  const replay = await operator.regenerateClientConcept(
    actor,
    company.id,
    concept.id,
  );
  assert.equal(first.idempotentReplay, false);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(first.jobId, replay.jobId);
  assert.deepEqual(
    (await db.listManagedPlannedSlots(tenant.id, company.id)).map(
      (item) => item.id,
    ),
    slotIdsBefore,
  );
  await repository.updateManagedJob(first.jobId, {
    status: "paused",
    nextPollAt: null,
    lastError: "Billing pause cleared before operator retry.",
  });
  const resumed = await operator.regenerateClientConcept(
    actor,
    company.id,
    concept.id,
  );
  assert.equal(resumed.idempotentReplay, false);
  assert.notEqual(resumed.jobId, first.jobId);
  for (let index = 0; index < 12; index += 1) {
    await db.createManagedContentConcept({
      tenantId: tenant.id,
      companyId: company.id,
      strategyCycleId: cycle.id,
      campaignId: null,
      packagePeriod: concept.packagePeriod,
      unitKey: `quota-exhaustion-${index}`,
      title: `Quota concept ${index}`,
      theme: concept.theme,
      status: "planned",
      reusableAssetId: null,
      quotaConsumedAt: "2030-01-03T00:00:00.000Z",
    });
  }
  await assert.rejects(
    operator.regenerateClientConcept(actor, company.id, concept.id),
    (error: unknown) =>
      error instanceof operator.ContentDeskOperatorError &&
      error.status === 409 &&
      /quota is unavailable/.test(error.message),
  );

  const events = await audit.listAudit(tenant.id, [company.id]);
  assert(
    events.some(
      (event) => event.action === "content_desk.strategy_guardrails_updated",
    ),
  );
  assert(
    events.some(
      (event) => event.action === "content_desk.service_mode_updated",
    ),
  );
  assert(
    events.some(
      (event) => event.action === "content_desk.concept_regeneration_submitted",
    ),
  );
  assert(
    events.some(
      (event) =>
        event.action === "managed_content.job_submitted" &&
        event.actorId === actor.id &&
        event.actorEmail === actor.email,
    ),
  );
  assert(
    events
      .filter((event) => event.action.startsWith("content_desk."))
      .every((event) => event.actorId === actor.id),
  );
  const operatorWorkspace = await operator.getClientWorkspace(
    actor,
    company.id,
  );
  assert(operatorWorkspace.jobs[0]?.provenance);
  const clientSafeJson = JSON.stringify(operatorWorkspace, (key, value) =>
    key === "provenance" ? undefined : value,
  );
  assert(!/openai|anthropic|gemini|groq|provider|model/i.test(clientSafeJson));

  console.log("Content Desk operator self-test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
