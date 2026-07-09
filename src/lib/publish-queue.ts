// The publish job queue (scale pass for ~1600 accounts).
//
// The single-tick scheduler used to walk due posts and fire them once — no
// retries, no backoff, no platform ceilings, no protection against two workers
// publishing the same post. This module upgrades the SAME data model
// (scheduled_posts + the append-only publish_logs) into a durable queue:
//
//   • ATOMIC CLAIM — a post is transitioned scheduled/failed → "publishing"
//     with a conditional UPDATE (transitionScheduledPost). Two overlapping
//     ticks (Vercel cron + a manual "publish now") can both try; exactly one
//     wins, the loser sees null and walks away. No double-posting.
//   • RETRIES + EXPONENTIAL BACKOFF — attempts are DERIVED from the append-only
//     log (failed entries since the newest requeued/published marker), so no
//     schema change and no counter to corrupt. A failed post retries after
//     BACKOFF_MINUTES[attempt-1], honestly numbered in the log.
//   • DEAD-LETTER — after MAX_PUBLISH_ATTEMPTS the post parks as "dead". The
//     scheduler never touches it again; a human requeues (a "requeued" log
//     marker resets the derived attempt count) or cancels it from the
//     Publishing Centre.
//   • PLATFORM CEILINGS — each integration's trailing-24h published count is
//     measured against src/lib/platform-limits.ts (e.g. Instagram ~25/24h).
//     Over-ceiling posts are DEFERRED: no claim, no log spam, no retry burned —
//     they simply stay queued and go out when capacity frees.
//   • STALE-CLAIM RECOVERY — a worker that dies mid-send leaves the post
//     "publishing"; after STALE_CLAIM_MINUTES the next tick verifies prior
//     publish_logs / the simulated-platform registry before re-sending. When a
//     prior successful publish is found the post is settled as published
//     (idempotent no-op); otherwise it becomes a counted failed attempt.
//   • PUBLISH IDEMPOTENCY — each attempt carries a dedupe key (scheduled_post
//     id + attempt). Retries and stale-claim recovery verify platform state /
//     prior publish_log before calling the connector; duplicate outcomes are
//     recorded in publish_logs as idempotent no-ops ([idem:…] in detail).
//
// Isolation: every repo call here is pinned to actor.tenantId, and the claim
// itself re-checks the post's company belongs to that tenant — a queue tick
// can never move another tenant's post, even by id.

import {
  appendPublishLog,
  findConnectedIntegration,
  getPublishingControls,
  getScheduledPost,
  listPublishLogsForPosts,
  listPublishLogsSince,
  listScheduledPosts,
  transitionScheduledPost,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { attemptScheduledPost } from "@/lib/publishing";
import { CEILING_WINDOW_HOURS, platformCeiling } from "@/lib/platform-limits";
import { getTenant } from "@/lib/db";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import { now } from "@/lib/utils";
import type {
  ActingUser,
  PublishLog,
  ScheduledPost,
  ScheduledPostStatus,
  Tenant,
} from "@/lib/types";

// ---- Queue policy --------------------------------------------------------------

// A post gets this many attempts (including the first) before dead-lettering.
export const MAX_PUBLISH_ATTEMPTS = 5;
// Wait after the Nth failure before retrying (last entry repeats). With the
// hourly production cron the effective floor is the tick interval; the local
// in-process heartbeat honours the exact minutes.
export const BACKOFF_MINUTES = [5, 15, 45, 120];
// An in-flight claim older than this is presumed crashed and recovered.
export const STALE_CLAIM_MINUTES = 15;

export interface QueueCounts {
  published: number;
  failed: number;
  skipped: number;
  deferred: number; // over a platform ceiling — waiting for capacity, not an error
  dead: number; // dead-lettered this tick (includes settled failures)
}

export function emptyQueueCounts(): QueueCounts {
  return { published: 0, failed: 0, skipped: 0, deferred: 0, dead: 0 };
}

// ---- Publish idempotency (verify-before-retry) ---------------------------------

const IDEM_DETAIL_RE = /^\[idem:([^\]]+)\]\s*/;

/** Per-attempt dedupe key derived from scheduled_post id + attempt number. */
export function publishIdempotencyKey(scheduledPostId: string, attempt: number): string {
  return `pub:${scheduledPostId}:a${attempt}`;
}

/** Alternate key when a platform message id is already known. */
export function publishIdempotencyKeyFromPlatform(
  scheduledPostId: string,
  platformMessageId: string,
): string {
  return `pub:${scheduledPostId}:msg:${platformMessageId}`;
}

export function idempotencyKeyFromDetail(detail: string): string | null {
  const m = detail.match(IDEM_DETAIL_RE);
  return m?.[1] ?? null;
}

export function withIdempotencyDetail(key: string, detail: string): string {
  return `[idem:${key}] ${detail}`;
}

// Simulated-platform registry: survives stale-claim when the worker died after
// the connector accepted but before publish_logs was written (demo mode).
const simPublishedByKey = new Map<string, string>();

export function registerSimulatedPublish(key: string, platformDetail: string): void {
  simPublishedByKey.set(key, platformDetail);
}

export function lookupSimulatedPublish(key: string): string | undefined {
  return simPublishedByKey.get(key);
}

/** Fixture teardown — clears the in-memory sim registry between runs. */
export function clearSimulatedPublishRegistry(): void {
  simPublishedByKey.clear();
}

function findSimPublishForPost(scheduledPostId: string): { key: string; detail: string } | null {
  const prefix = `pub:${scheduledPostId}:`;
  for (const [key, detail] of simPublishedByKey) {
    if (key.startsWith(prefix)) return { key, detail };
  }
  return null;
}

/** Newest-first logs: first successful publish for this scheduled post. */
export function findPublishedLogForPost(
  logsNewestFirst: PublishLog[],
  scheduledPostId: string,
): PublishLog | null {
  for (const l of logsNewestFirst) {
    if (l.scheduledPostId !== scheduledPostId) continue;
    if (l.status === "published") return l;
  }
  return null;
}

export interface PriorPublishEvidence {
  key: string;
  detail: string;
  attempt: number;
  integrationId?: string;
}

/** Verify platform state / prior publish_log before re-sending. */
export function resolvePriorPublish(
  logsNewestFirst: PublishLog[],
  scheduledPostId: string,
  attempt: number,
): PriorPublishEvidence | null {
  const key = publishIdempotencyKey(scheduledPostId, attempt);
  const simDetail = lookupSimulatedPublish(key);
  if (simDetail) {
    return { key, detail: simDetail, attempt };
  }
  for (const l of logsNewestFirst) {
    if (l.scheduledPostId !== scheduledPostId) continue;
    if (l.status !== "published") continue;
    const logKey = idempotencyKeyFromDetail(l.detail);
    const bare = l.detail.replace(IDEM_DETAIL_RE, "");
    if (logKey === key || l.attempt === attempt) {
      return { key: logKey ?? key, detail: bare, attempt: l.attempt, integrationId: l.integrationId };
    }
    // Any prior published log for this post — retry must not re-send.
    return {
      key: logKey ?? publishIdempotencyKey(scheduledPostId, l.attempt),
      detail: bare,
      attempt: l.attempt,
      integrationId: l.integrationId,
    };
  }
  const simAny = findSimPublishForPost(scheduledPostId);
  if (simAny) {
    return { key: simAny.key, detail: simAny.detail, attempt };
  }
  return null;
}

async function settleIdempotentPublish(
  actor: ActingUser,
  post: Pick<ScheduledPost, "id" | "companyId" | "platform" | "contentId">,
  attempt: number,
  prior: PriorPublishEvidence,
  note: string,
): Promise<PublishLog> {
  await transitionScheduledPost(actor.tenantId, post.id, {
    from: ["publishing"],
    to: "published",
  });
  return appendPublishLog({
    companyId: post.companyId,
    platform: post.platform,
    integrationId: prior.integrationId,
    scheduledPostId: post.id,
    contentId: post.contentId,
    status: "published",
    attempt,
    detail: withIdempotencyDetail(
      prior.key,
      `${prior.detail} (${note})`,
    ),
    actorId: actor.id,
  });
}

// ---- Derived queue state (from the append-only publish log) --------------------

// Attempts consumed = failed logs (newest first) until the first
// requeued/published marker. "skipped" entries (freeze windows, rights gaps)
// neither count an attempt nor reset the streak.
export function attemptsSinceRequeue(logsNewestFirst: PublishLog[]): {
  attempts: number;
  lastFailedAt?: string;
} {
  let attempts = 0;
  let lastFailedAt: string | undefined;
  for (const l of logsNewestFirst) {
    if (l.status === "requeued" || l.status === "published") break;
    if (l.status === "failed") {
      attempts += 1;
      lastFailedAt ??= l.createdAt;
    }
  }
  return { attempts, lastFailedAt };
}

// When a post that has failed `attempts` times (most recently at lastFailedAt)
// becomes eligible to retry.
export function retryEligibleAt(attempts: number, lastFailedAt: string): string {
  const idx = Math.min(Math.max(attempts, 1) - 1, BACKOFF_MINUTES.length - 1);
  return new Date(
    Date.parse(lastFailedAt) + BACKOFF_MINUTES[idx] * 60_000,
  ).toISOString();
}

function minutesAgo(fromIso: string, minutes: number): string {
  return new Date(Date.parse(fromIso) - minutes * 60_000).toISOString();
}

// Wall-clock parts for DUE-ness. Schedule dates/times are what a human typed
// into the calendar — local intent, not UTC instants. Per-tenant IANA
// timezones (tenants.timezone) map the queue onto that intent; when unset,
// CC_TZ_OFFSET_MINUTES is the platform-wide fallback; neither → UTC. Backoff
// and ceiling windows deliberately stay on raw UTC instants.
export function queueNowParts(tenant?: Pick<Tenant, "timezone"> | null): {
  nowIso: string;
  today: string;
  hhmm: string;
} {
  const clock = resolveQueueClock(tenant);
  return { nowIso: clock.nowIso, today: clock.today, hhmm: clock.hhmm };
}

/** Load the tenant row and resolve the due-ness clock (cron / publish tick). */
export async function queueNowPartsForTenant(tenantId: string): Promise<{
  nowIso: string;
  today: string;
  hhmm: string;
}> {
  const tenant = await getTenant(tenantId);
  return queueNowParts(tenant);
}

// The single due-ness rule (date passed, or today once the scheduled time has
// passed) — used identically by the tick, the retry selector and the
// Publishing Centre's button count so the UI never promises what the queue
// won't do.
export function isDue(
  post: Pick<ScheduledPost, "scheduledDate" | "scheduledTime">,
  today: string,
  hhmm: string,
): boolean {
  return (
    post.scheduledDate < today ||
    (post.scheduledDate === today && (post.scheduledTime ?? "00:00") <= hhmm)
  );
}

// Trailing-24h published-post count per integration — the number the platform
// ceilings are measured against. Only real content publishes count
// (scheduledPostId set); social replies are comments, not feed posts.
export function ceilingUsage(recentLogs: PublishLog[]): Map<string, number> {
  const used = new Map<string, number>();
  for (const l of recentLogs) {
    if (l.status !== "published" || !l.scheduledPostId || !l.integrationId) continue;
    used.set(l.integrationId, (used.get(l.integrationId) ?? 0) + 1);
  }
  return used;
}

// ---- Single-post entry (the only way a post reaches the platform) --------------

export interface PublishOutcome {
  log: PublishLog;
  becameDead: boolean;
}

// Claim → attempt → settle. Returns null when the claim was lost (another
// worker already has the post, or its status/tenant no longer allows it).
// The queue tick pre-checks ceilings across the whole candidate set and passes
// bypassCeilingCheck; direct callers (the "Publish now"/"Retry" buttons) get
// the ceiling enforced here so a manual click can't blow an account's limit.
export async function publishPostNow(
  postId: string,
  actor: ActingUser,
  opts: {
    claimFrom?: ScheduledPostStatus[];
    bypassCeilingCheck?: boolean;
  } = {},
): Promise<PublishOutcome | null> {
  const before = await getScheduledPost(postId);
  if (!before) throw new Error("Scheduled post not found");
  // Restore target on a skip. Read pre-claim; in the rare race where the
  // status changed between this read and the claim, the worst case is a
  // too-eager restore to "scheduled" — benign (it just retries sooner).
  const priorStatus: ScheduledPostStatus =
    before.status === "failed" ? "failed" : "scheduled";

  if (!opts.bypassCeilingCheck) {
    const integration = await findConnectedIntegration(before.companyId, before.platform);
    const ceiling = integration ? platformCeiling(integration.platform) : null;
    if (integration && ceiling !== null) {
      const used = ceilingUsage(
        await listPublishLogsSince(actor.tenantId, minutesAgo(now(), CEILING_WINDOW_HOURS * 60)),
      );
      if ((used.get(integration.id) ?? 0) >= ceiling) {
        throw new Error(
          `${integration.platform} allows ~${ceiling} posts per 24h per account and "${integration.accountName}" has used them — the queue will publish this automatically when capacity frees.`,
        );
      }
    }
  }

  const claimed = await transitionScheduledPost(actor.tenantId, postId, {
    from: opts.claimFrom ?? ["scheduled", "failed"],
    to: "publishing",
  });
  if (!claimed) return null;

  const history = await listPublishLogsForPosts(actor.tenantId, [postId]);
  const attempt = attemptsSinceRequeue(history).attempts + 1;

  const prior = resolvePriorPublish(history, postId, attempt);
  if (prior) {
    const log = await settleIdempotentPublish(
      actor,
      claimed,
      attempt,
      prior,
      "idempotent — skipped duplicate send",
    );
    return { log, becameDead: false };
  }

  const idemKey = publishIdempotencyKey(postId, attempt);
  let log: PublishLog;
  try {
    log = await attemptScheduledPost(claimed, priorStatus, actor, attempt, {
      idempotencyKey: idemKey,
      lookupSimulatedDetail: () => lookupSimulatedPublish(idemKey),
      onSimulatedPublish: (detail) => registerSimulatedPublish(idemKey, detail),
    });
  } catch (err) {
    // A bug or infra error mid-attempt must not strand the claim in-flight:
    // release it honestly as a counted failure.
    await transitionScheduledPost(actor.tenantId, postId, {
      from: ["publishing"],
      to: "failed",
    });
    log = await appendPublishLog({
      companyId: claimed.companyId,
      platform: claimed.platform,
      scheduledPostId: postId,
      contentId: claimed.contentId,
      status: "failed",
      attempt,
      detail: `Unexpected publisher error: ${String(err)}`,
      actorId: actor.id,
    });
  }

  let becameDead = false;
  if (log.status === "failed" && attempt >= MAX_PUBLISH_ATTEMPTS) {
    becameDead = await deadLetter(actor, claimed, attempt);
  }
  return { log, becameDead };
}

async function deadLetter(
  actor: ActingUser,
  post: ScheduledPost,
  attempts: number,
): Promise<boolean> {
  const rec = await transitionScheduledPost(actor.tenantId, post.id, {
    from: ["failed"],
    to: "dead",
  });
  if (!rec) return false;
  await logAction(actor, "publishing.dead_letter", {
    targetType: "scheduled_post",
    targetId: post.id,
    companyId: post.companyId,
    detail: `${post.platform} post dead-lettered after ${attempts} failed attempts — requeue or cancel it in the Publishing Centre`,
  });
  return true;
}

// ---- The tenant tick (what the cron and "Publish due posts now" run) -----------

export async function processPublishQueue(actor: ActingUser): Promise<QueueCounts> {
  const counts = emptyQueueCounts();
  const { nowIso, today, hhmm } = await queueNowPartsForTenant(actor.tenantId);
  const posts = await listScheduledPosts(actor.tenantId);

  // 1. Recover stale in-flight claims (a worker died mid-send). Counted as a
  //    failed attempt — the platform may or may not have received the post, and
  //    silently re-posting on an unbounded loop is worse than a human reading
  //    the log after MAX attempts. This bookkeeping runs even when automated
  //    publishing is DISABLED: an admin who flips the kill switch while
  //    investigating a crash must still see stuck posts become failed (and
  //    cancellable) instead of frozen in "publishing" forever.
  const staleBefore = minutesAgo(nowIso, STALE_CLAIM_MINUTES);
  const inFlight = posts.filter((p) => p.status === "publishing");
  if (inFlight.length > 0) {
    const staleHistory = await listPublishLogsForPosts(
      actor.tenantId,
      inFlight.map((p) => p.id),
    );
    for (const p of inFlight) {
      try {
        if (p.updatedAt >= staleBefore) continue; // still legitimately in-flight
        const postLogs = staleHistory.filter((l) => l.scheduledPostId === p.id);
        const publishedLog = findPublishedLogForPost(postLogs, p.id);
        const simHit = findSimPublishForPost(p.id);
        if (publishedLog || simHit) {
          const attempt =
            publishedLog?.attempt ??
            attemptsSinceRequeue(postLogs).attempts + 1;
          const prior: PriorPublishEvidence = publishedLog
            ? {
                key:
                  idempotencyKeyFromDetail(publishedLog.detail) ??
                  publishIdempotencyKey(p.id, attempt),
                detail: publishedLog.detail.replace(IDEM_DETAIL_RE, ""),
                attempt: publishedLog.attempt,
                integrationId: publishedLog.integrationId,
              }
            : { key: simHit!.key, detail: simHit!.detail, attempt };
          await settleIdempotentPublish(
            actor,
            p,
            attempt,
            prior,
            "stale-claim recovered — verified prior publish",
          );
          counts.published += 1;
          p.status = "published";
          continue;
        }
        const rec = await transitionScheduledPost(actor.tenantId, p.id, {
          from: ["publishing"],
          to: "failed",
          updatedBefore: staleBefore,
        });
        if (!rec) continue;
        const attempt =
          attemptsSinceRequeue(
            staleHistory.filter((l) => l.scheduledPostId === p.id),
          ).attempts + 1;
        await appendPublishLog({
          companyId: p.companyId,
          platform: p.platform,
          scheduledPostId: p.id,
          contentId: p.contentId,
          status: "failed",
          attempt,
          detail: `Recovered a stale in-flight attempt (worker stopped mid-publish >${STALE_CLAIM_MINUTES}m ago). The platform may or may not have received it — check before requeueing if it dead-letters.`,
          actorId: actor.id,
        });
        counts.failed += 1;
        if (attempt >= MAX_PUBLISH_ATTEMPTS) {
          if (await deadLetter(actor, p, attempt)) counts.dead += 1;
        }
        p.status = "failed"; // keep the local snapshot honest for step 2
      } catch {
        /* one broken row must not abort the recovery of the others */
      }
    }
  }

  if ((await getPublishingControls(actor.tenantId)).automatedPublishingDisabled) {
    // Blanket disable: nothing PUBLISHES (recovery above is bookkeeping only).
    return counts;
  }

  // 2. Select candidates: due scheduled posts + failed posts whose backoff has
  //    elapsed AND whose schedule has arrived — a failed early manual publish
  //    of a future-dated post must NOT be auto-retried ahead of its date.
  const dueScheduled = posts.filter(
    (p) => p.status === "scheduled" && isDue(p, today, hhmm),
  );

  const failedPosts = posts.filter((p) => p.status === "failed");
  const failedHistory = await listPublishLogsForPosts(
    actor.tenantId,
    failedPosts.map((p) => p.id),
  );
  const retryable: ScheduledPost[] = [];
  for (const p of failedPosts) {
    const { attempts, lastFailedAt } = attemptsSinceRequeue(
      failedHistory.filter((l) => l.scheduledPostId === p.id),
    );
    if (attempts >= MAX_PUBLISH_ATTEMPTS) {
      // Legacy/pre-queue failures that already exhausted the budget: park them.
      try {
        if (await deadLetter(actor, p, attempts)) counts.dead += 1;
      } catch {
        /* parked next tick instead */
      }
      continue;
    }
    if (!isDue(p, today, hhmm)) continue;
    if (!lastFailedAt || retryEligibleAt(attempts, lastFailedAt) <= nowIso) {
      retryable.push(p);
    }
  }

  // 3. Publish in schedule order, obeying each account's platform ceiling.
  //    Every candidate is individually fenced: one pathological row (broken
  //    integration read, log-write error) skips THAT post, never the tick.
  //    The ceiling count is check-then-act: two OVERLAPPING ticks could each
  //    admit a post and overshoot an account's ceiling by the overlap width.
  //    Accepted: ticks are per-tenant sequential, the ceilings are set below
  //    the platforms' hard limits, and the platform's own enforcement is the
  //    backstop. The atomic drop-in (mirroring ratelimit.ts) is a Supabase
  //    counter RPC if real overlap ever materialises.
  const used = ceilingUsage(
    await listPublishLogsSince(
      actor.tenantId,
      minutesAgo(nowIso, CEILING_WINDOW_HOURS * 60),
    ),
  );
  const candidates = [...dueScheduled, ...retryable].sort((a, b) =>
    (a.scheduledDate + (a.scheduledTime ?? "")).localeCompare(
      b.scheduledDate + (b.scheduledTime ?? ""),
    ),
  );
  for (const post of candidates) {
    try {
      const integration = await findConnectedIntegration(post.companyId, post.platform);
      const ceiling = integration ? platformCeiling(integration.platform) : null;
      if (integration && ceiling !== null && (used.get(integration.id) ?? 0) >= ceiling) {
        counts.deferred += 1;
        continue; // stays queued — goes out when the 24h window frees capacity
      }
      const outcome = await publishPostNow(post.id, actor, {
        claimFrom: [post.status as "scheduled" | "failed"],
        bypassCeilingCheck: true, // the tick already checked against `used`
      });
      if (!outcome) {
        counts.skipped += 1; // lost the claim race — someone else has it
        continue;
      }
      if (outcome.log.status === "published") {
        counts.published += 1;
        if (integration) used.set(integration.id, (used.get(integration.id) ?? 0) + 1);
      } else if (outcome.log.status === "failed") {
        counts.failed += 1;
        if (outcome.becameDead) counts.dead += 1;
      } else {
        counts.skipped += 1;
      }
    } catch {
      counts.skipped += 1; // this post's turn comes again next tick
    }
  }
  return counts;
}

// Back-compat entry point (Publishing Centre "Publish due posts now" + the
// scheduler tick): the queue IS the due-post publisher now.
export async function publishDuePosts(actor: ActingUser): Promise<QueueCounts> {
  return processPublishQueue(actor);
}
