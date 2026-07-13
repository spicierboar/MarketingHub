// Trusted request origin resolution.
//
// OAuth redirect_uris and Stripe success/cancel URLs must resolve to OUR site,
// not to whatever an inbound Host / X-Forwarded-Host header claims. When
// APP_ORIGIN is set (production) it is the single source of truth; otherwise we
// fall back to the request headers (fine for local dev / the demo). This closes
// the header-spoofing / open-redirect class for the redirect_uri and every
// user-facing redirect target the billing + OAuth flows build.

export function resolveOrigin(get: (name: string) => string | null | undefined): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return requestHostOrigin(get) ?? "http://localhost:3000";
}

/**
 * Origin for Supabase Auth redirects (magic link / OAuth SSO → `/auth/callback`).
 *
 * PKCE code-verifier cookies are host-bound. The email/OAuth redirect MUST land
 * on the same host that called `signInWithOtp` / `signInWithOAuth`. On Vercel
 * Preview, deployment URLs change every push and `APP_ORIGIN` is often a stale
 * host — prefer the live request host there. Production still uses APP_ORIGIN
 * (canonical domain) via `resolveOrigin`.
 */
export function resolveAuthRedirectOrigin(
  get: (name: string) => string | null | undefined,
): string {
  const previewish =
    process.env.VERCEL_ENV === "preview" ||
    (process.env.CC_ENV || "").trim().toLowerCase() === "staging";
  if (previewish) {
    const fromRequest = requestHostOrigin(get);
    if (fromRequest) return fromRequest;
  }
  return resolveOrigin(get);
}

function requestHostOrigin(
  get: (name: string) => string | null | undefined,
): string | null {
  const hostRaw = get("x-forwarded-host") ?? get("host");
  if (!hostRaw) return null;
  const host = hostRaw.split(",")[0]?.trim();
  if (!host) return null;
  const protoRaw = get("x-forwarded-proto") ?? "http";
  const proto = protoRaw.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}
