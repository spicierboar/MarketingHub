// Self-test helpers for V1 publish idempotency (Module 1 remainder / M01b).

import {
  createCompany,
  createContent,
  createIntegration,
  createScheduledPost,
  createTenant,
  getScheduledPost,
  listPublishLogsForPosts,
  transitionScheduledPost,
  updateScheduledPost,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import {
  clearSimulatedPublishRegistry,
  idempotencyKeyFromDetail,
  processPublishQueue,
  publishIdempotencyKey,
  publishPostNow,
  queueNowParts,
  STALE_CLAIM_MINUTES,
} from "@/lib/publish-queue";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, Company, ScheduledPost } from "@/lib/types";

function queueActor(tenantId: string): ActingUser {
  return {
    id: "system:idem-selftest",
    email: "idem-selftest@marketing-command-centre.system",
    name: "Idempotency self-test",
    role: TENANT_ROLE_TIER.owner,
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

async function makeDuePost(company: Company): Promise<ScheduledPost> {
  const { today } = queueNowParts();
  const content = await createContent({
    companyId: company.id,
    type: "social_post",
    title: "idem test",
    body: "idempotent publish body",
    status: "scheduled",
    createdById: "system:idem-selftest",
  });
  return createScheduledPost({
    contentId: content.id,
    companyId: company.id,
    platform: "Facebook",
    scheduledDate: today,
    status: "scheduled",
    createdById: "system:idem-selftest",
  });
}

async function provisionFixture() {
  clearSimulatedPublishRegistry();
  const tenant = await createTenant({
    name: "M01b idem test",
    kind: "agency",
    plan: "starter",
    status: "suspended",
  });
  const company = await createCompany({
    tenantId: tenant.id,
    name: "Idem Co",
    createdBy: "system:idem-selftest",
  });
  await createIntegration({
    companyId: company.id,
    platform: "Facebook",
    accountName: "Idem Co Facebook",
    encryptedToken: "selftest-not-a-real-token",
    tokenLastFour: "id01",
    status: "connected",
    connectedById: "system:idem-selftest",
  });
  return { tenant, company };
}

export async function checkRetrySkipsWhenAlreadyPublished(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const { tenant, company } = await provisionFixture();
  return runInServiceContext(tenant.id, async () => {
    const actor = queueActor(tenant.id);
    const post = await makeDuePost(company);
    const first = await publishPostNow(post.id, actor);
    if (!first || first.log.status !== "published") {
      return { ok: false, detail: `first publish failed: ${first?.log.status}` };
    }
    const simId = first.log.detail.match(/\(simulated id: ([^)]+)\)/)?.[1];
    await transitionScheduledPost(tenant.id, post.id, {
      from: ["published"],
      to: "failed",
    });
    const second = await publishPostNow(post.id, actor, { claimFrom: ["failed"] });
    const logs = await listPublishLogsForPosts(tenant.id, [post.id]);
    const publishedLogs = logs.filter((l) => l.status === "published");
    const idempotent = publishedLogs.some((l) => l.detail.includes("idempotent"));
    const sameSim = publishedLogs.every((l) =>
      simId ? l.detail.includes(simId) : true,
    );
    const ok =
      second?.log.status === "published" &&
      idempotent &&
      sameSim &&
      publishedLogs.length >= 2;
    return {
      ok,
      detail: `first=${first.log.status} second=${second?.log.status} publishedLogs=${publishedLogs.length} idempotent=${idempotent}`,
    };
  });
}

export async function checkStaleClaimSafeRecovery(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const { tenant, company } = await provisionFixture();
  return runInServiceContext(tenant.id, async () => {
    const actor = queueActor(tenant.id);
    const post = await makeDuePost(company);
    const first = await publishPostNow(post.id, actor);
    if (!first || first.log.status !== "published") {
      return { ok: false, detail: `initial publish failed` };
    }
    await transitionScheduledPost(tenant.id, post.id, {
      from: ["published"],
      to: "publishing",
    });
    const staleAt = new Date(
      Date.now() - (STALE_CLAIM_MINUTES + 5) * 60_000,
    ).toISOString();
    await updateScheduledPost(post.id, { updatedAt: staleAt });
    const counts = await processPublishQueue(actor);
    const after = await getScheduledPost(post.id);
    const logs = await listPublishLogsForPosts(tenant.id, [post.id]);
    const recovered = logs.some((l) => l.detail.includes("stale-claim recovered"));
    const ok =
      after?.status === "published" &&
      counts.failed === 0 &&
      recovered;
    return {
      ok,
      detail: `status=${after?.status} failed=${counts.failed} recovered=${recovered}`,
    };
  });
}

export async function checkLogRecordsDedupeKey(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const { tenant, company } = await provisionFixture();
  return runInServiceContext(tenant.id, async () => {
    const actor = queueActor(tenant.id);
    const post = await makeDuePost(company);
    const outcome = await publishPostNow(post.id, actor);
    if (!outcome || outcome.log.status !== "published") {
      return { ok: false, detail: `publish failed: ${outcome?.log.status}` };
    }
    const key = idempotencyKeyFromDetail(outcome.log.detail);
    const expected = publishIdempotencyKey(post.id, 1);
    const ok = key === expected;
    return { ok, detail: `key=${key} expected=${expected}` };
  });
}
