// Publishing engine (Phase 7, §31–32; queue attempt layer since the scale pass).
//
// Eligibility chain for every attempt: kill-switch controls → connected
// integration → content still approved+scheduled → connector. The connector is
// SIMULATED (drop-in point for the real platform SDKs — see simulateConnector)
// so every path is testable with zero external accounts. Real connectors:
// decryptToken(integration.encryptedToken) and call the platform API.
//
// Unapproved content can never publish: posts only exist for approved content,
// and content status is re-checked at publish time.
//
// Queue split (scale pass): this module publishes ONE already-claimed attempt
// (attemptScheduledPost). Claiming, retry/backoff, platform ceilings and the
// dead-letter queue live in src/lib/publish-queue.ts — start there to follow
// how a due post actually reaches this file.

import {
  advanceRequest,
  appendPublishLog,
  findConnectedIntegration,
  getCompany,
  getContent,
  getPublishingControls,
  getSecuritySettings,
  isUnderLegalHold,
  listPublishLogs,
  transitionScheduledPost,
  updateCompany,
  updateCampaignItem,
  updateContent,
  updateScheduledPost,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { assetsBlockingChannel } from "@/lib/assets";
import {
  dispatchPublish,
  resolvePublishingMode,
  type ConnectorResult,
  type PublishingMode,
} from "@/lib/publishing-connectors";
import { recordProviderFailure } from "@/lib/security-slice";
import { now } from "@/lib/utils";
import {
  isScheduledDeadlineError,
  throwIfScheduledAborted,
} from "@/lib/scheduled-execution";
import {
  refreshFailedPaymentPause,
  serviceOperationsAllowed,
} from "@/lib/managed-service-billing";
import type {
  ActingUser,
  PublishingIntegration,
  PublishLog,
  ScheduledPost,
  ScheduledPostStatus,
  SocialResponseDraft,
  User,
} from "@/lib/types";

// Why a publish attempt is blocked by the freeze/kill switch (§32), if at all.
export async function controlsBlockReason(args: {
  companyId: string;
  platform: string;
  campaignId?: string | null;
  kind: "post" | "reply";
}): Promise<string | null> {
  // Per-tenant panels (T1): derive the tenant from the company being published.
  const company = await getCompany(args.companyId);
  if (!company) return "Unknown company";
  const serviceBilling = company.profile.managedService?.serviceBilling;
  const checkedAt = now();
  if (
    serviceBilling &&
    !serviceOperationsAllowed(serviceBilling, checkedAt)
  ) {
    const managedService = company.profile.managedService;
    if (managedService && serviceBilling.status === "past_due_grace") {
      await updateCompany(company.id, {
        profile: {
          ...company.profile,
          managedService: {
            ...managedService,
            serviceBilling: refreshFailedPaymentPause(serviceBilling, checkedAt),
          },
        },
      });
    }
    return "Managed service is paused after the failed-payment grace period";
  }
  // Phase 10 security modes override everything (§33 crisis, §56 sandbox).
  const s = await getSecuritySettings(company.tenantId);
  if (s.crisisMode) return "Crisis Communications Mode is active — publishing is frozen";
  if (s.sandboxMode) return "Sandbox/training mode is active — publishing is disabled";
  const c = await getPublishingControls(company.tenantId);
  if (c.freezeAll) return "Publishing freeze is active (all posts paused)";
  if (
    args.kind === "post" &&
    c.automatedPublishingDisabled &&
    resolvePublishingMode().kind !== "simulate"
  ) {
    return "Automated publishing is disabled";
  }
  if (args.kind === "reply" && c.socialRepliesDisabled) {
    return "Social replies are disabled";
  }
  if (c.frozenCompanyIds.includes(args.companyId)) {
    return "This company's publishing is paused";
  }
  if (
    c.frozenPlatforms.some(
      (p) => p.toLowerCase() === args.platform.toLowerCase(),
    )
  ) {
    return `${args.platform} publishing is paused`;
  }
  if (args.campaignId && c.frozenCampaignIds.includes(args.campaignId)) {
    return "This campaign is paused";
  }
  return null;
}

// Send to the platform. In production (PUBLISHING_LIVE=true + a configured
// OAuth app) dispatchPublish makes the real API call with decryptToken; when it
// returns null we use the deterministic SIMULATOR below, so every path is
// testable with zero external accounts. A body containing "[simulate-failure]"
// fails deterministically so the failure monitor and retry path are demonstrable.
async function sendToPlatform(
  integration: PublishingIntegration,
  body: string,
  sim?: {
    mode?: PublishingMode;
    signal?: AbortSignal;
    dispatch?: typeof dispatchPublish;
    idempotencyKey?: string;
    lookup?: () => string | undefined;
    onPublish?: (detail: string) => void;
    tenantId?: string;
  },
): Promise<ConnectorResult> {
  const mode = sim?.mode ?? resolvePublishingMode();
  if (mode.kind === "simulate") {
    const cached = sim?.lookup?.();
    if (cached) {
      return {
        ok: true,
        detail: `Already published (simulated idempotent): ${cached}`,
      };
    }
    const result = simulateConnector(integration, body, sim?.idempotencyKey);
    if (result.ok && sim?.onPublish) sim.onPublish(result.detail);
    return result;
  }
  if (mode.kind === "blocked") {
    return { ok: false, blocked: true, detail: mode.detail };
  }
  const live = await (sim?.dispatch ?? dispatchPublish)(integration, body, {
    signal: sim?.signal,
    idempotencyKey: sim?.idempotencyKey,
  });
  if (!live.ok && !live.blocked && sim?.tenantId) {
    recordProviderFailure("publishing", live.detail, sim.tenantId);
  }
  return live;
}

function hashToBase36(input: string): string {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 1_677_761_9);
  }
  return (h >>> 0).toString(36);
}

function simulateConnector(
  integration: PublishingIntegration,
  body: string,
  idempotencyKey?: string,
): { ok: boolean; detail: string } {
  if (body.includes("[simulate-failure]")) {
    return {
      ok: false,
      detail: `Platform API error (simulated): ${integration.platform} rejected the post`,
    };
  }
  const simId = idempotencyKey
    ? `${integration.platform.slice(0, 2).toLowerCase()}_${hashToBase36(idempotencyKey)}`
    : `${integration.platform.slice(0, 2).toLowerCase()}_${Date.now().toString(36)}`;
  return {
    ok: true,
    detail: `Posted to ${integration.accountName} (simulated id: ${simId})`,
  };
}

export async function finalizeSuccessfulDelivery(args: {
  post: ScheduledPost;
  actor: ActingUser;
  attempt: number;
  detail: string;
  integrationId?: string;
  idempotencyKey?: string;
  from: ScheduledPostStatus[];
}): Promise<PublishLog> {
  const advanced = await transitionScheduledPost(
    args.actor.tenantId,
    args.post.id,
    {
      from: args.from,
      to: "published",
    },
  );
  const content = await getContent(args.post.contentId);
  const demoted =
    !content || !["scheduled", "published"].includes(content.status);
  const note = !advanced
    ? " (the post changed state before finalization; provider delivery still stands)"
    : demoted
      ? " (content was demoted before finalization; app workflow records left untouched)"
      : "";
  if (advanced && !demoted && content) {
    await updateContent(content.id, { status: "published" });
    if (content.campaignItemId) {
      await updateCampaignItem(content.campaignItemId, {
        status: "published",
      });
    }
    if (content.requestId) {
      await advanceRequest(
        content.requestId,
        "published",
        args.actor.id,
        `Published to ${args.post.platform}`,
      );
    }
  }
  await logAction(args.actor, "content.published", {
    targetType: "scheduled_post",
    targetId: args.post.id,
    companyId: args.post.companyId,
    detail: `${content?.title ?? args.post.contentId} → ${args.detail}${note}`,
  });
  return appendPublishLog({
    companyId: args.post.companyId,
    platform: args.post.platform,
    integrationId: args.integrationId,
    scheduledPostId: args.post.id,
    contentId: args.post.contentId,
    status: "published",
    attempt: args.attempt,
    detail: args.idempotencyKey
      ? `[idem:${args.idempotencyKey}] ${args.detail}${note}`
      : args.detail + note,
    actorId: args.actor.id,
  });
}

// One publish ATTEMPT of a post the queue has already CLAIMED (status
// "publishing"). This function owns the eligibility chain, the platform send
// and honest logging; it does NOT claim, count attempts or dead-letter — those
// queue semantics live in src/lib/publish-queue.ts (publishPostNow /
// processPublishQueue), which is the only caller.
//
// Release semantics (every exit uses a GUARDED transition from "publishing",
// so a concurrent operator cancel always wins and is never overwritten):
//   • transient skip (freeze, legal hold, rights gap) → restore priorStatus:
//     no retry attempt is consumed, the post just waits.
//   • content no longer publishable → the post CANCELS itself — the demotion
//     sweep can't touch an in-flight row, so the in-flight row honours the
//     demotion the moment it sees it (otherwise an edited body's stale
//     schedule would survive and double-publish after re-approval).
//   • failure → "failed" (the queue settles dead-letter).
//   • live response lost after dispatch starts → "delivery_unknown"; an
//     operator must reconcile provider evidence before any retry.
//   • success → "published"; everything AFTER a successful platform send is
//     bookkeeping and must NEVER surface as a retryable failure — a retry
//     would post the same content to the platform twice.
export async function attemptScheduledPost(
  claimed: ScheduledPost,
  priorStatus: ScheduledPostStatus,
  actor: ActingUser,
  attempt: number,
  opts?: {
    publishMode?: PublishingMode;
    signal?: AbortSignal;
    dispatchPublishOverride?: typeof dispatchPublish;
    idempotencyKey?: string;
    lookupSimulatedDetail?: () => string | undefined;
    onSimulatedPublish?: (detail: string) => void;
  },
): Promise<PublishLog> {
  const postId = claimed.id;
  const content = await getContent(claimed.contentId);

  const CANCELLED_MID_FLIGHT = " (the post was cancelled mid-flight; the cancellation stands)";

  const tagDetail = (detail: string) =>
    opts?.idempotencyKey ? `[idem:${opts.idempotencyKey}] ${detail}` : detail;

  const appendLog = (status: PublishLog["status"], detail: string, integrationId?: string) =>
    appendPublishLog({
      companyId: claimed.companyId,
      platform: claimed.platform,
      integrationId,
      scheduledPostId: postId,
      contentId: claimed.contentId,
      status,
      attempt,
      detail: tagDetail(detail),
      actorId: actor.id,
    });

  const settle = async (
    status: "failed" | "skipped",
    detail: string,
    opts: { cancelPost?: boolean } = {},
  ): Promise<PublishLog> => {
    const target: ScheduledPostStatus =
      status === "failed" ? "failed" : opts.cancelPost ? "cancelled" : priorStatus;
    const released = await transitionScheduledPost(actor.tenantId, postId, {
      from: ["publishing"],
      to: target,
    });
    if (released && opts.cancelPost) {
      await logAction(actor, "publishing.cancelled_in_flight", {
        targetType: "scheduled_post",
        targetId: postId,
        companyId: claimed.companyId,
        detail: `${claimed.platform} post cancelled at publish time: ${detail}`,
      });
    }
    return await appendLog(status, released ? detail : detail + CANCELLED_MID_FLIGHT);
  };

  const markDeliveryUnknown = async (detail: string): Promise<PublishLog> => {
    const changed = await transitionScheduledPost(actor.tenantId, postId, {
      from: ["publishing"],
      to: "delivery_unknown",
    });
    if (changed) {
      await updateScheduledPost(postId, {
        deliveryIdempotencyKey: opts?.idempotencyKey ?? null,
        deliveryUnknownAt: now(),
        deliveryUnknownReason: detail,
      });
    }
    return appendLog(
      "skipped",
      `${detail}. Delivery outcome is unknown; reconciliation is required before retry.`,
      integration?.id,
    );
  };

  if (opts?.signal?.aborted) {
    return settle("skipped", "Scheduled publishing deadline reached before send");
  }

  // Content must still be approved-and-scheduled (or published for an extra
  // platform) — a demoted or rejected item can never slip out, and its
  // schedule must not survive the demotion either (see release semantics).
  if (!content || !["scheduled", "published"].includes(content.status)) {
    return settle(
      "skipped",
      `Content is no longer publishable (status: ${content?.status ?? "missing"}) — post cancelled`,
      { cancelPost: true },
    );
  }
  // §54 — never publish (overwrite) legal-held content.
  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    return settle("skipped", "Content is under legal hold");
  }
  // §46 — re-check referenced creative rights at publish time: a licence may
  // have expired or a consent been withdrawn since scheduling.
  const assetBlocks = await assetsBlockingChannel(content.assetIds, claimed.platform);
  if (assetBlocks.length > 0) {
    return settle(
      "skipped",
      `Creative rights don't permit ${claimed.platform}: ${assetBlocks
        .map((b) => `"${b.asset.name}" (${b.reason})`)
        .join("; ")}`,
    );
  }
  const campaignId = content.campaignId ?? null;
  const blocked = await controlsBlockReason({
    companyId: claimed.companyId,
    platform: claimed.platform,
    campaignId,
    kind: "post",
  });
  if (blocked) return settle("skipped", blocked);

  const integration = await findConnectedIntegration(claimed.companyId, claimed.platform);
  if (!integration) {
    return settle(
      "failed",
      `No connected ${claimed.platform} integration for this company`,
    );
  }

  let result: Awaited<ReturnType<typeof sendToPlatform>>;
  try {
    throwIfScheduledAborted(
      opts?.signal
        ? { signal: opts.signal }
        : undefined,
    );
    result = await sendToPlatform(integration, content.body, {
      mode: opts?.publishMode,
      signal: opts?.signal,
      dispatch: opts?.dispatchPublishOverride,
      idempotencyKey: opts?.idempotencyKey,
      lookup: opts?.lookupSimulatedDetail,
      onPublish: opts?.onSimulatedPublish,
      tenantId: actor.tenantId,
    });
  } catch (error) {
    if (opts?.signal?.aborted || isScheduledDeadlineError(error)) {
      const mode = opts?.publishMode ?? resolvePublishingMode();
      if (mode.kind === "live") {
        return markDeliveryUnknown(
          "Live dispatch began but its response was lost at the scheduler deadline",
        );
      }
      return settle(
        "skipped",
        "Scheduled publishing deadline reached before completion",
      );
    }
    throw error;
  }
  if (result.blocked) {
    return settle("skipped", result.detail);
  }
  if (result.deliveryUnknown) {
    return markDeliveryUnknown(result.detail);
  }
  if (!result.ok) {
    const log = await settle("failed", result.detail);
    await logAction(actor, "publishing.failed", {
      targetType: "scheduled_post",
      targetId: postId,
      companyId: claimed.companyId,
      detail: `${claimed.platform} attempt ${attempt}: ${result.detail}`,
    });
    return log;
  }

  // ---- The platform send SUCCEEDED. From here on, nothing may throw out of
  // this function: publishPostNow's catch would record a failed attempt and
  // the queue would eventually POST THE SAME CONTENT AGAIN.
  try {
    return await finalizeSuccessfulDelivery({
      post: claimed,
      actor,
      attempt,
      detail: result.detail,
      integrationId: integration.id,
      idempotencyKey: opts?.idempotencyKey,
      from: ["publishing"],
    });
  } catch (err) {
    // Bookkeeping failed AFTER a successful send. Pin the row as published
    // (best effort) and record what we can — never let this look retryable.
    const detail = `${result.detail} (bookkeeping error after a SUCCESSFUL send: ${String(err)})`;
    try {
      await transitionScheduledPost(actor.tenantId, postId, {
        from: ["publishing"],
        to: "published",
      });
    } catch {
      /* stale-claim recovery will surface it; the log below records the truth */
    }
    try {
      return await appendLog("published", detail, integration.id);
    } catch {
      // Even the log write failed — return an unpersisted record so the
      // caller still counts a publish; the post IS live on the platform.
      return {
        id: `pl_unrecorded_${postId}`,
        companyId: claimed.companyId,
        platform: claimed.platform,
        integrationId: integration.id,
        scheduledPostId: postId,
        contentId: claimed.contentId,
        status: "published",
        attempt,
        detail,
        actorId: actor.id,
        createdAt: now(),
      };
    }
  }
}

// Publish an approved social reply (§35: publish only after approval).
export async function publishSocialReply(
  draft: SocialResponseDraft,
  actor: User,
): Promise<PublishLog> {
  if (draft.status !== "approved") {
    throw new Error("Only approved replies can be published.");
  }
  // §54 — never publish a legal-held reply (content or company scope).
  if (await isUnderLegalHold("social", draft.id, draft.companyId)) {
    return await appendPublishLog({
      companyId: draft.companyId,
      platform: draft.platform,
      socialResponseId: draft.id,
      status: "skipped",
      attempt: 1,
      detail: "Reply is under legal hold",
      actorId: actor.id,
    });
  }
  // Attempt number derives from prior attempts for this reply, so retries
  // are honestly numbered in the append-only log.
  const draftCompany = await getCompany(draft.companyId);
  const attempt = draftCompany
    ? (await listPublishLogs(draftCompany.tenantId)).filter(
        (l) => l.socialResponseId === draft.id,
      ).length + 1
    : 1;
  const blocked = await controlsBlockReason({
    companyId: draft.companyId,
    platform: draft.platform,
    kind: "reply",
  });
  if (blocked) {
    return await appendPublishLog({
      companyId: draft.companyId,
      platform: draft.platform,
      socialResponseId: draft.id,
      status: "skipped",
      attempt,
      detail: blocked,
      actorId: actor.id,
    });
  }
  const integration = await findConnectedIntegration(draft.companyId, draft.platform);
  if (!integration) {
    return await appendPublishLog({
      companyId: draft.companyId,
      platform: draft.platform,
      socialResponseId: draft.id,
      status: "failed",
      attempt,
      detail: `No connected ${draft.platform} integration for this company`,
      actorId: actor.id,
    });
  }
  const result = await sendToPlatform(integration, draft.draftResponse);
  return await appendPublishLog({
    companyId: draft.companyId,
    platform: draft.platform,
    integrationId: integration.id,
    socialResponseId: draft.id,
    status: result.ok ? "published" : "failed",
    attempt,
    detail: result.detail,
    actorId: actor.id,
  });
}
