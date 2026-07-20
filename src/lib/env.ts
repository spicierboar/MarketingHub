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

function normalizedOriginHostname(origin?: string | null): string | null {
  const raw = (origin ?? process.env.APP_ORIGIN ?? "").trim();
  if (!raw) return null;
  try {
    const hostname = new URL(
      raw.includes("://") ? raw : `http://${raw}`,
    ).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.+$/, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

/** True when APP_ORIGIN (or the given URL) points at a local/dev host. */
export function looksLikeLocalOrigin(origin?: string | null): boolean {
  const hostname = normalizedOriginHostname(origin);
  return hostname ? isLoopbackHostname(hostname) : false;
}

/**
 * Strong gate for mutation-capable local-demo tools. A localhost Host/Origin
 * header alone is spoofable, so local demo additionally requires a development
 * runtime with no deployment markers and a non-production Node process.
 */
export function trustworthyLocalDemoRequest(origin?: string | null): boolean {
  const serverFlag = (process.env.CC_LOCAL_DEMO || "").trim().toLowerCase();
  const deploymentMarkers = [
    process.env.VERCEL,
    process.env.VERCEL_ENV,
    process.env.VERCEL_URL,
    process.env.AWS_LAMBDA_FUNCTION_NAME,
    process.env.NETLIFY,
    process.env.CF_PAGES,
    process.env.K_SERVICE,
    process.env.FLY_APP_NAME,
    process.env.RENDER,
  ];
  return (
    (serverFlag === "true" || serverFlag === "1") &&
    appEnv() === "development" &&
    process.env.NODE_ENV !== "production" &&
    deploymentMarkers.every((marker) => !marker) &&
    looksLikeLocalOrigin(origin)
  );
}

/**
 * Shared environment gate for every outbound provider capability. Deployment
 * evidence is mandatory; NODE_ENV and credentials never authorize calls.
 */
export function liveIntegrationsAllowed(): boolean {
  if (!explicitProviderProductionRuntime()) return false;
  if (localDemoEnabled()) return false;
  if (looksLikeLocalOrigin()) return false;
  return true;
}

/**
 * Provider calls need deployment evidence stronger than NODE_ENV=production,
 * which is also set by local builds and Vercel Preview. When VERCEL_ENV exists
 * it is authoritative; a conflicting CC_ENV also fails closed.
 */
export function explicitProviderProductionRuntime(): boolean {
  const vercel = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  const explicit = (process.env.CC_ENV || "").trim().toLowerCase();
  const ccProduction = explicit === "production" || explicit === "prod";
  const hasVercelMarker = Boolean(
    vercel ||
      process.env.VERCEL?.trim() ||
      process.env.VERCEL_URL?.trim(),
  );
  if (hasVercelMarker) {
    return vercel === "production" && (!explicit || ccProduction);
  }
  const originHostname = normalizedOriginHostname(process.env.APP_ORIGIN);
  return (
    ccProduction &&
    originHostname !== null &&
    !isLoopbackHostname(originHostname)
  );
}

/** Exact opt-in used by provider-specific effective activation checks. */
export function providerLiveFlagEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export type ProviderActivationStatus = {
  provider: "photo-marketplace-stripe" | "resend-email";
  mode: "live" | "simulated";
  liveRequested: boolean;
  credentialConfigured: boolean;
  environmentAllowed: boolean;
  issue: "live_flag_without_credential" | "environment_blocks_live" | null;
};

function providerActivation(
  provider: ProviderActivationStatus["provider"],
  liveFlag: string | undefined,
  credential: string | undefined,
): ProviderActivationStatus {
  const liveRequested = providerLiveFlagEnabled(liveFlag);
  const credentialConfigured = Boolean(credential?.trim());
  const environmentAllowed = liveIntegrationsAllowed();
  let issue: ProviderActivationStatus["issue"] = null;
  if (liveRequested && !credentialConfigured) {
    issue = "live_flag_without_credential";
  } else if (liveRequested && !environmentAllowed) {
    issue = "environment_blocks_live";
  }

  return {
    provider,
    mode: liveRequested && credentialConfigured && environmentAllowed
      ? "live"
      : "simulated",
    liveRequested,
    credentialConfigured,
    environmentAllowed,
    issue,
  };
}

/** Secret-free provider activation snapshot for startup and status reporting. */
export function providerActivationStatuses(): ProviderActivationStatus[] {
  return [photoMarketplaceActivation(), emailActivation()];
}

export function photoMarketplaceActivation(): ProviderActivationStatus {
  return providerActivation(
    "photo-marketplace-stripe",
    process.env.PHOTO_MARKETPLACE_LIVE,
    process.env.STRIPE_SECRET_KEY,
  );
}

export function emailActivation(): ProviderActivationStatus {
  return providerActivation(
    "resend-email",
    process.env.EMAIL_SEND_LIVE,
    process.env.RESEND_API_KEY,
  );
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
    "PHOTO_MARKETPLACE_LIVE",
    "EMAIL_SEND_LIVE",
    "STRIPE_BILLING_LIVE",
    "CC_AI_LIVE",
    "PLACES_ENRICHMENT_LIVE",
    "AUTO_ONBOARDING_LIVE",
    "ABN_LOOKUP_LIVE",
    "FUNNEL_LIVE",
    "ORDERING_LIVE",
    "PARTNER_WEBHOOKS_LIVE",
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
