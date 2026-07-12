// Deployment environment (local / staging / live) — a single source of truth.
//
// WHY this exists: on Vercel, a PREVIEW (staging) deployment builds with
// NODE_ENV=production, so `NODE_ENV === "production"` is TRUE on staging too —
// gating dev-tools on NODE_ENV would wrongly lock them on staging. Vercel does
// set VERCEL_ENV = "production" | "preview" | "development", so we derive the
// real environment from that (with an explicit CC_ENV override for self-hosted /
// non-Vercel hosts).
//
// Resolution order:
//   1. CC_ENV, if set — "production" | "staging" | "development" (explicit).
//   2. VERCEL_ENV — production → production, preview → staging, else development.
//   3. NODE_ENV — production → production, else development.
//
// Contract: STAGING has all dev-tools open (self-test/queue-test) and shows an
// environment banner; PRODUCTION locks the dev-tools (secret-gated) and shows no
// banner. Data isolation between staging and live is by SEPARATE Supabase
// projects (different NEXT_PUBLIC_SUPABASE_URL per environment) — see
// docs/ENVIRONMENTS.md and docs/DEPLOYMENT.md.

export type AppEnv = "production" | "staging" | "development";

export function appEnv(): AppEnv {
  const explicit = (process.env.CC_ENV || "").trim().toLowerCase();
  if (explicit === "production" || explicit === "prod") return "production";
  if (explicit === "staging" || explicit === "stage") return "staging";
  if (explicit === "development" || explicit === "dev") return "development";

  const vercel = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "staging";
  if (vercel === "development") return "development";

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function isProduction(): boolean {
  return appEnv() === "production";
}
export function isStaging(): boolean {
  return appEnv() === "staging";
}

// Dev-tools (self-test, queue-test, other diagnostics) are OPEN on development
// and staging, and LOCKED in production unless a secret is presented (the route
// still honours CC_SELFTEST_SECRET on top of this). This is the "staging has all
// the devtools, live does not" contract.
export function devToolsOpen(): boolean {
  return appEnv() !== "production";
}

// Local demo bypass — in-memory seed + cookie auth even when Supabase env vars
// are present. NEVER honour this in production. Set both:
//   CC_LOCAL_DEMO=true
//   NEXT_PUBLIC_CC_LOCAL_DEMO=true  (so the login form skips magic-link OTP)
export function localDemoEnabled(): boolean {
  if (appEnv() === "production") return false;
  const server = (process.env.CC_LOCAL_DEMO || "").trim().toLowerCase();
  const pub = (process.env.NEXT_PUBLIC_CC_LOCAL_DEMO || "").trim().toLowerCase();
  return server === "true" || server === "1" || pub === "true" || pub === "1";
}

/** True when APP_ORIGIN (or the given URL) points at a local/dev host. */
export function looksLikeLocalOrigin(origin?: string | null): boolean {
  const raw = (origin ?? process.env.APP_ORIGIN ?? "").trim().toLowerCase();
  if (!raw) return false;
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1/.test(raw);
  }
}

/**
 * Soft safety for cutover `*_LIVE` flags (publishing / ads / analytics / visuals).
 * Returns false on staging, local demo, or when APP_ORIGIN is localhost — so a
 * mistaken Preview/local flip cannot hit Meta/Google. Does not break the demo
 * (demo leaves flags unset). Unset APP_ORIGIN still allows intentional local
 * live experiments when flags are explicitly set.
 */
export function liveIntegrationsAllowed(): boolean {
  if (appEnv() === "staging") return false;
  if (localDemoEnabled()) return false;
  if (looksLikeLocalOrigin()) return false;
  return true;
}

/** Startup / diagnostics: which cutover flags are set but soft-blocked. */
export function blockedLiveFlagNames(): string[] {
  if (liveIntegrationsAllowed()) return [];
  const names = [
    "PUBLISHING_LIVE",
    "ADS_LIVE",
    "ANALYTICS_LIVE",
    "VISUALS_LIVE",
    "LOCAL_SEO_LIVE",
  ] as const;
  return names.filter((n) => (process.env[n] || "").trim().toLowerCase() === "true");
}

// Label for the non-production environment ribbon (null in production).
export function envRibbonLabel(): string | null {
  const e = appEnv();
  if (e === "production") return null;
  if (localDemoEnabled()) return `${e.toUpperCase()} · LOCAL DEMO`;
  return e.toUpperCase();
}
