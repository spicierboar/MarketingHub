// Publish-queue self-test (scale pass).
//
// The permanent, runnable fixture for the queue semantics the 1600-account
// fleet stands on: atomic claim, cross-tenant claim refusal, retry/backoff,
// dead-letter + requeue, platform ceilings, and skip-without-burning-a-retry.
// Mirrors src/lib/selftest/isolation.ts: provisions THROWAWAY tenants, runs the
// battery through the SAME repo + engine code paths the cron uses (wrapped in
// the cron's service context so it behaves identically under Supabase), then
// purges everything — safe to run against a live store.
//
// Run it via GET /api/dev/queue-test (same env/secret gating as self-test).
// Time-dependent behaviours are tested without clock control:
//   • backoff is asserted as "a fresh failure is NOT retried on the next tick"
//     plus the pure retryEligibleAt math;
//   • stale-claim recovery is asserted through the transition guard's
//     updatedBefore condition in both directions (fresh claim protected,
//     elapsed claim recoverable).

import {
  appendPublishLog,
  createCompany,
  createContent,
  createCampaignItem,
  createIntegration,
  createRequest,
  createScheduledPost,
  createTenant,
  getContent,
  getCampaignItem,
  getRequest,
  getScheduledPost,
  listPublishLogsForPosts,
  purgeTenant,
  transitionScheduledPost,
  updateContent,
  updatePublishingControls,
  updateScheduledPost,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { runInServiceContext } from "@/lib/db/service-context";
import {
  attemptsSinceRequeue,
  clearSimulatedPublishRegistry,
  idempotencyKeyFromDetail,
  isDue,
  MAX_PUBLISH_ATTEMPTS,
  processPublishQueue,
  publishIdempotencyKey,
  publishPostNow,
  queueNowParts,
  reconcileDeliveryUnknown,
  retryEligibleAt,
  STALE_CLAIM_MINUTES,
} from "@/lib/publish-queue";
import { platformCeiling } from "@/lib/platform-limits";
import {
  isValidIanaTimezone,
  localPartsInTimezone,
  resolveQueueClockAt,
} from "@/lib/tenant-timezone";
import { now } from "@/lib/utils";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, Company, Tenant } from "@/lib/types";

export interface QueueCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface QueueReport {
  ok: boolean; // every check passed AND teardown purged cleanly
  passed: number;
  failed: number;
  purgeFailed: string[]; // tenants whose teardown purge failed — investigate!
  durationMs: number;
  checks: QueueCheck[];
}

// Synthetic queue actor (same shape the cron's systemActor uses — actor id
// columns are opaque text since migration 0003).
function queueActor(tenantId: string): ActingUser {
  return {
    id: "system:queue-selftest",
    email: "queue-selftest@marketing-command-centre.system",
    name: "Queue self-test",
    role: TENANT_ROLE_TIER.owner,
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

async function makePost(args: {
  company: Company;
  platform: string;
  title: string;
  body: string;
  date: string;
  time?: string;
}) {
  const content = await createContent({
    companyId: args.company.id,
    type: "social_post",
    title: args.title,
    body: args.body,
    status: "scheduled",
    createdById: "system:queue-selftest",
  });
  const post = await createScheduledPost({
    contentId: content.id,
    companyId: args.company.id,
    platform: args.platform,
    scheduledDate: args.date,
    scheduledTime: args.time,
    status: "scheduled",
    createdById: "system:queue-selftest",
  });
  return { content, post };
}

export async function runQueueSelfTest(): Promise<QueueReport> {
  const startedAt = Date.now();
  const checks: QueueCheck[] = [];
  const expect = async (
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>,
  ): Promise<void> => {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({
        name,
        ok: false,
        detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  let tQ: Tenant | undefined;
  let tB: Tenant | undefined;
  const purgeFailed: string[] = [];

  try {
    clearSimulatedPublishRegistry();
    // SUSPENDED throwaway tenants: the real cron (runScheduledTick) only
    // processes ACTIVE tenants, so a concurrent tick can neither publish the
    // fixture's posts mid-run (flaky checks) nor — should a purge ever fail —
    // keep processing a zombie tenant forever. The fixture drives the queue
    // engine directly, which doesn't read tenant status.
    tQ = await createTenant({ name: "QueueTest Q", kind: "agency", plan: "agency", status: "suspended" });
    tB = await createTenant({ name: "QueueTest B", kind: "agency", plan: "starter", status: "suspended" });
    const tenantQ = tQ;
    const tenantB = tB;

    // The whole battery runs in the cron's service context — the exact runtime
    // the production queue tick has (session-less; usr() falls back to the
    // service client under Supabase; every repo call still tenant-pinned).
    await runInServiceContext(tenantQ.id, async () => {
      const actorQ = queueActor(tenantQ.id);
      const actorB = queueActor(tenantB.id);
      const company = await createCompany({
        tenantId: tenantQ.id,
        name: "Queue Co",
        createdBy: "system:queue-selftest",
      });
      await createIntegration({
        companyId: company.id,
        platform: "Facebook",
        accountName: "Queue Co Facebook",
        encryptedToken: "selftest-not-a-real-token",
        tokenLastFour: "st01",
        status: "connected",
        connectedById: "system:queue-selftest",
      });
      // Preview keeps outbound publishing disabled. The deterministic simulator
      // must still advance governed queue state without any external side effect.
      await updatePublishingControls(tenantQ.id, {
        automatedPublishingDisabled: true,
      });

      // Same wall-clock the engine gates due-ness on (CC_TZ_OFFSET_MINUTES aware).
      const { nowIso, today, hhmm } = queueNowParts();

      // ---- 0. Pure policy sanity ------------------------------------------------
      await expect("queue.platformCeilings", async () => {
        const ig = platformCeiling("Instagram Business");
        const tk = platformCeiling("TikTok");
        const em = platformCeiling("Email");
        const ok = ig === 25 && tk === 15 && em === null;
        return { ok, detail: `instagram=${ig} (want 25) tiktok=${tk} (want 15) email=${em} (want null)` };
      });

      await expect("queue.backoffMathMonotonic", async () => {
        const past = "2026-01-01T00:00:00.000Z";
        const a1 = retryEligibleAt(1, past);
        const a4 = retryEligibleAt(4, past);
        const ok = a1 > past && a4 > a1 && a1 <= nowIso;
        return { ok, detail: `attempt1→${a1} attempt4→${a4} (elapsed backoff must be eligible now)` };
      });

      await expect("timezone.ianaValidation", async () => {
        const ok =
          isValidIanaTimezone("Australia/Sydney") && !isValidIanaTimezone("Not/A/Zone");
        return {
          ok,
          detail: `sydney=${isValidIanaTimezone("Australia/Sydney")} junk=${!isValidIanaTimezone("Not/A/Zone")}`,
        };
      });

      await expect("timezone.sydneyAheadOfUtc", async () => {
        const instant = "2026-07-08T14:00:00.000Z";
        const utc = resolveQueueClockAt(instant, null);
        const syd = resolveQueueClockAt(instant, { timezone: "Australia/Sydney" });
        const ok = utc.today === "2026-07-08" && syd.today === "2026-07-09";
        return { ok, detail: `utc=${utc.today} syd=${syd.today} (want 2026-07-08 / 2026-07-09)` };
      });

      await expect("timezone.tenantDueGate", async () => {
        const instant = "2026-07-08T14:30:00.000Z";
        const clock = resolveQueueClockAt(instant, { timezone: "Australia/Sydney" });
        const due = isDue(
          { scheduledDate: clock.today, scheduledTime: "00:30" },
          clock.today,
          clock.hhmm,
        );
        const partsOk =
          localPartsInTimezone(instant, "Australia/Sydney").today === clock.today;
        return {
          ok: due && partsOk,
          detail: `local ${clock.today} ${clock.hhmm} due=${due} partsOk=${partsOk}`,
        };
      });

      // ---- 1. Atomic claim ------------------------------------------------------
      const { post: postClaim } = await makePost({
        company, platform: "Facebook", title: "claim test", body: "claim body", date: today,
      });
      await expect("queue.claimOnceOnly", async () => {
        const first = await transitionScheduledPost(tenantQ.id, postClaim.id, {
          from: ["scheduled", "failed"], to: "publishing",
        });
        const second = await transitionScheduledPost(tenantQ.id, postClaim.id, {
          from: ["scheduled", "failed"], to: "publishing",
        });
        const ok = first !== null && second === null;
        return { ok, detail: `first=${first ? "claimed" : "null"} second=${second ? "CLAIMED TWICE" : "null"} (want claimed, null)` };
      });

      // ---- 2. Stale-claim guard, both directions --------------------------------
      await expect("queue.staleClaimGuard", async () => {
        // postClaim is now freshly "publishing". A recovery bounded to claims
        // older than now-15m must NOT touch it; one bounded to the future must.
        const past = new Date(Date.parse(nowIso) - 15 * 60_000).toISOString();
        const future = new Date(Date.parse(now()) + 60_000).toISOString();
        const freshProtected = await transitionScheduledPost(tenantQ.id, postClaim.id, {
          from: ["publishing"], to: "failed", updatedBefore: past,
        });
        const elapsedRecovered = await transitionScheduledPost(tenantQ.id, postClaim.id, {
          from: ["publishing"], to: "failed", updatedBefore: future,
        });
        const ok = freshProtected === null && elapsedRecovered !== null;
        return { ok, detail: `freshProtected=${freshProtected === null} elapsedRecovered=${elapsedRecovered !== null} (want true, true)` };
      });
      // Park the claim-test post so later ticks never touch it.
      await transitionScheduledPost(tenantQ.id, postClaim.id, { from: ["failed"], to: "cancelled" });

      // ---- 3. Cross-tenant claim refused ----------------------------------------
      const { post: postIso } = await makePost({
        company, platform: "Facebook", title: "iso test", body: "iso body", date: today,
      });
      await expect("queue.crossTenantTransitionDenied", async () => {
        const stolen = await transitionScheduledPost(actorB.tenantId, postIso.id, {
          from: ["scheduled"], to: "publishing",
        });
        const after = await getScheduledPost(postIso.id);
        const ok = stolen === null && after?.status === "scheduled";
        return { ok, detail: `tenantB claim=${stolen === null ? "refused" : "GRANTED (LEAK)"} status=${after?.status}` };
      });
      await transitionScheduledPost(tenantQ.id, postIso.id, { from: ["scheduled"], to: "cancelled" });

      // ---- 4. Happy path through the full queue tick -----------------------------
      const { post: postOk, content: contentOk } = await makePost({
        company, platform: "Facebook", title: "happy post", body: "hello world", date: today,
      });
      await expect("queue.simulatedPublishAdvancesWhenLiveDisabled", async () => {
        const counts = await processPublishQueue(actorQ, {
          publishMode: { kind: "simulate" },
        });
        const post = await getScheduledPost(postOk.id);
        const content = await getContent(contentOk.id);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postOk.id]);
        const ok =
          counts.published === 1 &&
          post?.status === "published" &&
          content?.status === "published" &&
          logs.length === 1 &&
          logs[0].status === "published" &&
          logs[0].attempt === 1;
        return { ok, detail: `counts=${JSON.stringify(counts)} post=${post?.status} content=${content?.status} log=${logs[0]?.status}/${logs[0]?.attempt}` };
      });

      // ---- 5. Not-due posts stay untouched (time / date gating) ------------------
      const timeGated = hhmm <= "21:59";
      const plus2h = timeGated
        ? `${String(Number(hhmm.slice(0, 2)) + 2).padStart(2, "0")}:${hhmm.slice(3, 5)}`
        : undefined;
      const tomorrow = new Date(Date.parse(nowIso) + 24 * 3_600_000).toISOString().slice(0, 10);
      const { post: postLater } = await makePost({
        company, platform: "Facebook", title: "later post", body: "later body",
        date: timeGated ? today : tomorrow,
        time: plus2h,
      });
      await expect("queue.notDueNotPublished", async () => {
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postLater.id);
        const ok = post?.status === "scheduled" && counts.published === 0;
        return {
          ok,
          detail: `${timeGated ? `scheduledTime=${plus2h} (today, +2h)` : `scheduledDate=${tomorrow} (tomorrow)`} status=${post?.status} counts=${JSON.stringify(counts)}`,
        };
      });

      // ---- 6. Failure consumes exactly one attempt -------------------------------
      const { post: postFail } = await makePost({
        company, platform: "Facebook", title: "failing post", body: "[simulate-failure] boom", date: today,
      });
      await expect("queue.failureCountsOneAttempt", async () => {
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postFail.id);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postFail.id]);
        const { attempts } = attemptsSinceRequeue(logs);
        const ok = counts.failed === 1 && post?.status === "failed" && attempts === 1;
        return { ok, detail: `counts=${JSON.stringify(counts)} status=${post?.status} attempts=${attempts}` };
      });

      await expect("queue.backoffBlocksImmediateRetry", async () => {
        const before = (await listPublishLogsForPosts(tenantQ.id, [postFail.id])).length;
        const counts = await processPublishQueue(actorQ);
        const after = (await listPublishLogsForPosts(tenantQ.id, [postFail.id])).length;
        const post = await getScheduledPost(postFail.id);
        const ok = after === before && post?.status === "failed" && counts.failed === 0;
        return { ok, detail: `logs ${before}→${after} (must not grow) status=${post?.status} counts=${JSON.stringify(counts)}` };
      });

      // ---- 7. Dead-letter at MAX attempts + never retried again -------------------
      await expect("queue.deadLetterAtMaxAttempts", async () => {
        // Backfill the remaining failed attempts through the normal append-only
        // log (what MAX real failures would leave behind).
        for (let i = 2; i <= MAX_PUBLISH_ATTEMPTS; i += 1) {
          await appendPublishLog({
            companyId: company.id,
            platform: "Facebook",
            scheduledPostId: postFail.id,
            contentId: postFail.contentId,
            status: "failed",
            attempt: i,
            detail: "self-test backfilled failure",
            actorId: "system:queue-selftest",
          });
        }
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postFail.id);
        const audited = (await listAudit(tenantQ.id)).some(
          (e) => e.action === "publishing.dead_letter" && e.targetId === postFail.id,
        );
        const ok = post?.status === "dead" && counts.dead >= 1 && audited;
        return { ok, detail: `status=${post?.status} counts=${JSON.stringify(counts)} audited=${audited}` };
      });

      await expect("queue.deadNeverRetried", async () => {
        const before = (await listPublishLogsForPosts(tenantQ.id, [postFail.id])).length;
        const counts = await processPublishQueue(actorQ);
        const after = (await listPublishLogsForPosts(tenantQ.id, [postFail.id])).length;
        const post = await getScheduledPost(postFail.id);
        const ok = post?.status === "dead" && after === before && counts.failed === 0;
        return { ok, detail: `status=${post?.status} logs ${before}→${after} counts=${JSON.stringify(counts)}` };
      });

      // ---- 8. Requeue resets the retry budget ------------------------------------
      await expect("queue.requeueResetsBudget", async () => {
        // Same primitives the Publishing Centre requeue action uses.
        const rec = await transitionScheduledPost(tenantQ.id, postFail.id, {
          from: ["dead"], to: "scheduled",
        });
        await appendPublishLog({
          companyId: company.id,
          platform: "Facebook",
          scheduledPostId: postFail.id,
          contentId: postFail.contentId,
          status: "requeued",
          attempt: 0,
          detail: "self-test requeue — retry budget reset",
          actorId: "system:queue-selftest",
        });
        const counts = await processPublishQueue(actorQ);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postFail.id]);
        const { attempts } = attemptsSinceRequeue(logs);
        const newest = logs[0];
        const ok =
          rec !== null &&
          counts.failed === 1 &&
          attempts === 1 &&
          newest?.status === "failed" &&
          newest?.attempt === 1;
        return { ok, detail: `requeued=${rec !== null} counts=${JSON.stringify(counts)} attemptsAfter=${attempts} newest=${newest?.status}/${newest?.attempt} (attempt must restart at 1)` };
      });
      await transitionScheduledPost(tenantQ.id, postFail.id, { from: ["failed"], to: "cancelled" });

      // ---- 9. Platform ceiling defers (Instagram 25/24h) --------------------------
      const igIntegration = await createIntegration({
        companyId: company.id,
        platform: "Instagram",
        accountName: "Queue Co Instagram",
        encryptedToken: "selftest-not-a-real-token",
        tokenLastFour: "st02",
        status: "connected",
        connectedById: "system:queue-selftest",
      });
      const igCeiling = platformCeiling("Instagram") ?? 25;
      const { post: postIg } = await makePost({
        company, platform: "Instagram", title: "ig post", body: "ig body", date: today,
      });
      await expect("queue.ceilingDefersOverLimit", async () => {
        // Fill the account's trailing-24h window to the ceiling (logs reference
        // the already-published happy-path post to satisfy FKs).
        for (let i = 0; i < igCeiling; i += 1) {
          await appendPublishLog({
            companyId: company.id,
            platform: "Instagram",
            integrationId: igIntegration.id,
            scheduledPostId: postOk.id,
            contentId: postOk.contentId,
            status: "published",
            attempt: 1,
            detail: `self-test ceiling filler ${i + 1}`,
            actorId: "system:queue-selftest",
          });
        }
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postIg.id);
        const igLogs = await listPublishLogsForPosts(tenantQ.id, [postIg.id]);
        const ok = counts.deferred >= 1 && post?.status === "scheduled" && igLogs.length === 0;
        return { ok, detail: `counts=${JSON.stringify(counts)} status=${post?.status} igPostLogs=${igLogs.length} (deferred, unclaimed, unlogged)` };
      });
      await transitionScheduledPost(tenantQ.id, postIg.id, { from: ["scheduled"], to: "cancelled" });

      // ---- 10. A skip releases the claim without burning a retry ------------------
      const { post: postFrozen } = await makePost({
        company, platform: "TikTok", title: "frozen post", body: "frozen body", date: today,
      });
      await expect("queue.skipRestoresWithoutAttempt", async () => {
        await updatePublishingControls(tenantQ.id, { frozenPlatforms: ["TikTok"] });
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postFrozen.id);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postFrozen.id]);
        const { attempts } = attemptsSinceRequeue(logs);
        await updatePublishingControls(tenantQ.id, { frozenPlatforms: [] });
        const ok =
          counts.skipped >= 1 &&
          post?.status === "scheduled" &&
          attempts === 0 &&
          logs.length === 1 &&
          logs[0].status === "skipped";
        return { ok, detail: `counts=${JSON.stringify(counts)} status=${post?.status} attempts=${attempts} logs=${logs.map((l) => l.status).join(",")}` };
      });
      await transitionScheduledPost(tenantQ.id, postFrozen.id, { from: ["scheduled"], to: "cancelled" });

      // ---- 11. Demoted content: the in-flight attempt cancels the post ------------
      const { post: postDemoted, content: contentDemoted } = await makePost({
        company, platform: "Facebook", title: "demoted post", body: "demoted body", date: today,
      });
      await expect("queue.demotedContentCancelsPost", async () => {
        // Demote the content below "scheduled" (what an edit/campaign-cancel
        // does). The queue must CANCEL the post at settle time — not restore
        // it to "scheduled" (that zombie would double-publish after
        // re-approval) and not burn a retry attempt.
        await updateContent(contentDemoted.id, { status: "pending_approval" });
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postDemoted.id);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postDemoted.id]);
        const ok =
          post?.status === "cancelled" &&
          counts.skipped >= 1 &&
          logs.length === 1 &&
          logs[0].status === "skipped";
        return { ok, detail: `status=${post?.status} (must be cancelled) counts=${JSON.stringify(counts)} logs=${logs.map((l) => l.status).join(",")}` };
      });

      // ---- 12. Idempotent retry skips re-send when already published ----------
      const { post: postIdem } = await makePost({
        company, platform: "Facebook", title: "idem post", body: "idem body", date: today,
      });
      await expect("queue.idempotentRetrySkipsResend", async () => {
        const first = await publishPostNow(postIdem.id, actorQ);
        const simId = first?.log.detail.match(/\(simulated id: ([^)]+)\)/)?.[1];
        await transitionScheduledPost(tenantQ.id, postIdem.id, {
          from: ["published"], to: "failed",
        });
        const second = await publishPostNow(postIdem.id, actorQ, { claimFrom: ["failed"] });
        const logs = await listPublishLogsForPosts(tenantQ.id, [postIdem.id]);
        const published = logs.filter((l) => l.status === "published");
        const key = idempotencyKeyFromDetail(published[0]?.detail ?? "");
        const ok =
          first?.log.status === "published" &&
          second?.log.status === "published" &&
          key === publishIdempotencyKey(postIdem.id, 1) &&
          published.some((l) => l.detail.includes("idempotent")) &&
          (!simId || published.every((l) => l.detail.includes(simId)));
        return {
          ok,
          detail: `logs=${published.length} key=${key} idempotent=${published.some((l) => l.detail.includes("idempotent"))}`,
        };
      });
      await transitionScheduledPost(tenantQ.id, postIdem.id, { from: ["published", "failed"], to: "cancelled" });

      // ---- 13. Stale-claim recovery settles published when log exists --------
      const { post: postStale } = await makePost({
        company, platform: "Facebook", title: "stale idem", body: "stale idem body", date: today,
      });
      await expect("queue.staleClaimRecoversPublished", async () => {
        const published = await publishPostNow(postStale.id, actorQ);
        if (!published || published.log.status !== "published") {
          return { ok: false, detail: `initial publish failed` };
        }
        await transitionScheduledPost(tenantQ.id, postStale.id, {
          from: ["published"], to: "publishing",
        });
        const staleAt = new Date(
          Date.now() - (STALE_CLAIM_MINUTES + 5) * 60_000,
        ).toISOString();
        await updateScheduledPost(postStale.id, { updatedAt: staleAt });
        const counts = await processPublishQueue(actorQ);
        const post = await getScheduledPost(postStale.id);
        const logs = await listPublishLogsForPosts(tenantQ.id, [postStale.id]);
        const recovered = logs.some((l) => l.detail.includes("stale-claim recovered"));
        const ok = post?.status === "published" && counts.failed === 0 && recovered;
        return { ok, detail: `status=${post?.status} failed=${counts.failed} recovered=${recovered}` };
      });

      const { post: postUnknown } = await makePost({
        company,
        platform: "Facebook",
        title: "accepted then timeout",
        body: "accepted then timeout body",
        date: today,
      });
      await expect("queue.acceptedThenTimeoutRequiresReconciliation", async () => {
        const controller = new AbortController();
        let dispatches = 0;
        let providerIdempotencyKey: string | undefined;
        const timer = setTimeout(() => controller.abort(), 10);
        const outcome = await publishPostNow(postUnknown.id, actorQ, {
          publishMode: { kind: "live" },
          signal: controller.signal,
          dispatchPublishOverride: async (_integration, _body, options) => {
            dispatches += 1;
            providerIdempotencyKey = options?.idempotencyKey;
            return await new Promise<never>((_resolve, reject) => {
              options?.signal?.addEventListener(
                "abort",
                () => reject(options?.signal?.reason),
                { once: true },
              );
            });
          },
        });
        clearTimeout(timer);
        const unknown = await getScheduledPost(postUnknown.id);
        const unknownStatus = unknown?.status;
        const retryBeforeReconciliation = await publishPostNow(
          postUnknown.id,
          actorQ,
          { publishMode: { kind: "live" } },
        );
        const reconciled = await reconcileDeliveryUnknown(
          actorQ,
          postUnknown.id,
          "not_delivered",
          "provider lookup returned no matching delivery",
        );
        const after = await getScheduledPost(postUnknown.id);
        const ok =
          outcome?.deliveryUnknown === true &&
          unknownStatus === "delivery_unknown" &&
          retryBeforeReconciliation === null &&
          reconciled &&
          after?.status === "failed" &&
          dispatches === 1 &&
          providerIdempotencyKey === publishIdempotencyKey(postUnknown.id, 1);
        return {
          ok,
          detail: `unknown=${unknownStatus} retryBlocked=${retryBeforeReconciliation === null} reconciled=${reconciled} after=${after?.status} dispatches=${dispatches} idem=${providerIdempotencyKey}`,
        };
      });

      const request = await createRequest({
        companyId: company.id,
        requesterId: actorQ.id,
        requestType: "social_post",
        objective: "Verify reconciliation workflow",
        topic: "Delivery reconciliation",
        urgency: "normal",
        consent: {
          customerNamed: false,
          customerInPhotos: false,
          consentObtained: false,
          mentionsPricing: false,
          mentionsOffer: false,
          performanceClaims: false,
        },
        uploads: [],
        assignedReviewerId: null,
      });
      const { post: postReconciled, content: contentReconciled } =
        await makePost({
          company,
          platform: "Facebook",
          title: "reconciled delivery",
          body: "reconciled delivery body",
          date: today,
        });
      const campaignItem = await createCampaignItem({
        campaignId: "cmp_reconciliation_workflow",
        companyId: company.id,
        dayOffset: 1,
        channel: "Facebook",
        contentType: "social_post",
        title: "Reconciled delivery",
        brief: "Verify all workflow records advance",
        contentId: contentReconciled.id,
        status: "scheduled",
      });
      await updateContent(contentReconciled.id, {
        requestId: request.id,
        campaignId: campaignItem.campaignId,
        campaignItemId: campaignItem.id,
      });
      await expect("queue.reconciliationFinalizesWorkflowState", async () => {
        const idempotencyKey = publishIdempotencyKey(postReconciled.id, 1);
        await transitionScheduledPost(tenantQ.id, postReconciled.id, {
          from: ["scheduled"],
          to: "publishing",
        });
        await transitionScheduledPost(tenantQ.id, postReconciled.id, {
          from: ["publishing"],
          to: "delivery_unknown",
        });
        await updateScheduledPost(postReconciled.id, {
          deliveryIdempotencyKey: idempotencyKey,
          deliveryUnknownAt: now(),
          deliveryUnknownReason: "Provider response lost",
        });
        await appendPublishLog({
          companyId: company.id,
          platform: postReconciled.platform,
          scheduledPostId: postReconciled.id,
          contentId: contentReconciled.id,
          status: "skipped",
          attempt: 1,
          detail: `[idem:${idempotencyKey}] Delivery outcome unknown`,
          actorId: actorQ.id,
        });
        const reconciled = await reconcileDeliveryUnknown(
          actorQ,
          postReconciled.id,
          "delivered",
          "provider post fb_12345",
        );
        const [post, content, item, workflow, logs, audit] =
          await Promise.all([
            getScheduledPost(postReconciled.id),
            getContent(contentReconciled.id),
            getCampaignItem(campaignItem.id),
            getRequest(request.id),
            listPublishLogsForPosts(tenantQ.id, [postReconciled.id]),
            listAudit(tenantQ.id),
          ]);
        const publishedLog = logs.find(
          (entry) =>
            entry.status === "published" &&
            idempotencyKeyFromDetail(entry.detail) === idempotencyKey,
        );
        const actions = new Set(
          audit
            .filter((entry) => entry.targetId === postReconciled.id)
            .map((entry) => entry.action),
        );
        const ok =
          reconciled &&
          post?.status === "published" &&
          content?.status === "published" &&
          item?.status === "published" &&
          workflow?.status === "published" &&
          Boolean(publishedLog) &&
          actions.has("content.published") &&
          actions.has("publishing.delivery_reconciled");
        return {
          ok,
          detail: `post=${post?.status} content=${content?.status} item=${item?.status} request=${workflow?.status} idem=${Boolean(publishedLog)} audits=${[...actions].join(",")}`,
        };
      });
    });
  } finally {
    // Always tear down — the fixture must leave a live store exactly as found.
    // A purge failure is REPORTED (ok:false), never swallowed: a leftover
    // throwaway tenant with posts and a fake integration is real pollution.
    for (const t of [tQ, tB]) {
      if (!t) continue;
      try {
        await purgeTenant(t.id);
      } catch (e) {
        purgeFailed.push(`${t.name} (${t.id}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - startedAt,
    checks,
  };
}
