/**
 * Onboarding social connect — same OAuth invite flow as Publishing.
 * Creates one-time /connect/[token] links for package channels; never collects passwords.
 */

import { logAction } from "@/lib/audit";
import {
  bulkCreateConnectInvites,
  connectInviteUrl,
  isV1ConnectPlatform,
} from "@/lib/connect-invites";
import { listConnectInvites, updateConnectInvite } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveOrigin } from "@/lib/origin";
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

export function connectPlatformsFromPackageChannels(
  channels: string[] | undefined | null,
): V1ConnectPlatform[] {
  const out = new Set<V1ConnectPlatform>();
  for (const raw of channels ?? []) {
    const key = raw.trim().toLowerCase();
    const mapped = CHANNEL_TO_PLATFORM[key];
    if (mapped) out.add(mapped);
    // Already a v1 label (e.g. "Facebook")
    if (isV1ConnectPlatform(raw.trim())) out.add(raw.trim() as V1ConnectPlatform);
  }
  // Stable order matching V1_CONNECT_PLATFORMS
  return V1_CONNECT_PLATFORMS.filter((p) => out.has(p));
}

export type EnsureOnboardingSocialInvitesInput = {
  agencyTenantId: string;
  companyId: string;
  companyName: string;
  packageChannels: string[] | undefined;
  invitedBy: ActingUser;
  recipientEmail?: string | null;
  /** When true, attempt invite emails (still respects email live gates inside sendEmail). */
  emailInvites?: boolean;
};

export type EnsureOnboardingSocialInvitesResult = {
  platforms: V1ConnectPlatform[];
  createdCount: number;
  skippedCount: number;
  inviteIds: string[];
};

/**
 * Create OAuth connect invites for the new company's package channels.
 * Idempotent via bulkCreateConnectInvites skipConnected/skipPending.
 */
export async function ensureOnboardingSocialConnectInvites(
  input: EnsureOnboardingSocialInvitesInput,
): Promise<EnsureOnboardingSocialInvitesResult> {
  const platforms = connectPlatformsFromPackageChannels(input.packageChannels);
  if (platforms.length === 0) {
    return { platforms: [], createdCount: 0, skippedCount: 0, inviteIds: [] };
  }

  const { created, skipped } = await bulkCreateConnectInvites({
    tenantId: input.agencyTenantId,
    companyIds: [input.companyId],
    platforms,
    invitedById: input.invitedBy.id,
  });

  const recipient = input.recipientEmail?.trim();
  if (recipient?.includes("@")) {
    for (const invite of created) {
      await updateConnectInvite(invite.id, { recipientEmail: recipient });
    }
  }

  if (input.emailInvites && recipient?.includes("@") && created.length > 0) {
    const h = await headers();
    const origin = resolveOrigin((key) => h.get(key));
    for (const invite of created) {
      const link = connectInviteUrl(origin, invite.token);
      await sendEmail({
        to: recipient,
        subject: `Connect ${invite.platform} for ${input.companyName}`,
        html: `<p>Please connect your <strong>${invite.platform}</strong> account for <strong>${input.companyName}</strong>:</p><p><a href="${link}">${link}</a></p><p>This is a one-time secure link — we never ask for your social media password.</p>`,
      });
    }
  }

  await logAction(input.invitedBy, "onboarding.social_connect_invites", {
    targetType: "company",
    targetId: input.companyId,
    companyId: input.companyId,
    detail: `platforms=${platforms.join(",")} created=${created.length} skipped=${skipped.length}`,
  });

  return {
    platforms,
    createdCount: created.length,
    skippedCount: skipped.length,
    inviteIds: created.map((i) => i.id),
  };
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
