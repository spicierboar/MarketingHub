import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import type { ManagedJobStatus } from "../src/lib/managed-content-jobs/repository";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.CC_ENV = "development";
process.env.CC_LOCAL_DEMO = "true";
process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "true";
process.env.CONTENT_DESK_INTERNAL_TOKEN =
  "content-desk-status-token-at-least-32-characters";
process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET =
  "content-desk-status-signing-secret-at-least-32-characters";

async function main() {
  const [auth, db, ledger, repository, route] = await Promise.all([
    import("../src/lib/content-desk/auth"),
    import("../src/lib/db/index"),
    import("../src/lib/content-desk/delegation-ledger"),
    import("../src/lib/managed-content-jobs/repository"),
    import("../src/app/api/managed-content/jobs/[jobId]/route"),
  ]);
  ledger.resetContentDeskDelegationMemoryForTests();
  repository.resetManagedContentJobMemoryForTests();

  const tenant = await db.createTenant({
    name: "Managed Status Test",
    kind: "agency",
    plan: "agency",
    status: "active",
  });
  const otherTenant = await db.createTenant({
    name: "Other Managed Status Test",
    kind: "agency",
    plan: "agency",
    status: "active",
  });
  const actor = await db.createUser({
    email: "status-operator@example.test",
    name: "Status Operator",
    role: "user",
  });
  await db.addMembership({
    tenantId: tenant.id,
    userId: actor.id,
    role: "member",
    roleTitle: "content_operator",
    portalOnly: false,
  });
  const company = await db.createCompany({
    tenantId: tenant.id,
    name: "Accessible Status Company",
    createdBy: actor.id,
  });
  await db.grantAccess(actor.id, company.id);
  const unassignedCompany = await db.createCompany({
    tenantId: tenant.id,
    name: "Unassigned Status Company",
    createdBy: "another-user",
  });
  const archivedCompany = await db.createCompany({
    tenantId: tenant.id,
    name: "Archived Status Company",
    createdBy: actor.id,
  });
  await db.grantAccess(actor.id, archivedCompany.id);
  await db.updateCompany(archivedCompany.id, { status: "archived" });
  const otherCompany = await db.createCompany({
    tenantId: otherTenant.id,
    name: "Other Tenant Status Company",
    createdBy: "other-user",
  });

  async function createJob(
    id: string,
    tenantId: string,
    companyId: string,
    status: ManagedJobStatus,
    lastError: string | null = null,
  ) {
    return repository.createManagedJob({
      id,
      tenantId,
      companyId,
      requestId: `request-${id}`,
      conceptId: `concept-${id}`,
      strategyCycleId: null,
      idempotencyKey: `idempotency-${id}`,
      requestFingerprint: `fingerprint-${id}`,
      request: {
        tenantId,
        companyId,
        requestId: `request-${id}`,
        conceptId: `concept-${id}`,
        strategyCycleId: null,
        packagePeriod: "2030-01",
        theme: "Status contract",
        brief: "Status contract fixture.",
        strategyContext: {},
        channels: ["instagram"],
        assetReferences: [],
        plannedPublishAt: "2030-01-20T10:00:00.000Z",
      },
      schemaVersion: "1.0",
      callbackTarget: "command-centre",
      callbackUrl: null,
      externalJobId: `external-${id}`,
      externalStatusUrl: "https://provider.internal/status",
      status,
      pollAttempts: 2,
      nextPollAt: null,
      lastError,
      resultPayload: { provider: "internal-result" },
      privateProvenance: {
        provider: "openai",
        model: "private-model",
        prompt: "private-prompt",
      },
      importedConceptId: null,
    });
  }

  const paused = (
    await createJob(
      "ccmj_status_paused",
      tenant.id,
      company.id,
      "paused",
      "OpenAI provider model private-model failed after prompt execution.",
    )
  ).job;
  const unassigned = (
    await createJob(
      "ccmj_status_unassigned",
      tenant.id,
      unassignedCompany.id,
      "failed",
    )
  ).job;
  const crossTenant = (
    await createJob(
      "ccmj_status_cross_tenant",
      otherTenant.id,
      otherCompany.id,
      "failed",
    )
  ).job;
  const archived = (
    await createJob(
      "ccmj_status_archived",
      tenant.id,
      archivedCompany.id,
      "paused",
    )
  ).job;

  const serviceToken = process.env.CONTENT_DESK_INTERNAL_TOKEN!;
  const signingSecret = process.env.CONTENT_DESK_ACTOR_SIGNING_SECRET!;
  function request(jti: string, credentials: "both" | "none" = "both") {
    const headers = new Headers();
    if (credentials === "both") {
      headers.set("authorization", `Bearer ${serviceToken}`);
      headers.set(
        "x-content-desk-actor",
        auth.signContentDeskDelegation(
          { actorId: actor.id, tenantId: tenant.id, jti },
          signingSecret,
        ),
      );
    }
    return new NextRequest(
      `https://command-centre.test/api/managed-content/jobs/${paused.id}`,
      { method: "GET", headers },
    );
  }
  const get = (jobId: string, jti: string, credentials?: "both" | "none") =>
    route.GET(request(jti, credentials), {
      params: Promise.resolve({ jobId }),
    });

  assert.equal((await get(paused.id, "missing-credentials", "none")).status, 401);

  const response = await get(paused.id, "paused-status");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), [
    "conceptId",
    "id",
    "lastError",
    "pollAttempts",
    "status",
    "updatedAt",
  ]);
  assert.equal(body.id, paused.id);
  assert.equal(body.conceptId, paused.conceptId);
  assert.equal(body.status, "paused");
  assert.equal(body.pollAttempts, 2);
  assert.match(String(body.lastError), /paused by Command Centre service controls/);
  assert.doesNotMatch(
    JSON.stringify(body),
    /openai|private-model|private-prompt|provider|external-/i,
  );

  assert.equal((await get(paused.id, "replayed-status")).status, 200);
  const replayRequest = request("single-use-status");
  assert.equal(
    (
      await route.GET(replayRequest, {
        params: Promise.resolve({ jobId: paused.id }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await route.GET(replayRequest, {
        params: Promise.resolve({ jobId: paused.id }),
      })
    ).status,
    401,
  );
  assert.equal((await get("missing-job", "missing-job")).status, 404);
  assert.equal((await get(unassigned.id, "unassigned-job")).status, 404);
  assert.equal((await get(crossTenant.id, "cross-tenant-job")).status, 404);
  assert.equal((await get(archived.id, "archived-job")).status, 404);

  const deskTypes = await readFile(
    "../content-desk/src/lib/operator/types.ts",
    "utf8",
  );
  for (const field of [
    "id: string",
    "conceptId: string",
    "status: ManagedJobStatus",
    "pollAttempts: number",
    "updatedAt: string",
    "lastError?: string | null",
  ]) {
    assert.match(deskTypes, new RegExp(field.replace(/[?]/g, "\\?")));
  }

  console.log("managed-content status cross-contract self-test: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
