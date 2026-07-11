// Connector capability registry — live-ready matrix of what each platform
// supports. Flags stay OFF; this only documents + gates unsupported actions
// before a publish/API attempt. Simulated mode still works when live is off.

export type ConnectorCapability =
  | "publish"
  | "schedule"
  | "delete"
  | "comments"
  | "dms"
  | "metrics"
  | "ads_metrics"
  | "webhooks"
  | "rate_limit";

export type ConnectorPlatformKey =
  | "meta"
  | "facebook"
  | "instagram"
  | "google_business"
  | "tiktok"
  | "linkedin"
  | "email"
  | "meta_ads"
  | "google_ads";

export type ConnectorCapabilityMatrix = Record<ConnectorCapability, boolean>;

export interface ConnectorCapabilityRow {
  platform: ConnectorPlatformKey;
  label: string;
  capabilities: ConnectorCapabilityMatrix;
  /** Soft rate-limit hint (requests / window); informational until live. */
  rateLimitHint?: string;
}

const ALL_CAPS: ConnectorCapability[] = [
  "publish",
  "schedule",
  "delete",
  "comments",
  "dms",
  "metrics",
  "ads_metrics",
  "webhooks",
  "rate_limit",
];

function caps(partial: Partial<ConnectorCapabilityMatrix>): ConnectorCapabilityMatrix {
  const base = Object.fromEntries(ALL_CAPS.map((c) => [c, false])) as ConnectorCapabilityMatrix;
  return { ...base, ...partial };
}

/** Canonical per-platform capability matrix (simulated OK when live flags off). */
export const CONNECTOR_CAPABILITY_REGISTRY: ConnectorCapabilityRow[] = [
  {
    platform: "meta",
    label: "Meta (Facebook / Instagram Graph)",
    rateLimitHint: "~200 calls / user / hour",
    capabilities: caps({
      publish: true,
      schedule: true,
      delete: true,
      comments: true,
      dms: true,
      metrics: true,
      ads_metrics: true,
      webhooks: true,
      rate_limit: true,
    }),
  },
  {
    platform: "facebook",
    label: "Facebook Pages",
    rateLimitHint: "via Meta Graph",
    capabilities: caps({
      publish: true,
      schedule: true,
      delete: true,
      comments: true,
      dms: true,
      metrics: true,
      ads_metrics: false,
      webhooks: true,
      rate_limit: true,
    }),
  },
  {
    platform: "instagram",
    label: "Instagram Business",
    rateLimitHint: "~25 posts / 24h",
    capabilities: caps({
      publish: true,
      schedule: true,
      delete: true,
      comments: true,
      dms: true,
      metrics: true,
      ads_metrics: false,
      webhooks: true,
      rate_limit: true,
    }),
  },
  {
    platform: "google_business",
    label: "Google Business Profile",
    rateLimitHint: "~20 local posts / day",
    capabilities: caps({
      publish: true,
      schedule: false,
      delete: true,
      comments: false,
      dms: false,
      metrics: true,
      ads_metrics: false,
      webhooks: false,
      rate_limit: true,
    }),
  },
  {
    platform: "tiktok",
    label: "TikTok",
    rateLimitHint: "~15 posts / 24h",
    capabilities: caps({
      publish: true,
      schedule: true,
      delete: false,
      comments: true,
      dms: false,
      metrics: true,
      ads_metrics: true,
      webhooks: true,
      rate_limit: true,
    }),
  },
  {
    platform: "linkedin",
    label: "LinkedIn",
    rateLimitHint: "legacy integrations only",
    capabilities: caps({
      publish: true,
      schedule: false,
      delete: true,
      comments: true,
      dms: false,
      metrics: true,
      ads_metrics: false,
      webhooks: false,
      rate_limit: true,
    }),
  },
  {
    platform: "email",
    label: "Email (owned channel)",
    capabilities: caps({
      publish: true,
      schedule: true,
      delete: false,
      comments: false,
      dms: false,
      metrics: true,
      ads_metrics: false,
      webhooks: false,
      rate_limit: true,
    }),
  },
  {
    platform: "meta_ads",
    label: "Meta Ads",
    capabilities: caps({
      publish: false,
      schedule: false,
      delete: false,
      comments: false,
      dms: false,
      metrics: false,
      ads_metrics: true,
      webhooks: true,
      rate_limit: true,
    }),
  },
  {
    platform: "google_ads",
    label: "Google Ads",
    capabilities: caps({
      publish: false,
      schedule: false,
      delete: false,
      comments: false,
      dms: false,
      metrics: false,
      ads_metrics: true,
      webhooks: true,
      rate_limit: true,
    }),
  },
];

const BY_KEY = new Map(
  CONNECTOR_CAPABILITY_REGISTRY.map((r) => [r.platform, r] as const),
);

/** Map free-form integration.platform labels to a registry key. */
export function resolveConnectorPlatform(
  platform: string,
): ConnectorPlatformKey | null {
  const p = platform.toLowerCase().trim();
  if (BY_KEY.has(p as ConnectorPlatformKey)) return p as ConnectorPlatformKey;
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook") || p === "meta") return p.includes("ads") ? "meta_ads" : "facebook";
  if (p.includes("meta") && p.includes("ads")) return "meta_ads";
  if (p.includes("google") && p.includes("ads")) return "google_ads";
  if (p.includes("google") || p.includes("gbp") || p.includes("business")) {
    return "google_business";
  }
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("email")) return "email";
  return null;
}

export function getConnectorCapabilities(
  platform: string,
): ConnectorCapabilityRow | undefined {
  const key = resolveConnectorPlatform(platform);
  return key ? BY_KEY.get(key) : undefined;
}

export function connectorSupports(
  platform: string,
  action: ConnectorCapability,
): boolean {
  const row = getConnectorCapabilities(platform);
  return row?.capabilities[action] === true;
}

/**
 * Throws when the platform does not advertise support for `action`.
 * Call before live publish / schedule / delete attempts.
 */
export function assertConnectorAction(
  platform: string,
  action: ConnectorCapability,
): void {
  const key = resolveConnectorPlatform(platform);
  if (!key) {
    throw new Error(
      `Connector action "${action}" blocked: unknown platform "${platform}".`,
    );
  }
  const row = BY_KEY.get(key);
  if (!row || !row.capabilities[action]) {
    throw new Error(
      `Connector action "${action}" is not supported on ${row?.label ?? key}.`,
    );
  }
}

export function listConnectorCapabilityMatrix(): ConnectorCapabilityRow[] {
  return CONNECTOR_CAPABILITY_REGISTRY;
}

export { ALL_CAPS as CONNECTOR_CAPABILITY_KEYS };
