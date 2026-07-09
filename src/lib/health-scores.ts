// V1 module 10 — marketing health scores (Phase 18 slice).
//
// Single 0–100 score per company from publishing cadence, approval backlog,
// paid/simulated ROAS, and lead volume. Explainable factor drill-down feeds
// agency "clients needing attention" lists. Compute-only — no migration.

import {
  listAdAccounts,
  listAdBudgets,
  listAdCampaigns,
  listCompanies,
  listContent,
  listLeads,
  listScheduledPosts,
  getTenant,
} from "@/lib/db";
import { metricsForPost, resolvePostMetrics, type PostMetrics } from "@/lib/analytics";
import {
  detectPublishingCadence,
  type PublishingCadenceSignal,
} from "@/lib/calendar-intelligence";
import { campaignMetrics, companyPaidSummary } from "@/lib/paid";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import type { AdCampaign, Company, ContentItem, Lead, ScheduledPost } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export type HealthFactorId =
  | "publishing_cadence"
  | "approval_backlog"
  | "paid_roas"
  | "lead_volume";

export interface HealthFactor {
  id: HealthFactorId;
  label: string;
  /** Sub-score for this factor (0–100). */
  score: number;
  /** Weight in the composite (sums to 1 across factors). */
  weight: number;
  /** Points contributed to the overall score (score × weight). */
  contribution: number;
  evidence: string;
}

export interface CompanyHealthScore {
  companyId: string;
  companyName: string;
  score: number;
  factors: HealthFactor[];
  computedAt: string;
  needsAttention: boolean;
}

export interface HealthScoreInput {
  company: Company;
  todayIso: string;
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[];
  content: Pick<ContentItem, "companyId" | "status">[];
  campaigns: AdCampaign[];
  leads: Lead[];
  contentById?: Map<string, ContentItem>;
  postMetricsById?: Map<string, PostMetrics>;
}

// ---- weights & thresholds ----------------------------------------------------

export const HEALTH_FACTOR_WEIGHTS: Record<HealthFactorId, number> = {
  publishing_cadence: 0.3,
  approval_backlog: 0.25,
  paid_roas: 0.25,
  lead_volume: 0.2,
};

export const DEFAULT_ATTENTION_THRESHOLD = 60;

const FACTOR_LABELS: Record<HealthFactorId, string> = {
  publishing_cadence: "Publishing cadence",
  approval_backlog: "Approval backlog",
  paid_roas: "Paid / simulated ROAS",
  lead_volume: "Lead volume",
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---- factor scorers (pure — testable) ----------------------------------------

export function scorePublishingCadenceFactor(
  signal: PublishingCadenceSignal | null,
): { score: number; evidence: string } {
  if (!signal) {
    return {
      score: 95,
      evidence: "Publishing cadence on track for the last 30 days.",
    };
  }
  const ratio = signal.publishedCount / Math.max(1, signal.minExpected);
  let score = clamp(Math.round(ratio * 100), 12, 88);
  if (signal.daysSinceLastPublish !== null && signal.daysSinceLastPublish > 21) {
    score = Math.min(score, 35);
  }
  const days =
    signal.daysSinceLastPublish !== null
      ? `; last publish ${signal.daysSinceLastPublish} day(s) ago`
      : "; no published posts yet";
  return {
    score,
    evidence: `${signal.publishedCount} post(s) in ${signal.lookbackDays} days (target ${signal.minExpected}+)${days}`,
  };
}

export function scoreApprovalBacklogFactor(
  pendingCount: number,
): { score: number; evidence: string } {
  let score: number;
  if (pendingCount === 0) score = 100;
  else if (pendingCount === 1) score = 85;
  else if (pendingCount <= 3) score = 70;
  else if (pendingCount <= 6) score = 50;
  else score = 25;

  const evidence =
    pendingCount === 0
      ? "No content waiting on client approval."
      : `${pendingCount} item(s) awaiting approval — unblock to keep campaigns moving.`;

  return { score, evidence };
}

export function scorePaidRoasFactor(
  campaigns: AdCampaign[],
  company: Company,
): { score: number; evidence: string } {
  const active = campaigns.filter((c) => c.status === "active" && c.dailyBudgetUsd > 0);
  if (active.length === 0) {
    return {
      score: 75,
      evidence: "No active paid campaigns — neutral score until ads are running.",
    };
  }
  const metrics = active.map((c) => campaignMetrics(c, company));
  const totalSpend = metrics.reduce((s, m) => s + m.spendUsd, 0);
  const totalRevenue = metrics.reduce((s, m) => s + m.revenueUsd, 0);
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  let score: number;
  if (roas === null || roas <= 0) score = 30;
  else if (roas >= 3) score = 100;
  else if (roas >= 2) score = 88;
  else if (roas >= 1) score = 72;
  else if (roas >= 0.5) score = 48;
  else score = 25;

  const roasLabel = roas !== null ? `${round1(roas)}×` : "n/a";
  return {
    score,
    evidence: `Simulated ROAS ${roasLabel} across ${active.length} active campaign(s) (30-day window).`,
  };
}

export function scoreLeadVolumeFactor(args: {
  leads: Lead[];
  campaigns: AdCampaign[];
  posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId" | "id" | "contentId">[];
  companyId: string;
  contentById: Map<string, ContentItem>;
  todayIso: string;
  postMetricsById?: Map<string, PostMetrics>;
}): { score: number; evidence: string } {
  const { leads, campaigns, posts, companyId, contentById, todayIso, postMetricsById } = args;
  const windowStart = addDays(todayIso, -30);
  const recentLeads = leads.filter(
    (l) => l.companyId === companyId && l.capturedAt.slice(0, 10) >= windowStart,
  );

  const published = posts.filter(
    (p) =>
      p.companyId === companyId &&
      p.status === "published" &&
      p.scheduledDate >= windowStart &&
      p.scheduledDate <= todayIso,
  );
  const postLeads = published.reduce((sum, p) => {
    if (!p.id) return sum;
    const content = p.contentId ? contentById.get(p.contentId) : undefined;
    const metrics =
      postMetricsById?.get(p.id) ??
      metricsForPost(p as ScheduledPost, content);
    return sum + metrics.leads;
  }, 0);

  const totalLeads = recentLeads.length + postLeads;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const minExpected = Math.max(2, activeCampaigns * 3 + (published.length > 0 ? 2 : 0));
  const ratio = totalLeads / minExpected;
  const score = clamp(Math.round(Math.min(1.2, ratio) * 85 + (totalLeads > 0 ? 10 : 0)), 15, 100);

  return {
    score,
    evidence: `${totalLeads} lead(s) in 30 days (${recentLeads.length} captured + ${postLeads} from published posts; target ${minExpected}+).`,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---- composite score ---------------------------------------------------------

export function computeCompanyHealthScore(
  input: HealthScoreInput,
  opts?: { attentionThreshold?: number },
): CompanyHealthScore {
  const threshold = opts?.attentionThreshold ?? DEFAULT_ATTENTION_THRESHOLD;
  const { company, todayIso, posts, content, campaigns, leads, contentById, postMetricsById } =
    input;
  const companyPosts = posts.filter((p) => p.companyId === company.id);
  const cadenceSignal = detectPublishingCadence(companyPosts, company.id, todayIso);
  const pendingCount = content.filter(
    (c) => c.companyId === company.id && c.status === "pending_approval",
  ).length;

  const cadence = scorePublishingCadenceFactor(cadenceSignal);
  const backlog = scoreApprovalBacklogFactor(pendingCount);
  const roas = scorePaidRoasFactor(
    campaigns.filter((c) => c.companyId === company.id),
    company,
  );
  const leadsFactor = scoreLeadVolumeFactor({
    leads,
    campaigns: campaigns.filter((c) => c.companyId === company.id),
    posts: companyPosts as Pick<
      ScheduledPost,
      "scheduledDate" | "status" | "companyId" | "id" | "contentId"
    >[],
    companyId: company.id,
    contentById: contentById ?? new Map(),
    todayIso,
    postMetricsById,
  });

  const raw: { id: HealthFactorId; result: { score: number; evidence: string } }[] = [
    { id: "publishing_cadence", result: cadence },
    { id: "approval_backlog", result: backlog },
    { id: "paid_roas", result: roas },
    { id: "lead_volume", result: leadsFactor },
  ];

  const factors: HealthFactor[] = raw.map(({ id, result }) => {
    const weight = HEALTH_FACTOR_WEIGHTS[id];
    return {
      id,
      label: FACTOR_LABELS[id],
      score: result.score,
      weight,
      contribution: round1(result.score * weight),
      evidence: result.evidence,
    };
  });

  const score = clamp(Math.round(factors.reduce((s, f) => s + f.contribution, 0)));
  const computedAt = new Date().toISOString();

  return {
    companyId: company.id,
    companyName: company.name,
    score,
    factors,
    computedAt,
    needsAttention: score < threshold,
  };
}

// ---- tenant loaders ----------------------------------------------------------

export async function buildCompanyHealthScore(
  tenantId: string,
  company: Company,
  opts?: { attentionThreshold?: number },
): Promise<CompanyHealthScore> {
  const tenant = await getTenant(tenantId);
  const clock = resolveQueueClock(tenant);
  const [posts, content, campaigns, leads] = await Promise.all([
    listScheduledPosts(tenantId),
    listContent(tenantId),
    listAdCampaigns(tenantId, company.id),
    listLeads(tenantId, company.id),
  ]);
  const contentById = new Map(content.map((c) => [c.id, c]));
  const windowStart = addDays(clock.today, -30);
  const publishedForMetrics = posts.filter(
    (p) =>
      p.companyId === company.id &&
      p.status === "published" &&
      p.scheduledDate >= windowStart &&
      p.scheduledDate <= clock.today,
  );
  const postMetricsById = new Map(
    await Promise.all(
      publishedForMetrics.map(async (post) => {
        const metrics = await resolvePostMetrics(
          post,
          contentById.get(post.contentId),
        );
        return [post.id, metrics] as const;
      }),
    ),
  );

  return computeCompanyHealthScore(
    {
      company,
      todayIso: clock.today,
      posts,
      content,
      campaigns,
      leads,
      contentById,
      postMetricsById,
    },
    opts,
  );
}

export async function buildTenantHealthScores(
  tenantId: string,
  opts?: { companyIds?: string[]; attentionThreshold?: number },
): Promise<CompanyHealthScore[]> {
  const companies = (await listCompanies(tenantId)).filter(
    (c) => !opts?.companyIds || opts.companyIds.includes(c.id),
  );
  const tenant = await getTenant(tenantId);
  const clock = resolveQueueClock(tenant);
  const [posts, content, campaigns, leads] = await Promise.all([
    listScheduledPosts(tenantId),
    listContent(tenantId),
    listAdCampaigns(tenantId),
    listLeads(tenantId),
  ]);
  const contentById = new Map(content.map((c) => [c.id, c]));
  const windowStart = addDays(clock.today, -30);
  const publishedForMetrics = posts.filter(
    (p) =>
      p.status === "published" &&
      p.scheduledDate >= windowStart &&
      p.scheduledDate <= clock.today,
  );
  const postMetricsById = new Map(
    await Promise.all(
      publishedForMetrics.map(async (post) => {
        const metrics = await resolvePostMetrics(
          post,
          contentById.get(post.contentId),
        );
        return [post.id, metrics] as const;
      }),
    ),
  );

  return companies
    .map((company) =>
      computeCompanyHealthScore(
        {
          company,
          todayIso: clock.today,
          posts,
          content,
          campaigns,
          leads,
          contentById,
          postMetricsById,
        },
        opts,
      ),
    )
    .sort((a, b) => a.score - b.score || a.companyName.localeCompare(b.companyName));
}

/** Agency portfolio helper — lowest scores first, optionally capped. */
export function companiesNeedingAttention(
  scores: CompanyHealthScore[],
  opts?: { threshold?: number; limit?: number },
): CompanyHealthScore[] {
  const threshold = opts?.threshold ?? DEFAULT_ATTENTION_THRESHOLD;
  const filtered = scores
    .filter((s) => s.score < threshold)
    .sort((a, b) => a.score - b.score || a.companyName.localeCompare(b.companyName));
  return opts?.limit ? filtered.slice(0, opts.limit) : filtered;
}

/** Enriched summary with paid rollup context (for dashboards). */
export async function buildCompanyHealthBundle(tenantId: string, company: Company) {
  const [health, campaigns, leads, accounts, budgets] = await Promise.all([
    buildCompanyHealthScore(tenantId, company),
    listAdCampaigns(tenantId, company.id),
    listLeads(tenantId, company.id),
    listAdAccounts(tenantId, company.id),
    listAdBudgets(tenantId),
  ]);
  const budget = budgets.find((b) => b.companyId === company.id);
  const connectedPlatforms = new Set(
    accounts.filter((a) => a.status === "connected").map((a) => a.platform),
  );
  const paid = companyPaidSummary({
    company,
    campaigns,
    leads,
    budget,
    connectedPlatforms,
  });
  return { health, paid };
}
