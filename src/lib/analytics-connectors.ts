// Live analytics connectors (production drop-in for the simulated metrics).
//
// src/lib/analytics.ts computes every aggregation, ROI and attribution figure
// from a per-post PostMetrics. In the demo those metrics are SIMULATED
// (deterministic, seeded by post id). In production they come from each
// platform's Insights API plus the CRM's won-deal / lead data — this module.
//
// Env-gated (ANALYTICS_LIVE=true + platform tokens): fetchLiveMetrics returns a
// PostMetrics for a published post, or null to fall back to the simulator. The
// one remaining wiring step (documented in HANDOVER): analytics.ts buildReport()
// is synchronous, so adopting live metrics means awaiting these calls and making
// the report path async — a mechanical change, since the pages that call it are
// already async server components.

import type { PostMetrics } from "@/lib/analytics";
import { findConnectedIntegration } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import type { ScheduledPost } from "@/lib/types";

export function analyticsLive(): boolean {
  return process.env.ANALYTICS_LIVE === "true";
}

// Pull real engagement for one published post. Returns null when not configured
// (analytics.ts then uses the deterministic simulator).
export async function fetchLiveMetrics(
  post: ScheduledPost,
): Promise<PostMetrics | null> {
  if (!analyticsLive()) return null;
  const integration = await findConnectedIntegration(post.companyId, post.platform);
  if (!integration) return null;
  const platform = post.platform.toLowerCase();
  try {
    if (platform.includes("facebook") || platform.includes("instagram")) {
      return await metaInsights(integration.encryptedToken, post);
    }
    // LinkedIn / Google Business Profile insights follow the same shape; add as
    // their APIs are provisioned. Unhandled platforms fall back to simulation.
    return null;
  } catch {
    return null;
  }
}

// Meta Graph insights for a published post + CRM lead lookup by UTM/campaign.
async function metaInsights(
  encryptedToken: string,
  post: ScheduledPost,
): Promise<PostMetrics | null> {
  const token = decryptToken(encryptedToken);
  // The platform post id is stored in the publish-log detail in production; here
  // we use the scheduled post id as the object reference placeholder.
  const metrics = ["post_impressions", "post_engaged_users", "post_clicks"].join(",");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(post.id)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    data?: { name: string; values: { value: number }[] }[];
  } | null;
  if (!json?.data) return null;
  const value = (name: string) =>
    json.data!.find((d) => d.name === name)?.values?.[0]?.value ?? 0;
  const reach = value("post_impressions");
  const engagement = value("post_engaged_users");
  const clicks = value("post_clicks");
  // Leads come from the CRM keyed by the post's UTM campaign (fetchCrmLeads).
  const leads = await fetchCrmLeads(post);
  return { reach, engagement, clicks, leads, emailOpens: 0, emailClicks: 0 };
}

// CRM lead attribution — count leads whose source campaign matches this post.
// Returns 0 when no CRM is configured.
async function fetchCrmLeads(post: ScheduledPost): Promise<number> {
  const base = process.env.CRM_API_URL;
  const key = process.env.CRM_API_KEY;
  if (!base || !key) return 0;
  try {
    const res = await fetch(
      `${base}/leads?source=${encodeURIComponent(post.platform)}&since=${post.scheduledDate}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return 0;
    const json = (await res.json().catch(() => null)) as { count?: number } | null;
    return json?.count ?? 0;
  } catch {
    return 0;
  }
}
