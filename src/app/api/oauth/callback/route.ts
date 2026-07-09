// Shared-platform OAuth callback (SaaS T5). The provider redirects here after
// the tenant admin consents. This is where a granted token becomes a
// tenant-scoped PublishingIntegration.
//
// ISOLATION IS THE WHOLE POINT OF THIS FILE:
//  1. The signed `state` (HMAC) proves we issued the request and carries the
//     initiating tenantId/companyId/userId — untamperable.
//  2. A nonce cookie must match the state (CSRF: the browser that finishes the
//     flow is the one that started it).
//  3. The LIVE session is re-verified against the state: the user must still be
//     signed in, be an admin, own the state's company (canAccessCompany checks
//     tenant FIRST), and be the same person who started it, in the same tenant.
// Only then is the token stored — so an OAuth grant can never attach to a
// company outside the acting admin's tenant, even with a forged/replayed state.
//
// CLIENT INVITE FLOW (bulk one-time-connect): state carries inviteId instead of
// userId. The invite row is validated inside runInServiceContext — no session.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  completeConnectInvite,
} from "@/lib/connect-invites";
import { createIntegration, getConnectInvite, getUser } from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCompany, isAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { encryptToken } from "@/lib/crypto";
import { resolveOrigin } from "@/lib/origin";
import {
  exchangeCodeForToken,
  oauthConfigured,
  OAUTH_NONCE_COOKIE,
  providerLabel,
  STATE_MAX_AGE_MS,
  verifyState,
} from "@/lib/oauth";

function fail(origin: string, reason: string, inviteToken?: string): NextResponse {
  const base = inviteToken
    ? `${origin}/connect/${inviteToken}?oauth_error=${encodeURIComponent(reason)}`
    : `${origin}/publishing?oauth_error=${encodeURIComponent(reason)}`;
  return NextResponse.redirect(base);
}

function success(origin: string, label: string, inviteToken?: string): NextResponse {
  if (inviteToken) {
    return NextResponse.redirect(`${origin}/connect/${inviteToken}?connected=1`);
  }
  return NextResponse.redirect(`${origin}/publishing?connected=${encodeURIComponent(label)}`);
}

function requestOrigin(req: NextRequest): string {
  return resolveOrigin((k) => req.headers.get(k));
}

export async function GET(req: NextRequest) {
  const origin = requestOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const jar = await cookies();
  const nonceCookie = jar.get(OAUTH_NONCE_COOKIE)?.value;
  jar.delete(OAUTH_NONCE_COOKIE);

  if (providerError) return fail(origin, "consent was declined");
  if (!code) return fail(origin, "missing authorization code");

  const state = verifyState(rawState);
  if (!state) return fail(origin, "invalid or tampered state");
  if (!nonceCookie || nonceCookie !== state.nonce) return fail(origin, "state/nonce mismatch");
  if (Date.now() - state.issuedAt > STATE_MAX_AGE_MS) {
    return fail(origin, "the request expired — retry");
  }
  if (!oauthConfigured(state.platform)) return fail(origin, "platform not configured");

  const token = await exchangeCodeForToken(
    state.platform,
    code,
    `${origin}/api/oauth/callback`,
  );
  if (!token.ok || !token.accessToken) return fail(origin, token.detail);

  const label = state.publishPlatform ?? providerLabel(state.platform);

  // ---- Client invite flow (no session) --------------------------------------
  if (state.inviteId) {
    let inviteToken: string | undefined;
    const result = await runInServiceContext(state.tenantId, async () => {
      const invite = await getConnectInvite(state.inviteId!);
      if (!invite || invite.status !== "pending") return { ok: false as const, reason: "invite invalid" };
      if (Date.parse(invite.expiresAt) <= Date.now()) return { ok: false as const, reason: "invite expired" };
      if (
        invite.tenantId !== state.tenantId ||
        invite.companyId !== state.companyId ||
        invite.platform !== label
      ) {
        return { ok: false as const, reason: "invite mismatch" };
      }
      inviteToken = invite.token;

      const integration = await createIntegration({
        companyId: state.companyId,
        platform: label,
        accountName: state.accountName,
        encryptedToken: encryptToken(token.accessToken!),
        tokenLastFour: token.accessToken!.slice(-4),
        status: "connected",
        connectedById: invite.invitedById,
      });
      const done = await completeConnectInvite(invite.id, integration.id);
      if (!done) return { ok: false as const, reason: "invite already used" };

      const inviter = await getUser(invite.invitedById);
      if (inviter) {
        await logAction(inviter, "integration.invite_connected", {
          tenantId: invite.tenantId,
          targetType: "integration",
          targetId: integration.id,
          companyId: state.companyId,
          detail: `${label}: ${state.accountName} (client invite, OAuth)`,
        });
      }
      return { ok: true as const };
    });
    if (!result.ok) return fail(origin, result.reason, inviteToken);
    return success(origin, label, inviteToken);
  }

  // ---- Admin session flow ---------------------------------------------------
  const user = await getCurrentUser();
  if (!user) return fail(origin, "session expired — sign in and retry");
  if (
    !state.userId ||
    !isAdmin(user) ||
    user.id !== state.userId ||
    user.tenantId !== state.tenantId ||
    !(await canAccessCompany(user, state.companyId))
  ) {
    return fail(origin, "not authorised for that workspace/company");
  }

  const integration = await createIntegration({
    companyId: state.companyId,
    platform: label,
    accountName: state.accountName,
    encryptedToken: encryptToken(token.accessToken),
    tokenLastFour: token.accessToken.slice(-4),
    status: "connected",
    connectedById: user.id,
  });
  await logAction(user, "integration.oauth_connected", {
    targetType: "integration",
    targetId: integration.id,
    companyId: state.companyId,
    detail: `${label}: ${state.accountName} (via OAuth)`,
  });

  return success(origin, label);
}
