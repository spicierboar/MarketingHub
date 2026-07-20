"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import {
  appendPublishLog,
  createIntegration,
  getCampaign,
  getCompany,
  getIntegration,
  getPublishingControls,
  getScheduledPost,
  transitionScheduledPost,
  updateIntegration,
  updatePublishingControls,
  updateTenant,
  listConnectInvites,
} from "@/lib/db";
import { assertAdminCompanyAccess, canAccessCompany, requireAdmin, requireTenantOwner } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { encryptToken } from "@/lib/crypto";
import { resolveOrigin } from "@/lib/origin";
import {
  authorizeUrl,
  isOAuthPlatform,
  oauthConfigured,
  OAUTH_NONCE_COOKIE,
  signState,
} from "@/lib/oauth";
import {
  publishDuePosts,
  publishPostNow,
  reconcileDeliveryUnknown,
  retryFailedPosts,
} from "@/lib/publish-queue";
import { isValidIanaTimezone, SCHEDULE_TIMEZONE_OPTIONS } from "@/lib/tenant-timezone";
import {
  bulkCreateConnectInvites,
  connectInviteUrl,
} from "@/lib/connect-invites";
import { requestSocialConnectInvites } from "@/lib/onboarding-social-connect";
import { sendEmail } from "@/lib/email";
import { V1_CONNECT_PLATFORMS, type V1ConnectPlatform } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

// Begin the shared-platform OAuth consent flow (T5). Admin-only, tenant-pinned:
// the token that comes back can only ever attach to a company in THIS admin's
// tenant. The signed state binds tenant/company/user; a nonce cookie adds CSRF.
export async function startOAuthConnectAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const platform = text(formData, "platform");
  const accountName = text(formData, "accountName");
  if (!companyId || !platform || !accountName) {
    throw new Error("Company, platform and account name are required.");
  }
  if (!isOAuthPlatform(platform) || !oauthConfigured(platform)) {
    throw new Error("That platform is not available for OAuth connect.");
  }
  // Tenant pin: admin + company must belong to the acting user's tenant.
  const user = await assertAdminCompanyAccess(companyId);

  const nonce = randomBytes(16).toString("hex");
  const state = signState({
    tenantId: user.tenantId,
    companyId,
    platform,
    accountName,
    userId: user.id,
    nonce,
    issuedAt: Date.now(),
  });
  const jar = await cookies();
  jar.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 min to complete consent
  });

  const url = authorizeUrl(platform, state, `${await requestOrigin()}/api/oauth/callback`);
  if (!url) throw new Error("OAuth is not configured for that platform.");
  await logAction(user, "integration.oauth_started", {
    targetType: "integration",
    companyId,
    detail: `${platform}: ${accountName}`,
  });
  redirect(url);
}
function refresh() {
  revalidatePath("/publishing");
  revalidatePath("/calendar");
  revalidatePath("/companies");
}

// Admin-only integration management (§31).
export async function connectIntegrationAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const platform = text(formData, "platform");
  const accountName = text(formData, "accountName");
  const token = text(formData, "token");
  if (!companyId || !platform || !accountName || !token) {
    throw new Error("Company, platform, account name and token are required.");
  }
  // Tenant pin: admin + company must belong to the acting user's tenant.
  const user = await assertAdminCompanyAccess(companyId);

  const integration = await createIntegration({
    companyId,
    platform,
    accountName,
    encryptedToken: encryptToken(token),
    tokenLastFour: token.slice(-4),
    status: "connected",
    connectedById: user.id,
  });
  await logAction(user, "integration.connected", {
    targetType: "integration",
    targetId: integration.id,
    companyId,
    detail: `${platform}: ${accountName} (token ••••${integration.tokenLastFour})`,
  });
  refresh();
}

export async function disconnectIntegrationAction(formData: FormData) {
  const user = await requireAdmin();
  const integrationId = text(formData, "integrationId");
  const integration = await getIntegration(integrationId);
  if (!integration) throw new Error("Integration not found");
  // Tenant pin: the integration's company must belong to the acting user's tenant.
  if (!(await canAccessCompany(user, integration.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }

  await updateIntegration(integrationId, { status: "disconnected" });
  await logAction(user, "integration.disconnected", {
    targetType: "integration",
    targetId: integrationId,
    companyId: integration.companyId,
    detail: `${integration.platform}: ${integration.accountName}`,
  });
  refresh();
}

// Kill switch & freezes (§32) — every change is audited.
export async function toggleControlAction(formData: FormData) {
  const user = await requireAdmin();
  const control = text(formData, "control") as
    | "freezeAll"
    | "automatedPublishingDisabled"
    | "socialRepliesDisabled";
  if (
    !["freezeAll", "automatedPublishingDisabled", "socialRepliesDisabled"].includes(control)
  ) {
    throw new Error("Unknown control");
  }
  const current = (await getPublishingControls(user.tenantId))[control];
  await updatePublishingControls(user.tenantId, { [control]: !current });
  await logAction(user, `publishing.${control}_${!current ? "enabled" : "disabled"}`, {
    detail: `${control} → ${!current}`,
  });
  refresh();
}

export async function freezeScopeAction(formData: FormData) {
  const user = await requireAdmin();
  const scope = text(formData, "scope") as "company" | "platform" | "campaign";
  const value = text(formData, "value");
  const remove = formData.get("remove") === "true";
  if (!value) return;

  // Tenant pin: when freezing by company/campaign, the target must belong to
  // the acting user's tenant (platform scope is a plain string, no pin needed).
  if (!remove) {
    if (scope === "company") {
      if (!(await canAccessCompany(user, value))) {
        throw new Error("Forbidden: no access to this company");
      }
    } else if (scope === "campaign") {
      const campaign = await getCampaign(value);
      if (!campaign || !(await canAccessCompany(user, campaign.companyId))) {
        throw new Error("Forbidden: no access to this company");
      }
    }
  }

  const controls = await getPublishingControls(user.tenantId);
  const keyMap = {
    company: "frozenCompanyIds",
    platform: "frozenPlatforms",
    campaign: "frozenCampaignIds",
  } as const;
  const listKey = keyMap[scope];
  if (!listKey) throw new Error("Unknown scope");
  const current = controls[listKey];
  const next = remove
    ? current.filter((v) => v !== value)
    : [...new Set([...current, value])];
  await updatePublishingControls(user.tenantId, { [listKey]: next });
  await logAction(user, remove ? "publishing.unfrozen" : "publishing.frozen", {
    detail: `${scope}: ${value}`,
    companyId: scope === "company" ? value : undefined,
  });
  refresh();
}

// "Publish due posts now" — runs the same queue tick as the production cron.
// Optional companyId scopes the tick to one client (company workspace).
export async function publishDueAction(formData?: FormData) {
  const user = await requireAdmin();
  const companyId = formData
    ? String(formData.get("companyId") || "").trim() || undefined
    : undefined;
  if (companyId && !(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const counts = await publishDuePosts(user, companyId ? { companyId } : undefined);
  await logAction(user, "publishing.run", {
    companyId,
    detail: `published ${counts.published}, failed ${counts.failed}, skipped ${counts.skipped}, unknown ${counts.unknown}, deferred ${counts.deferred} (platform ceilings), dead-lettered ${counts.dead}${companyId ? ` · company ${companyId}` : ""}`,
  });
  refresh();
}

/** Retry only failed records whose backoff has elapsed; never runs scheduled work. */
export async function retryFailedPublishingAction(formData?: FormData) {
  const user = await requireAdmin();
  const companyId = formData
    ? String(formData.get("companyId") || "").trim() || undefined
    : undefined;
  if (companyId && !(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const counts = await retryFailedPosts(
    user,
    companyId ? { companyId } : undefined,
  );
  await logAction(user, "publishing.retry_failed", {
    companyId,
    detail: `retry-only: published ${counts.published}, failed ${counts.failed}, skipped ${counts.skipped}, unknown ${counts.unknown}, deferred ${counts.deferred}, dead-lettered ${counts.dead}`,
  });
  refresh();
}

// Retry one failed post (or publish a single scheduled post immediately).
// Attempt numbers are derived from the publish log by the queue — the queue
// also enforces the platform's daily ceiling and the atomic claim, so a manual
// click can neither double-post nor blow an account's limit.
export async function publishNowAction(formData: FormData) {
  const user = await requireAdmin();
  const postId = text(formData, "postId");
  const post = await getScheduledPost(postId);
  if (!post) throw new Error("Scheduled post not found");
  // Tenant pin: the post's company must belong to the acting user's tenant.
  if (!(await canAccessCompany(user, post.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const outcome = await publishPostNow(postId, user);
  if (!outcome) {
    throw new Error(
      "This post is already being published (or is no longer publishable).",
    );
  }
  refresh();
}

export async function reconcileUnknownDeliveryAction(formData: FormData) {
  const user = await requireAdmin();
  const postId = text(formData, "postId");
  const outcome = text(formData, "outcome");
  const evidence = text(formData, "evidence");
  if (!["delivered", "not_delivered"].includes(outcome) || !evidence) {
    throw new Error("A valid outcome and provider evidence are required.");
  }
  const post = await getScheduledPost(postId);
  if (!post || !(await canAccessCompany(user, post.companyId))) {
    throw new Error("Unknown delivery not found.");
  }
  const reconciled = await reconcileDeliveryUnknown(
    user,
    postId,
    outcome as "delivered" | "not_delivered",
    evidence,
  );
  if (!reconciled) {
    throw new Error("This delivery is no longer awaiting reconciliation.");
  }
  refresh();
}

// Return a dead-lettered post to the queue. The "requeued" log marker resets
// the derived attempt count, so the post gets a fresh retry budget — history
// stays append-only and the intervention is visible in the publishing log.
export async function requeueDeadPostAction(formData: FormData) {
  const user = await requireAdmin();
  const postId = text(formData, "postId");
  const post = await getScheduledPost(postId);
  if (!post) throw new Error("Scheduled post not found");
  // Tenant pin: the post's company must belong to the acting user's tenant.
  if (!(await canAccessCompany(user, post.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const rec = await transitionScheduledPost(user.tenantId, postId, {
    from: ["dead"],
    to: "scheduled",
  });
  if (!rec) throw new Error("Only dead-lettered posts can be requeued.");
  await appendPublishLog({
    companyId: post.companyId,
    platform: post.platform,
    scheduledPostId: postId,
    contentId: post.contentId,
    status: "requeued",
    attempt: 0,
    detail: `Re-queued from the dead-letter queue by ${user.email} — retry budget reset`,
    actorId: user.id,
  });
  await logAction(user, "publishing.requeued", {
    targetType: "scheduled_post",
    targetId: postId,
    companyId: post.companyId,
    detail: `${post.platform} post returned to the queue`,
  });
  refresh();
}

// Per-tenant schedule timezone — OWNER-only, session tenant pinned.
export async function saveScheduleTimezoneAction(formData: FormData) {
  const user = await requireTenantOwner();
  const raw = String(formData.get("timezone") || "").trim();
  const timezone = raw === "" ? undefined : raw;
  if (timezone !== undefined && !isValidIanaTimezone(timezone)) {
    throw new Error("Invalid timezone. Pick a zone from the list or clear the field.");
  }
  if (
    timezone !== undefined &&
    !SCHEDULE_TIMEZONE_OPTIONS.some((o) => o.value === timezone)
  ) {
    throw new Error("Timezone must be selected from the supported list.");
  }
  await updateTenant(user.tenantId, { timezone });
  await logAction(user, "tenant.schedule_timezone_saved", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: timezone ?? "cleared (platform fallback)",
  });
  revalidatePath("/publishing");
}

// Bulk one-time-connect invites — admin-only; shared helper with client / AI.
export async function createBulkConnectInvitesAction(formData: FormData) {
  const user = await requireAdmin();
  const companyIds = formData.getAll("companyId").map((v) => String(v).trim()).filter(Boolean);
  const platforms = formData
    .getAll("platform")
    .map((v) => String(v).trim())
    .filter((v): v is V1ConnectPlatform =>
      V1_CONNECT_PLATFORMS.includes(v as V1ConnectPlatform),
    );
  const sendEmailFlag = formData.get("sendEmail") === "true";
  if (companyIds.length === 0 || platforms.length === 0) {
    throw new Error("Select at least one company and one platform.");
  }
  for (const companyId of companyIds) {
    if (!(await canAccessCompany(user, companyId))) {
      throw new Error("Forbidden: no access to one of the selected companies");
    }
  }

  let createdTotal = 0;
  let skippedTotal = 0;
  let emailsAttempted = 0;
  for (const companyId of companyIds) {
    const company = await getCompany(companyId);
    const result = await requestSocialConnectInvites({
      agencyTenantId: user.tenantId,
      companyId,
      platforms,
      invitedBy: user,
      source: "staff",
      recipientEmail: company?.profile.approvalContact?.trim() || undefined,
      emailInvites: sendEmailFlag,
    });
    createdTotal += result.createdCount;
    skippedTotal += result.skippedCount;
    emailsAttempted += result.emailsAttempted;
  }

  await logAction(user, "integration.bulk_invites_created", {
    detail: `created ${createdTotal}, skipped ${skippedTotal}${emailsAttempted ? `, emailed ${emailsAttempted}` : ""}`,
  });
  refresh();
}

export async function revokeConnectInviteAction(formData: FormData) {
  const user = await requireAdmin();
  const inviteId = text(formData, "inviteId");
  const { getConnectInvite, updateConnectInvite } = await import("@/lib/db");
  const invite = await getConnectInvite(inviteId);
  if (!invite || invite.tenantId !== user.tenantId) {
    throw new Error("Invite not found");
  }
  if (!(await canAccessCompany(user, invite.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  if (invite.status !== "pending") throw new Error("Only pending invites can be revoked.");
  await updateConnectInvite(inviteId, { status: "revoked" });
  await logAction(user, "integration.invite_revoked", {
    targetType: "connect_invite",
    targetId: inviteId,
    companyId: invite.companyId,
    detail: `${invite.platform}`,
  });
  refresh();
}
