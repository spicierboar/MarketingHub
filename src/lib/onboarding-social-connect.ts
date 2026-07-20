/**
 * Social OAuth connect invites — shared by onboarding, staff Publishing, client
 * self-serve adds, and system/AI automation. Never collects passwords.
 *
 * Rules:
 * - At signup: only platforms implied by the chosen package channels.
 * - Later (client): may pick any v1 platform; tier must include that channel or
 *   they must upgrade (Ask us / agency-managed package change).
 * - Staff Publishing may still invite any platform (ops override).
 * - System/AI uses the same tier check as the client.
 */

import { logAction } from "@/lib/audit";
import {
  bulkCreateConnectInvites,
  connectInviteUrl,
  isV1ConnectPlatform,
} from "@/lib/connect-invites";
import {
  findConnectedIntegration,
  getCompany,
  getTenant,
  listConnectInvites,
  updateConnectInvite,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { resolveOrigin } from "@/lib/origin";
import { systemAutopilotActor } from "@/lib/managed-service/autopilot-approvals";
import {
  V1_CONNECT_PLATFORMS,
  type ActingUser,
  type Company,
  type Tenant,
  type V1ConnectPlatform,
} from "@/lib/types";
import { headers } from "next/headers";

/** Map package channel keys → v1 connect platform labels. */
const CHANNEL_TO_PLATFORM: Record<string, V1ConnectPlatform> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  "google business profile": "Google Business Profile",
  google_business: "Google Business Profile",
  tiktok: "TikTok",
};

export type SocialConnectInviteSource =
  | "onboarding_plan"
  | "staff"
  | "client"
  | "system_ai";

export function connectPlatformsFromPackageChannels(
  channels: string[] | undefined | null,
): V1ConnectPlatform[] {
  const out = new Set<V1ConnectPlatform>();
  for (const raw of channels ?? []) {
    const key = raw.trim().toLowerCase();
    const mapped = CHANNEL_TO_PLATFORM[key];
    if (mapped) out.add(mapped);
    if (isV1ConnectPlatform(raw.trim())) {
      out.add(raw.trim() as V1ConnectPlatform);
    }
  }
  return V1_CONNECT_PLATFORMS.filter((p) => out.has(p));
}

/** Platforms the company's current marketing package entitles them to connect. */
export function connectPlatformsAllowedForCompany(
  company: Pick<Company, "profile">,
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
): V1ConnectPlatform[] {
  const pkg = resolveCompanyPackage(company, tenant);
  return connectPlatformsFromPackageChannels(pkg.channels);
}

export function isConnectPlatformEntitled(
  company: Pick<Company, "profile">,
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
  platform: V1ConnectPlatform,
): boolean {
  return connectPlatformsAllowedForCompany(company, tenant).includes(platform);
}

export function partitionConnectPlatformsByEntitlement(
  company: Pick<Company, "profile">,
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
  platforms: V1ConnectPlatform[],
): { entitled: V1ConnectPlatform[]; upgradeRequired: V1ConnectPlatform[] } {
  const allowed = new Set(connectPlatformsAllowedForCompany(company, tenant));
  const entitled: V1ConnectPlatform[] = [];
  const upgradeRequired: V1ConnectPlatform[] = [];
  for (const platform of platforms) {
    if (allowed.has(platform)) entitled.push(platform);
    else upgradeRequired.push(platform);
  }
  return { entitled, upgradeRequired };
}

/** Client / AI: reject platforms not on the paid package tier. */
export function assertConnectPlatformsEntitled(
  company: Pick<Company, "profile">,
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
  platforms: V1ConnectPlatform[],
): void {
  const { upgradeRequired } = partitionConnectPlatformsByEntitlement(
    company,
    tenant,
    platforms,
  );
  if (upgradeRequired.length === 0) return;
  const names = upgradeRequired.join(", ");
  throw new Error(
    `${names} ${upgradeRequired.length === 1 ? "is" : "are"} not included on your current marketing package. Ask us to upgrade your plan before connecting.`,
  );
}

/** Scheduled-post / publish-queue platform label → v1 OAuth connect platform. */
export function v1ConnectPlatformFromPublishLabel(
  platform: string,
): V1ConnectPlatform | null {
  const trimmed = platform.trim();
  if (isV1ConnectPlatform(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const candidate of V1_CONNECT_PLATFORMS) {
    if (candidate.toLowerCase() === lower) return candidate;
  }
  return null;
}

export type AutoInviteForPlatformResult =
  | { action: "none"; reason: string }
  | { action: "invited"; platforms: V1ConnectPlatform[]; createdCount: number }
  | { action: "upgrade_required"; platforms: V1ConnectPlatform[] };

/**
 * AI auto-invite (trigger A): schedule or publish needs a platform that is not
 * connected. Tier-gated; skips if pending invite exists. Does not block caller.
 */
export async function maybeAutoInviteForScheduledPlatform(input: {
  agencyTenantId: string;
  companyId: string;
  publishPlatformLabel: string;
  recipientEmail?: string | null;
}): Promise<AutoInviteForPlatformResult> {
  const v1 = v1ConnectPlatformFromPublishLabel(input.publishPlatformLabel);
  if (!v1) return { action: "none", reason: "not_v1_connect_platform" };

  const company = await getCompany(input.companyId);
  const tenant = await getTenant(input.agencyTenantId);
  if (!company) return { action: "none", reason: "company_not_found" };

  if (await findConnectedIntegration(input.companyId, v1)) {
    return { action: "none", reason: "already_connected" };
  }

  const pending = await listPendingSocialConnectInvites(
    input.agencyTenantId,
    input.companyId,
  );
  if (pending.some((i) => i.platform === v1)) {
    return { action: "none", reason: "pending_invite" };
  }

  if (!isConnectPlatformEntitled(company, tenant, v1)) {
    await logAction(
      systemAutopilotActor(input.agencyTenantId),
      "social.connect_upgrade_required",
      {
        targetType: "company",
        targetId: input.companyId,
        companyId: input.companyId,
        detail: `platform=${v1} trigger=scheduled_or_publish`,
      },
    );
    return { action: "upgrade_required", platforms: [v1] };
  }

  const recipient =
    input.recipientEmail?.trim() ||
    company.profile.approvalContact?.trim() ||
    "";
  const result = await requestSocialConnectInvitesFromAi({
    agencyTenantId: input.agencyTenantId,
    companyId: input.companyId,
    platforms: [v1],
    recipientEmail: recipient || undefined,
    emailInvites: Boolean(recipient.includes("@")),
  });
  return {
    action: "invited",
    platforms: [v1],
    createdCount: result.createdCount,
  };
}

export type RequestSocialConnectInvitesInput = {
  agencyTenantId: string;
  companyId: string;
  platforms: V1ConnectPlatform[];
  invitedBy: ActingUser;
  source: SocialConnectInviteSource;
  recipientEmail?: string | null;
  /** Attempt invite emails (still respects email live gates inside sendEmail). */
  emailInvites?: boolean;
};

export type RequestSocialConnectInvitesResult = {
  platforms: V1ConnectPlatform[];
  createdCount: number;
  skippedCount: number;
  inviteIds: string[];
  emailsAttempted: number;
};

/**
 * Create OAuth connect invites for the given platforms.
 * Idempotent via bulkCreateConnectInvites skipConnected/skipPending.
 */
export async function requestSocialConnectInvites(
  input: RequestSocialConnectInvitesInput,
): Promise<RequestSocialConnectInvitesResult> {
  const platforms = V1_CONNECT_PLATFORMS.filter((p) =>
    input.platforms.includes(p),
  );
  if (platforms.length === 0) {
    return {
      platforms: [],
      createdCount: 0,
      skippedCount: 0,
      inviteIds: [],
      emailsAttempted: 0,
    };
  }

  const company = await getCompany(input.companyId);
  const companyName = company?.name ?? "your business";

  const { created, skipped } = await bulkCreateConnectInvites({
    tenantId: input.agencyTenantId,
    companyIds: [input.companyId],
    platforms,
    invitedById: input.invitedBy.id,
  });

  const recipient =
    input.recipientEmail?.trim() ||
    company?.profile.approvalContact?.trim() ||
    "";

  if (recipient.includes("@")) {
    for (const invite of created) {
      await updateConnectInvite(invite.id, { recipientEmail: recipient });
    }
  }

  let emailsAttempted = 0;
  if (input.emailInvites && recipient.includes("@") && created.length > 0) {
    const h = await headers();
    const origin = resolveOrigin((key) => h.get(key));
    for (const invite of created) {
      const link = connectInviteUrl(origin, invite.token);
      await sendEmail({
        to: recipient,
        subject: `Connect ${invite.platform} for ${companyName}`,
        html: `<p>Please connect your <strong>${invite.platform}</strong> account for <strong>${companyName}</strong>:</p><p><a href="${link}">${link}</a></p><p>This is a one-time secure link — we never ask for your social media password.</p><p><small>Requested via ${input.source.replaceAll("_", " ")}</small></p>`,
      });
      emailsAttempted += 1;
    }
  }

  await logAction(input.invitedBy, "social.connect_invites_requested", {
    targetType: "company",
    targetId: input.companyId,
    companyId: input.companyId,
    detail: `source=${input.source} platforms=${platforms.join(",")} created=${created.length} skipped=${skipped.length} emailed=${emailsAttempted}`,
  });

  return {
    platforms,
    createdCount: created.length,
    skippedCount: skipped.length,
    inviteIds: created.map((i) => i.id),
    emailsAttempted,
  };
}

/** Signup: invites only for package channels present at onboarding. */
export async function ensureOnboardingSocialConnectInvites(input: {
  agencyTenantId: string;
  companyId: string;
  packageChannels: string[] | undefined;
  invitedBy: ActingUser;
  recipientEmail?: string | null;
  emailInvites?: boolean;
}): Promise<RequestSocialConnectInvitesResult> {
  const platforms = connectPlatformsFromPackageChannels(input.packageChannels);
  return requestSocialConnectInvites({
    agencyTenantId: input.agencyTenantId,
    companyId: input.companyId,
    platforms,
    invitedBy: input.invitedBy,
    source: "onboarding_plan",
    recipientEmail: input.recipientEmail,
    emailInvites: input.emailInvites,
  });
}

/**
 * System / AI path — tier-gated like the client; actor is system autopilot.
 */
export async function requestSocialConnectInvitesFromAi(input: {
  agencyTenantId: string;
  companyId: string;
  platforms: V1ConnectPlatform[];
  recipientEmail?: string | null;
  emailInvites?: boolean;
}): Promise<RequestSocialConnectInvitesResult> {
  const company = await getCompany(input.companyId);
  const tenant = await getTenant(input.agencyTenantId);
  if (!company) throw new Error("Company not found.");
  assertConnectPlatformsEntitled(company, tenant, input.platforms);
  return requestSocialConnectInvites({
    agencyTenantId: input.agencyTenantId,
    companyId: input.companyId,
    platforms: input.platforms,
    invitedBy: systemAutopilotActor(input.agencyTenantId),
    source: "system_ai",
    recipientEmail: input.recipientEmail,
    emailInvites: input.emailInvites ?? true,
  });
}

/** Pending usable invites for a company (client setup UI). */
export async function listPendingSocialConnectInvites(
  agencyTenantId: string,
  companyId: string,
) {
  const all = await listConnectInvites(agencyTenantId, companyId);
  return all.filter(
    (i) => i.status === "pending" && Date.parse(i.expiresAt) > Date.now(),
  );
}

export { V1_CONNECT_PLATFORMS };
