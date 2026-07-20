/**
 * Social OAuth connect invites — shared by onboarding, staff Publishing, client
 * self-serve adds, and system/AI automation. Never collects passwords.
 *
 * Rules:
 * - At signup: only platforms implied by the chosen package channels.
 * - Later: staff, client, or system/AI can request more; emails use the same
 *   /connect/[token] OAuth links (email still gated by sendEmail live flags).
 */

import { logAction } from "@/lib/audit";
import {
  bulkCreateConnectInvites,
  connectInviteUrl,
  isV1ConnectPlatform,
} from "@/lib/connect-invites";
import { getCompany, listConnectInvites, updateConnectInvite } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveOrigin } from "@/lib/origin";
import { systemAutopilotActor } from "@/lib/managed-service/autopilot-approvals";
import {
  V1_CONNECT_PLATFORMS,
  type ActingUser,
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
  companyName: string;
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
 * System / AI path — same invites + optional email.
 * PLACEHOLDER: call when strategy/schedule needs a channel that is not connected
 * (e.g. autopilot or staff-approved AI action). Actor is system autopilot, not staff.
 */
export async function requestSocialConnectInvitesFromAi(input: {
  agencyTenantId: string;
  companyId: string;
  platforms: V1ConnectPlatform[];
  recipientEmail?: string | null;
  emailInvites?: boolean;
}): Promise<RequestSocialConnectInvitesResult> {
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
