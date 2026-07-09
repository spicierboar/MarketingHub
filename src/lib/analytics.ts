// Analytics & reporting engine (Phase 8, §41–43).
//
// There is no live platform data yet, so per-post engagement is SIMULATED
// deterministically (seeded by post id → stable across reloads). This is the
// analytics analogue of the simulated publisher: the production drop-in is to
// replace metricsForPost() with a pull from each platform's Insights API / the
// CRM. Everything downstream (aggregation, ROI, attribution, dashboards) is
// real reporting logic that works unchanged on real numbers.

import {
  fetchLiveMetrics,
  platformPostIdFromPublishDetail,
} from "@/lib/analytics-connectors";
import {
  listAiRuns,
  listCampaigns,
  listCompanies,
  listContent,
  listPublishLogsForPosts,
  listRequests,
  listScheduledPosts,
  listSocial,
} from "@/lib/db";
import { onboardingScore } from "@/lib/types";
import type { Company, ContentItem, ScheduledPost } from "@/lib/types";
import { now } from "@/lib/utils";

// ---- deterministic seed ------------------------------------------------------------

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // → [0, 1)
  return ((h >>> 0) % 100000) / 100000;
}
function seededIn(str: string, min: number, max: number): number {
  return min + seed(str) * (max - min);
}

export interface PostMetrics {
  reach: number;
  engagement: number; // likes + comments + shares
  clicks: number;
  leads: number;
  emailOpens: number;
  emailClicks: number;
}

const EMPTY_METRICS: PostMetrics = {
  reach: 0,
  engagement: 0,
  clicks: 0,
  leads: 0,
  emailOpens: 0,
  emailClicks: 0,
};

// Simulated performance for one published post. Email content reports opens /
// clicks; social/other content reports reach / engagement.
export function metricsForPost(
  post: ScheduledPost,
  content: ContentItem | undefined,
): PostMetrics {
  if (post.status !== "published") return { ...EMPTY_METRICS };
  const s = post.id;
  const isEmail =
    content?.type === "email_newsletter" ||
    post.platform.toLowerCase() === "email";

  if (isEmail) {
    const sent = Math.round(seededIn(s + "sent", 400, 3500));
    const emailOpens = Math.round(sent * seededIn(s + "open", 0.25, 0.55));
    const emailClicks = Math.round(emailOpens * seededIn(s + "eclick", 0.08, 0.25));
    const leads = Math.round(emailClicks * seededIn(s + "lead", 0.05, 0.18));
    return {
      reach: sent,
      // "engagement" is the shared cross-channel ranking metric = active
      // engagements. For email that's clicks (comparable to social
      // likes/comments/shares); passive opens are tracked separately so they
      // don't dwarf social engagement in platform/content rankings.
      engagement: emailClicks,
      clicks: emailClicks,
      leads,
      emailOpens,
      emailClicks,
    };
  }

  const reach = Math.round(seededIn(s + "reach", 350, 5200));
  const engagement = Math.round(reach * seededIn(s + "eng", 0.02, 0.11));
  const clicks = Math.round(engagement * seededIn(s + "click", 0.12, 0.45));
  const leads = Math.round(clicks * seededIn(s + "lead", 0.04, 0.16));
  return { reach, engagement, clicks, leads, emailOpens: 0, emailClicks: 0 };
}

export async function resolvePostMetrics(
  post: ScheduledPost,
  content: ContentItem | undefined,
  platformPostId?: string,
): Promise<PostMetrics> {
  const live = await fetchLiveMetrics(post, { platformPostId });
  if (live) return live;
  return metricsForPost(post, content);
}

// Rough per-lead value by industry (production: from the CRM's won-deal data).
export function leadValue(company: Company | undefined): number {
  const ind = (company?.profile.industry ?? "").toLowerCase();
  if (ind.includes("accommodation") || ind.includes("hospitality")) return 220;
  if (ind.includes("supermarket") || ind.includes("grocery") || ind.includes("convenience")) return 32;
  if (ind.includes("cafe") || ind.includes("food")) return 18;
  return 60;
}

// ---- scoped published-post metrics -------------------------------------------------

export interface EnrichedPost {
  post: ScheduledPost;
  content?: ContentItem;
  company?: Company;
  metrics: PostMetrics;
}

async function publishedInScope(tenantId: string, companyIds?: Set<string>): Promise<EnrichedPost[]> {
  const contentById = new Map((await listContent(tenantId)).map((c) => [c.id, c]));
  const companyById = new Map((await listCompanies(tenantId)).map((c) => [c.id, c]));
  const published = (await listScheduledPosts(tenantId))
    .filter((p) => p.status === "published")
    .filter((p) => !companyIds || companyIds.has(p.companyId));

  const logs =
    published.length > 0
      ? await listPublishLogsForPosts(
          tenantId,
          published.map((p) => p.id),
        )
      : [];
  const platformPostIds = new Map<string, string>();
  for (const log of logs) {
    if (log.status !== "published" || !log.scheduledPostId) continue;
    if (platformPostIds.has(log.scheduledPostId)) continue;
    const pid = platformPostIdFromPublishDetail(log.detail);
    if (pid) platformPostIds.set(log.scheduledPostId, pid);
  }

  const metricsByPostId = new Map(
    await Promise.all(
      published.map(async (post) => {
        const content = contentById.get(post.contentId);
        const metrics = await resolvePostMetrics(
          post,
          content,
          platformPostIds.get(post.id),
        );
        return [post.id, metrics] as const;
      }),
    ),
  );

  return published.map((post) => {
    const content = contentById.get(post.contentId);
    return {
      post,
      content,
      company: companyById.get(post.companyId),
      metrics: metricsByPostId.get(post.id) ?? metricsForPost(post, content),
    };
  });
}

function sumMetrics(posts: EnrichedPost[]): PostMetrics {
  return posts.reduce(
    (acc, p) => ({
      reach: acc.reach + p.metrics.reach,
      engagement: acc.engagement + p.metrics.engagement,
      clicks: acc.clicks + p.metrics.clicks,
      leads: acc.leads + p.metrics.leads,
      emailOpens: acc.emailOpens + p.metrics.emailOpens,
      emailClicks: acc.emailClicks + p.metrics.emailClicks,
    }),
    { ...EMPTY_METRICS },
  );
}

// ---- the full report ---------------------------------------------------------------

export interface DimensionRow {
  key: string;
  label: string;
  posts: number;
  reach: number;
  engagement: number;
  clicks: number;
  leads: number;
  revenue: number;
}

export interface AnalyticsReport {
  funnel: {
    requests: number;
    drafts: number;
    pendingApproval: number;
    approved: number;
    scheduled: number;
    published: number;
    rejected: number;
  };
  totals: PostMetrics & { publishedPosts: number };
  byPlatform: DimensionRow[];
  byCompany: DimensionRow[];
  byCampaign: DimensionRow[];
  topContent: { id: string; title: string; engagement: number; leads: number }[];
  bottomContent: { id: string; title: string; engagement: number; leads: number }[];
  ai: { runs: number; costUsd: number; acceptanceRate: number; editRate: number };
  social: {
    total: number;
    published: number;
    escalated: number;
    bySentiment: Record<string, number>;
    topIntents: { intent: string; count: number }[];
    draftAcceptanceRate: number;
  };
  timeliness: {
    avgApprovalHours: number | null;
    avgRequestTurnaroundHours: number | null;
    unpublishedApproved: number;
  };
  roi: {
    leads: number;
    clicks: number;
    conversionRate: number; // leads / clicks
    costUsd: number;
    costPerLead: number | null;
    estRevenue: number;
    byCampaign: DimensionRow[];
  };
}

function hoursBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const h = (Date.parse(b) - Date.parse(a)) / 3_600_000;
  return Number.isFinite(h) && h >= 0 ? h : null;
}

export async function buildReport(tenantId: string, companyIds?: string[]): Promise<AnalyticsReport> {
  const scope = companyIds ? new Set(companyIds) : undefined;
  const inScope = <T extends { companyId: string }>(x: T) =>
    !scope || scope.has(x.companyId);

  const content = (await listContent(tenantId)).filter(inScope);
  const requests = (await listRequests(tenantId)).filter(inScope);
  const social = (await listSocial(tenantId)).filter(inScope);
  const aiRuns = await listAiRuns(tenantId, companyIds);
  const posts = await publishedInScope(tenantId, scope);
  const totals = sumMetrics(posts);
  const companyName = new Map((await listCompanies(tenantId)).map((c) => [c.id, c.name]));
  const campaignName = new Map((await listCampaigns(tenantId)).map((c) => [c.id, c.name]));

  // Funnel from content statuses (§41 posts generated/approved/rejected/published).
  const funnel = {
    requests: requests.length,
    drafts: content.filter((c) => ["ai_draft", "user_edited", "changes_required"].includes(c.status)).length,
    pendingApproval: content.filter((c) => c.status === "pending_approval").length,
    approved: content.filter((c) => c.status === "approved").length,
    scheduled: content.filter((c) => c.status === "scheduled").length,
    published: content.filter((c) => c.status === "published").length,
    rejected: content.filter((c) => c.status === "rejected").length,
  };

  // Group helper.
  const group = (
    keyOf: (p: EnrichedPost) => string,
    labelOf: (key: string) => string,
  ): DimensionRow[] => {
    const map = new Map<string, DimensionRow>();
    for (const p of posts) {
      const key = keyOf(p);
      if (!key) continue;
      const row =
        map.get(key) ??
        { key, label: labelOf(key), posts: 0, reach: 0, engagement: 0, clicks: 0, leads: 0, revenue: 0 };
      row.posts += 1;
      row.reach += p.metrics.reach;
      row.engagement += p.metrics.engagement;
      row.clicks += p.metrics.clicks;
      row.leads += p.metrics.leads;
      row.revenue += p.metrics.leads * leadValue(p.company);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.engagement - a.engagement);
  };

  const byPlatform = group((p) => p.post.platform, (k) => k);
  const byCompany = group((p) => p.post.companyId, (k) => companyName.get(k) ?? k);
  const byCampaign = group(
    (p) => p.content?.campaignId ?? "",
    (k) => campaignName.get(k) ?? k,
  );

  // Best / worst performing content by engagement (§41 best/worst topics).
  const ranked = [...posts]
    .filter((p) => p.content)
    .map((p) => ({
      id: p.content!.id,
      title: p.content!.title,
      engagement: p.metrics.engagement,
      leads: p.metrics.leads,
    }))
    .sort((a, b) => b.engagement - a.engagement);
  // Best/worst must not overlap: bottom is drawn from items NOT in the top set,
  // so with ≤5 published posts "underperformers" is simply empty.
  const topContent = ranked.slice(0, 5);
  const topIds = new Set(topContent.map((c) => c.id));
  const bottomContent = ranked
    .filter((c) => !topIds.has(c.id))
    .slice(-5)
    .reverse();

  // AI: acceptance = drafts that reached approval; edit rate = drafts edited.
  const aiDrafts = content.length;
  const acceptedDrafts = content.filter((c) =>
    ["approved", "scheduled", "published"].includes(c.status),
  ).length;
  const editedDrafts = content.filter((c) => c.versions.length > 0).length;

  // Social engagement analytics (§41).
  const bySentiment: Record<string, number> = {};
  const intentCounts = new Map<string, number>();
  for (const s of social) {
    bySentiment[s.sentiment] = (bySentiment[s.sentiment] ?? 0) + 1;
    intentCounts.set(s.intent, (intentCounts.get(s.intent) ?? 0) + 1);
  }
  const socialResolved = social.filter((s) =>
    ["approved", "published"].includes(s.status),
  ).length;

  // Timeliness: approval delay + request turnaround.
  const approvalHours = content
    .map((c) => hoursBetween(c.createdAt, c.approvedAt))
    .filter((h): h is number => h !== null);
  const turnaroundHours = requests
    .filter((r) => ["published", "completed", "approved"].includes(r.status))
    .map((r) => {
      // findLast → the terminal event (published/completed), not the earlier
      // "approved" step it passed through, so turnaround isn't understated.
      const end = r.statusHistory.findLast((e) =>
        ["published", "completed", "approved"].includes(e.status),
      );
      return hoursBetween(r.createdAt, end?.at);
    })
    .filter((h): h is number => h !== null);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const costUsd = aiRuns.reduce((s, r) => s + r.estCostUsd, 0);
  const estRevenue = posts.reduce(
    (s, p) => s + p.metrics.leads * leadValue(p.company),
    0,
  );

  return {
    funnel,
    totals: { ...totals, publishedPosts: posts.length },
    byPlatform,
    byCompany,
    byCampaign,
    topContent,
    bottomContent,
    ai: {
      runs: aiRuns.length,
      costUsd,
      acceptanceRate: aiDrafts ? acceptedDrafts / aiDrafts : 0,
      editRate: aiDrafts ? editedDrafts / aiDrafts : 0,
    },
    social: {
      total: social.length,
      published: social.filter((s) => s.status === "published").length,
      escalated: social.filter((s) => s.escalationRequired).length,
      bySentiment,
      topIntents: [...intentCounts.entries()]
        .map(([intent, count]) => ({ intent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      draftAcceptanceRate: social.length ? socialResolved / social.length : 0,
    },
    timeliness: {
      avgApprovalHours: avg(approvalHours),
      avgRequestTurnaroundHours: avg(turnaroundHours),
      unpublishedApproved: content.filter((c) => c.status === "approved").length,
    },
    roi: {
      leads: totals.leads,
      clicks: totals.clicks,
      conversionRate: totals.clicks ? totals.leads / totals.clicks : 0,
      costUsd,
      costPerLead: totals.leads ? costUsd / totals.leads : null,
      estRevenue,
      byCampaign,
    },
  };
}

// Local Manager Dashboard (§43) — scoped to a user's companies.
export interface LocalDashboard {
  requestsSubmitted: number;
  requestsApproved: number;
  requestsRejected: number;
  avgTurnaroundHours: number | null;
  postsPublished: number;
  engagement: number;
  leads: number;
  upcoming: {
    date: string;
    title: string;
    platform: string;
    company: string;
  }[];
  commonEnquiries: { intent: string; count: number }[];
  missingOnboarding: { company: string; missing: string[] }[];
}

export async function buildLocalDashboard(tenantId: string, companyIds: string[]): Promise<LocalDashboard> {
  const scope = new Set(companyIds);
  const inScope = <T extends { companyId: string }>(x: T) => scope.has(x.companyId);

  const requests = (await listRequests(tenantId)).filter(inScope);
  const posts = await publishedInScope(tenantId, scope);
  const totals = sumMetrics(posts);
  const today = now().slice(0, 10);
  const contentById = new Map((await listContent(tenantId)).map((c) => [c.id, c]));
  const companyById = new Map((await listCompanies(tenantId)).map((c) => [c.id, c]));

  const turnaround = requests
    .filter((r) => ["published", "completed", "approved"].includes(r.status))
    .map((r) => {
      const end = r.statusHistory.findLast((e) =>
        ["published", "completed", "approved"].includes(e.status),
      );
      return hoursBetween(r.createdAt, end?.at);
    })
    .filter((h): h is number => h !== null);

  const upcoming = (await listScheduledPosts(tenantId))
    .filter(
      (p) => p.status === "scheduled" && scope.has(p.companyId) && p.scheduledDate >= today,
    )
    .slice(0, 6)
    .map((p) => ({
      date: p.scheduledDate,
      title: contentById.get(p.contentId)?.title ?? p.contentId,
      platform: p.platform,
      company: companyById.get(p.companyId)?.name ?? p.companyId,
    }));

  const intentCounts = new Map<string, number>();
  for (const s of (await listSocial(tenantId)).filter(inScope)) {
    intentCounts.set(s.intent, (intentCounts.get(s.intent) ?? 0) + 1);
  }

  const missingOnboarding = companyIds
    .map((id) => {
      const c = companyById.get(id);
      if (!c) return null;
      const { missing } = onboardingScore(c);
      return missing.length ? { company: c.name, missing } : null;
    })
    .filter((x): x is { company: string; missing: string[] } => x !== null);

  return {
    requestsSubmitted: requests.length,
    requestsApproved: requests.filter((r) =>
      ["approved", "scheduled", "published", "completed"].includes(r.status),
    ).length,
    requestsRejected: requests.filter((r) => r.status === "cancelled").length,
    avgTurnaroundHours: turnaround.length
      ? turnaround.reduce((a, b) => a + b, 0) / turnaround.length
      : null,
    postsPublished: posts.length,
    engagement: totals.engagement,
    leads: totals.leads,
    upcoming,
    commonEnquiries: [...intentCounts.entries()]
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    missingOnboarding,
  };
}
