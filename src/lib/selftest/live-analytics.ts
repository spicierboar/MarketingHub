// Self-test helpers for W2 live analytics connectors (M26).

import { metricsForPost, resolvePostMetrics } from "@/lib/analytics";
import {
  analyticsLive,
  fetchLiveMetrics,
  platformPostIdFromPublishDetail,
} from "@/lib/analytics-connectors";
import type { ContentItem, ScheduledPost } from "@/lib/types";

function stubPublishedPost(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  const t = new Date().toISOString();
  return {
    id: "sp_analytics_stub",
    contentId: "ct_analytics_stub",
    companyId: "co_analytics_stub",
    platform: "Facebook",
    scheduledDate: t.slice(0, 10),
    status: "published",
    createdById: "u_stub",
    createdAt: t,
    updatedAt: t,
    ...overrides,
  };
}

function stubContent(): ContentItem {
  const t = new Date().toISOString();
  return {
    id: "ct_analytics_stub",
    companyId: "co_analytics_stub",
    type: "social_post",
    title: "Analytics stub",
    body: "stub",
    status: "published",
    versions: [],
    createdById: "u_stub",
    createdAt: t,
    updatedAt: t,
  };
}

export async function checkAnalyticsSimulatedWhenLiveOff(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const live = analyticsLive();
  const post = stubPublishedPost();
  const resolved = await resolvePostMetrics(post, stubContent());
  const sim = metricsForPost(post, stubContent());
  const ok =
    !live &&
    resolved.reach === sim.reach &&
    resolved.engagement === sim.engagement &&
    resolved.leads === sim.leads;
  return { ok, detail: `live=${live} reach=${resolved.reach}` };
}

export async function checkFetchLiveMetricsNullWhenOff(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const live = analyticsLive();
  const result = await fetchLiveMetrics(stubPublishedPost());
  return { ok: !live && result === null, detail: `live=${live}` };
}

export function checkPlatformPostIdParse(): { ok: boolean; detail: string } {
  const meta = platformPostIdFromPublishDetail(
    "Posted to Facebook (post id: 882910234)",
  );
  const sim = platformPostIdFromPublishDetail(
    "Posted to Harbour View (simulated id: sim_fb_abc123)",
  );
  const idem = platformPostIdFromPublishDetail(
    "[idem:plk_abc] Posted to Instagram (post id: ig_44510)",
  );
  const ok = meta === "882910234" && sim === "sim_fb_abc123" && idem === "ig_44510";
  return { ok, detail: `meta=${meta}` };
}

export async function checkResolvePostMetricsDeterministic(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const post = stubPublishedPost({ id: "sp_deterministic_check" });
  const content = stubContent();
  const a = await resolvePostMetrics(post, content);
  const b = await resolvePostMetrics(post, content);
  return { ok: a.reach === b.reach && a.reach > 0, detail: `reach=${a.reach}` };
}

export async function checkGooglePlatformRoutedWhenLive(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const live = analyticsLive();
  const gbpPost = stubPublishedPost({
    id: "sp_gbp_stub",
    platform: "Google Business Profile",
  });
  const result = await fetchLiveMetrics(gbpPost);
  return { ok: !live && result === null, detail: `live=${live}` };
}
