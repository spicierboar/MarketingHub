"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import {
  completeConnectInvite,
  oauthPlatformForPublishLabel,
} from "@/lib/connect-invites";
import {
  createIntegration,
  getConnectInvite,
  getConnectInviteByToken,
  getUser,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { logAction } from "@/lib/audit";
import { encryptToken } from "@/lib/crypto";
import { resolveOrigin } from "@/lib/origin";
import {
  authorizeUrl,
  oauthConfigured,
  OAUTH_NONCE_COOKIE,
  signState,
} from "@/lib/oauth";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

// Client completes OAuth via a one-time connect invite (no login).
export async function startInviteOAuthAction(formData: FormData) {
  const token = text(formData, "token");
  const accountName = text(formData, "accountName");
  if (!token || !accountName) throw new Error("Account id and invite are required.");

  const invite = await getConnectInviteByToken(token);
  if (!invite || invite.status !== "pending") {
    throw new Error("This connect link is no longer valid.");
  }
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    throw new Error("This connect link has expired — ask your agency for a new one.");
  }

  const oauthPlatform = oauthPlatformForPublishLabel(invite.platform);
  if (!oauthPlatform || !oauthConfigured(oauthPlatform)) {
    throw new Error("OAuth is not available for this platform — use the manual token form.");
  }

  const nonce = randomBytes(16).toString("hex");
  const state = signState({
    tenantId: invite.tenantId,
    companyId: invite.companyId,
    platform: oauthPlatform,
    publishPlatform: invite.platform,
    accountName,
    inviteId: invite.id,
    nonce,
    issuedAt: Date.now(),
  });
  const jar = await cookies();
  jar.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
  });

  const url = authorizeUrl(oauthPlatform, state, `${await requestOrigin()}/api/oauth/callback`);
  if (!url) throw new Error("OAuth is not configured.");
  redirect(url);
}

export async function connectInviteManualAction(formData: FormData) {
  const token = text(formData, "token");
  const accountName = text(formData, "accountName");
  const apiToken = text(formData, "tokenValue");
  if (!token || !accountName || !apiToken) {
    throw new Error("Account name, token and invite are required.");
  }

  const invite = await getConnectInviteByToken(token);
  if (!invite || invite.status !== "pending") {
    throw new Error("This connect link is no longer valid.");
  }
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    throw new Error("This connect link has expired.");
  }

  await runInServiceContext(invite.tenantId, async () => {
    const live = await getConnectInvite(invite.id);
    if (!live || live.status !== "pending") throw new Error("Invite already used.");

    const integration = await createIntegration({
      companyId: invite.companyId,
      platform: invite.platform,
      accountName,
      encryptedToken: encryptToken(apiToken),
      tokenLastFour: apiToken.slice(-4),
      status: "connected",
      connectedById: invite.invitedById,
    });
    const done = await completeConnectInvite(invite.id, integration.id);
    if (!done) throw new Error("Could not complete the invite.");

    const inviter = await getUser(invite.invitedById);
    if (inviter) {
      await logAction(inviter, "integration.invite_connected", {
        tenantId: invite.tenantId,
        targetType: "integration",
        targetId: integration.id,
        companyId: invite.companyId,
        detail: `${invite.platform}: ${accountName} (client invite, manual token)`,
      });
    }
  });

  redirect(`/connect/${token}?connected=1`);
}
