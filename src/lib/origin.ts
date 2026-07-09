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
  const proto = get("x-forwarded-proto") ?? "http";
  const host = get("x-forwarded-host") ?? get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
