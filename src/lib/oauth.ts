// Shared-platform OAuth connect flow (SaaS T5).
//
// Owner decision #2: ONE Meta/LinkedIn/Google app owned by the platform;
// tenants connect their own pages/accounts via OAuth consent (not per-tenant
// apps — unworkable for non-technical customers). This module is the provider
// registry + handshake helpers; the actual redirect/callback live in the
// publishing action and /api/oauth/callback route.
//
// Env-gated like every external: with no shared-app creds set, oauthConfigured
// is false, the /publishing UI hides the "Connect with…" buttons, and the
// existing manual token-paste + simulator keep the demo running with zero
// accounts. The OAuth token, once granted, is stored ENCRYPTED on a
// tenant-scoped PublishingIntegration exactly like a pasted token.
//
// SECURITY / ISOLATION: the `state` is HMAC-signed server-side and carries the
// initiating tenantId + companyId + userId. The callback re-verifies the live
// session against it (assertAdminCompanyAccess) so an OAuth grant can NEVER
// attach a token to a company outside the acting admin's tenant, and a forged
// or replayed state cannot cross tenants.

import { createHmac, timingSafeEqual } from "node:crypto";

export type OAuthPlatform = "facebook" | "linkedin" | "google";

// Short-lived CSRF nonce cookie set when the consent flow starts, checked in
// the callback. Lives here (not in the "use server" actions file, which may
// only export async functions).
export const OAUTH_NONCE_COOKIE = "cc_oauth_nonce";

interface ProviderDef {
  platform: OAuthPlatform;
  label: string; // display + stored PublishingIntegration.platform value
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const PROVIDERS: Record<OAuthPlatform, ProviderDef> = {
  facebook: {
    platform: "facebook",
    label: "Facebook",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scope: "pages_manage_posts,pages_read_engagement,business_management",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "w_organization_social r_organization_social",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  google: {
    platform: "google",
    label: "Google Business Profile",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/business.manage",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
  },
};

export function isOAuthPlatform(v: string): v is OAuthPlatform {
  return v === "facebook" || v === "linkedin" || v === "google";
}

function clientId(p: ProviderDef): string | undefined {
  return process.env[p.clientIdEnv] || undefined;
}
function clientSecret(p: ProviderDef): string | undefined {
  return process.env[p.clientSecretEnv] || undefined;
}

// A platform is connectable via OAuth only when its shared app is configured
// AND publishing is live (the same gate the connectors use) AND the state-
// signing key is set. Co-gating PUBLISHING_TOKEN_KEY means the world-known demo
// fallback key can NEVER sign a real OAuth state: an operator who enables live
// OAuth without setting the key simply gets no OAuth flow (fails safe) rather
// than a forgeable-state cliff.
export function oauthConfigured(platform: OAuthPlatform): boolean {
  const p = PROVIDERS[platform];
  return (
    process.env.PUBLISHING_LIVE === "true" &&
    !!process.env.PUBLISHING_TOKEN_KEY &&
    !!clientId(p) &&
    !!clientSecret(p)
  );
}

export function configuredOAuthPlatforms(): { platform: OAuthPlatform; label: string }[] {
  return (Object.keys(PROVIDERS) as OAuthPlatform[])
    .filter((k) => oauthConfigured(k))
    .map((k) => ({ platform: k, label: PROVIDERS[k].label }));
}

export function providerLabel(platform: OAuthPlatform): string {
  return PROVIDERS[platform].label;
}

// ---- Signed state (CSRF + tenant binding) -------------------------------------
//
// state = base64url(payloadJson) + "." + hmacSHA256(payloadJson). The callback
// verifies the HMAC (payload untampered) AND that the live session matches the
// bound tenant/company/user. The nonce is echoed in a short-lived cookie for a
// second CSRF check.

// Signed states self-expire after this window (independent of the nonce
// cookie), so a leaked/captured state can't be replayed once stale.
export const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthState {
  tenantId: string;
  companyId: string;
  platform: OAuthPlatform;
  accountName: string;
  /** Admin-initiated connect — must match live session. */
  userId?: string;
  /** Client one-time-connect invite — no session required. */
  inviteId?: string;
  /** Stored publishing platform label (e.g. Instagram via Meta OAuth). */
  publishPlatform?: string;
  nonce: string;
  issuedAt: number; // Date.now() at signing — under the HMAC, checked on callback
}

function stateSecret(): string {
  // Reuse the token key as the state-signing secret (already required for live
  // publishing). Falls back to a clearly-marked demo key.
  return (
    process.env.PUBLISHING_TOKEN_KEY ||
    "demo-only-key--set-PUBLISHING_TOKEN_KEY-in-production"
  );
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signState(state: OAuthState): string {
  const json = JSON.stringify(state);
  const payload = b64url(Buffer.from(json, "utf8"));
  const sig = b64url(createHmac("sha256", stateSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(raw: string | null): OAuthState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = b64url(createHmac("sha256", stateSecret()).update(payload).digest());
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as OAuthState;
    // Assert the FULL shape verifyState claims to return — a validly-signed but
    // incomplete state can never be returned as a trusted OAuthState.
    if (
      !parsed.tenantId ||
      !parsed.companyId ||
      !isOAuthPlatform(parsed.platform) ||
      !parsed.accountName ||
      !parsed.nonce ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }
    const hasUser = !!parsed.userId;
    const hasInvite = !!parsed.inviteId;
    if (hasUser === hasInvite) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- Handshake ----------------------------------------------------------------

export function authorizeUrl(platform: OAuthPlatform, state: string, redirectUri: string): string | null {
  const p = PROVIDERS[platform];
  const id = clientId(p);
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: p.scope,
    state,
  });
  return `${p.authorizeUrl}?${params.toString()}`;
}

export interface TokenResult {
  ok: boolean;
  accessToken?: string;
  detail: string;
}

// Exchange the authorization code for an access token. Never surfaces the
// provider's raw error body to callers (it can flow into audit/UI) — logs
// server-side and returns a generic detail.
export async function exchangeCodeForToken(
  platform: OAuthPlatform,
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const p = PROVIDERS[platform];
  const id = clientId(p);
  const secret = clientSecret(p);
  if (!id || !secret) return { ok: false, detail: "OAuth app not configured" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
  });
  try {
    const res = await fetch(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: unknown };
    if (!res.ok || !json.access_token) {
      console.error(`[oauth] ${platform} token exchange failed (${res.status}):`, json);
      return { ok: false, detail: "Token exchange failed (see server logs)" };
    }
    return { ok: true, accessToken: json.access_token, detail: "connected" };
  } catch (err) {
    console.error(`[oauth] ${platform} token exchange error:`, err);
    return { ok: false, detail: "Token exchange request failed (see server logs)" };
  }
}
