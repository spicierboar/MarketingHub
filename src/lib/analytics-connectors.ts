// Live analytics connectors (production drop-in for the simulated metrics).
//
// src/lib/analytics.ts computes every aggregation, ROI and attribution figure
// from a per-post PostMetrics. In the demo those metrics are SIMULATED
// (deterministic, seeded by post id). In production they come from each
// platform's Insights API plus the CRM's won-deal / lead data — this module.
//
// Env-gated (ANALYTICS_LIVE=true + platform tokens): fetchLiveMetrics returns a
// PostMetrics for a published post, or null to fall back to the simulator.
// buildReport() / health scores call resolvePostMetrics() which awaits these
// connectors when live, otherwise uses the deterministic simulator.

import type { PostMetrics } from "@/lib/analytics";
import { findConnectedIntegration } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import type { PublishingIntegration, ScheduledPost } from "@/lib/types";

export function analyticsLive(): boolean {
  return process.env.ANALYTICS_LIVE === "true";
}

/** Parse the platform object id from a publish-log detail string. */
export function platformPostIdFromPublishDetail(detail: string): string | null {
  const bare = detail.replace(/\[idem:[^\]]+\]\s*/i, "").trim();
  const m =
    bare.match(/post id:\s*([^\s)]+)/i) ??
    bare.match(/simulated id:\s*([^\s)]+)/i) ??
    bare.match(/\(([^)]+)\)\s*$/);
  return m?.[1]?.trim() || null;
}

export interface FetchLiveMetricsOpts {
  platformPostId?: string;
}

export async function fetchLiveMetrics(
  post: ScheduledPost,
  opts?: FetchLiveMetricsOpts,
): Promise<PostMetrics | null> {
  if (!analyticsLive()) return null;
  if (post.status !== "published") return null;
  const integration = await findConnectedIntegration(post.companyId, post.platform);
  if (!integration) return null;
  const platform = post.platform.toLowerCase();
  const objectId = opts?.platformPostId ?? post.id;
  try {
    if (platform.includes("facebook") || platform.includes("instagram")) {
      return await metaInsights(integration.encryptedToken, post, objectId);
    }
    if (platform.includes("google")) {
      return await googleInsights(integration, post, objectId);
    }
    return null;
  } catch {
    return null;
  }
}

async function metaInsights(
  encryptedToken: string,
  post: ScheduledPost,
  platformPostId: string,
): Promise<PostMetrics | null> {
  const token = decryptToken(encryptedToken);
  const metrics = ["post_impressions", "post_engaged_users", "post_clicks"].join(",");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(platformPostId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`,
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
  const leads = await fetchCrmLeads(post);
  return { reach, engagement, clicks, leads, emailOpens: 0, emailClicks: 0 };
}

async function googleInsights(
  integration: PublishingIntegration,
  post: ScheduledPost,
  platformPostId: string,
): Promise<PostMetrics | null> {
  const token = decryptToken(integration.encryptedToken);
  const location = integration.accountName;

  const postRes = await fetch(
    `https://mybusiness.googleapis.com/v4/${location}/localPosts/${encodeURIComponent(platformPostId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!postRes.ok) return null;

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  const toDate = (d: Date) => ({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
  const perfRes = await fetch(
    `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dailyMetrics: [
          "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
          "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
          "CALL_CLICKS",
          "WEBSITE_CLICKS",
        ],
        dailyRange: { startDate: toDate(start), endDate: toDate(now) },
      }),
    },
  );
  if (!perfRes.ok) return null;
  const perf = (await perfRes.json().catch(() => null)) as {
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: { timeSeries?: { datedValues?: { value?: string }[] } }[];
    }[];
  } | null;

  let reach = 0;
  let clicks = 0;
  for (const series of perf?.multiDailyMetricTimeSeries ?? []) {
    for (const metric of series.dailyMetricTimeSeries ?? []) {
      const total = (metric.timeSeries?.datedValues ?? []).reduce(
        (sum, dv) => sum + (Number(dv.value) || 0),
        0,
      );
      if ((metric as { dailyMetric?: string }).dailyMetric?.includes("IMPRESSIONS")) {
        reach += total;
      } else {
        clicks += total;
      }
    }
  }
  const engagement = Math.round(clicks * 0.35 + reach * 0.02);
  const leads = await fetchCrmLeads(post);
  return { reach, engagement, clicks, leads, emailOpens: 0, emailClicks: 0 };
}

async function fetchCrmLeads(post: ScheduledPost): Promise<number> {
  const base = process.env.CRM_API_URL;
  const key = process.env.CRM_API_KEY;
  if (!base || !key) return 0;
  const params = new URLSearchParams({
    source: post.platform,
    since: post.scheduledDate,
    contentId: post.contentId,
  });
  try {
    const res = await fetch(`${base}/leads?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return 0;
    const json = (await res.json().catch(() => null)) as { count?: number } | null;
    return json?.count ?? 0;
  } catch {
    return 0;
  }
}
