// Bulk one-time-connect onboarding (Module 1 scale foundation).
//
// Agency admins create single-use invite links per (company, v1 platform); clients
// open /connect/[token] and grant OAuth (or paste a token when OAuth isn't
// available). No client login — the token IS the capability. Invites are
// tenant-bound, expire, and are revocable.

import { randomBytes } from "node:crypto";
import {
  createConnectInvite,
  findConnectedIntegration,
  getConnectInvite,
  listConnectInvites,
  updateConnectInvite,
} from "@/lib/db";
import { oauthConfigured, type OAuthPlatform } from "@/lib/oauth";
import { V1_CONNECT_PLATFORMS, type ConnectInvite, type V1ConnectPlatform } from "@/lib/types";
import { now } from "@/lib/utils";

export const CONNECT_INVITE_DEFAULT_DAYS = 7;

const V1_SET = new Set<string>(V1_CONNECT_PLATFORMS);

export function isV1ConnectPlatform(v: string): v is V1ConnectPlatform {
  return V1_SET.has(v);
}

// OAuth provider for a v1 publishing platform label (null → manual token on invite page).
export function oauthPlatformForPublishLabel(platform: string): OAuthPlatform | null {
  const p = platform.toLowerCase();
  if (p.includes("facebook") || p === "instagram") return "facebook";
  if (p.includes("google")) return "google";
  return null;
}

export function oauthAvailableForPlatform(platform: string): boolean {
  const oauth = oauthPlatformForPublishLabel(platform);
  return oauth !== null && oauthConfigured(oauth);
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function connectInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/connect/${token}`;
}

function expiresAtFromDays(days: number): string {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function inviteIsUsable(invite: ConnectInvite): boolean {
  if (invite.status !== "pending") return false;
  return Date.parse(invite.expiresAt) > Date.now();
}

export interface BulkConnectInviteInput {
  tenantId: string;
  companyIds: string[];
  platforms: string[];
  invitedById: string;
  expiresInDays?: number;
  skipConnected?: boolean;
  skipPending?: boolean;
}

export interface BulkConnectInviteSkipped {
  companyId: string;
  platform: string;
  reason: string;
}

export interface BulkConnectInviteResult {
  created: ConnectInvite[];
  skipped: BulkConnectInviteSkipped[];
}

// Create invites for every (company × platform) pair, skipping duplicates.
export async function bulkCreateConnectInvites(
  input: BulkConnectInviteInput,
): Promise<BulkConnectInviteResult> {
  const {
    tenantId,
    companyIds,
    platforms,
    invitedById,
    expiresInDays = CONNECT_INVITE_DEFAULT_DAYS,
    skipConnected = true,
    skipPending = true,
  } = input;
  const created: ConnectInvite[] = [];
  const skipped: BulkConnectInviteSkipped[] = [];
  const pending = skipPending
    ? (await listConnectInvites(tenantId)).filter((i) => i.status === "pending")
    : [];

  for (const companyId of companyIds) {
    for (const platform of platforms) {
      if (!isV1ConnectPlatform(platform)) {
        skipped.push({ companyId, platform, reason: "not a v1 connect platform" });
        continue;
      }
      if (skipConnected && (await findConnectedIntegration(companyId, platform))) {
        skipped.push({ companyId, platform, reason: "already connected" });
        continue;
      }
      if (
        skipPending &&
        pending.some((i) => i.companyId === companyId && i.platform === platform)
      ) {
        skipped.push({ companyId, platform, reason: "pending invite exists" });
        continue;
      }
      const invite = await createConnectInvite({
        tenantId,
        companyId,
        platform,
        token: generateInviteToken(),
        status: "pending",
        invitedById,
        expiresAt: expiresAtFromDays(expiresInDays),
      });
      created.push(invite);
      pending.push(invite);
    }
  }
  return { created, skipped };
}

export async function markInviteExpiredIfNeeded(invite: ConnectInvite): Promise<ConnectInvite> {
  if (invite.status !== "pending") return invite;
  if (Date.parse(invite.expiresAt) > Date.now()) return invite;
  const updated = await updateConnectInvite(invite.id, { status: "expired" });
  return updated ?? invite;
}

export async function completeConnectInvite(
  inviteId: string,
  integrationId: string,
): Promise<ConnectInvite | undefined> {
  const invite = await getConnectInvite(inviteId);
  if (!invite || invite.status !== "pending") return undefined;
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    await updateConnectInvite(inviteId, { status: "expired" });
    return undefined;
  }
  return updateConnectInvite(inviteId, {
    status: "completed",
    integrationId,
    completedAt: now(),
  });
}
