// W7 M52 — Executive dashboard & multi-scorecards (Phase 18 full).
// Extends V1 health-scores with reputation, local SEO, engagement, retention
// scorecards + next-best-action. Compute-only — no migration, no live flag.

import {
  listCompanies,
  listCompanyReviews,
  listContent,
  listIntegrations,
  listLoyaltyMembers,
  listRecommendations,
  listScheduledPosts,
  getLocalProfile,
  getTenant,
} from "@/lib/db";
import { buildGbpAuditForCompany, isGbpIntegration } from "@/lib/gbp-audit";
import {
  buildTenantHealthScores,
  companiesNeedingAttention,
  DEFAULT_ATTENTION_THRESHOLD,
  type CompanyHealthScore,
} from "@/lib/health-scores";
import { computeReputationScore } from "@/lib/reviews";
import { resolveBusinessType } from "@/lib/business-profiles";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import type { Company, Recommendation } from "@/lib/types";

export type ExecScorecardId =
  | "marketing"
  | "reputation"
  | "local_seo"
  | "engagement"
  | "retention";

export interface ExecScorecard {
  id: ExecScorecardId;
  label: string;
  score: number;
  evidence: string;
  /** Soft next step when this card is weak */
  nextHint?: string;
}

export interface ExecNextBestAction {
  title: string;
  reason: string;
  href: string;
  source: "recommendation" | "scorecard" | "health";
}

export interface CompanyExecDash {
  companyId: string;
  companyName: string;
  businessTypeHint?: string;
  overall: number;
  scorecards: ExecScorecard[];
  nextBest: ExecNextBestAction[];
  health: CompanyHealthScore;
  computedAt: string;
  needsAttention: boolean;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const SCORECARD_LABELS: Record<ExecScorecardId, string> = {
  marketing: "Marketing",
  reputation: "Reputation",
  local_seo: "Local SEO",
  engagement: "Engagement",
  retention: "Retention",
};

/** Equal-weight composite of the five scorecards. */
export function compositeFromScorecards(cards: ExecScorecard[]): number {
  if (!cards.length) return 0;
  return clamp(Math.round(cards.reduce((s, c) => s + c.score, 0) / cards.length));
}

export function scoreReputationCard(input: {
  score: number;
  averageRating: number;
  totalReviews: number;
  negativeOpen: number;
}): ExecScorecard {
  if (input.totalReviews === 0) {
    return {
      id: "reputation",
      label: SCORECARD_LABELS.reputation,
      score: 45,
      evidence: "No reviews imported yet — reputation is unmeasured.",
      nextHint: "Import Google/Facebook reviews and reply to negatives first.",
    };
  }
  return {
    id: "reputation",
    label: SCORECARD_LABELS.reputation,
    score: clamp(input.score),
    evidence: `${input.averageRating}★ avg across ${input.totalReviews} review(s); ${input.negativeOpen} open negative.`,
    nextHint:
      input.negativeOpen > 0
        ? "Draft replies for open negative reviews."
        : input.score < 70
          ? "Run a review-request campaign to locals."
          : undefined,
  };
}

export function scoreLocalSeoCard(auditScore: number, gbpConnected: boolean): ExecScorecard {
  const score = gbpConnected ? clamp(auditScore) : clamp(Math.min(auditScore, 55));
  return {
    id: "local_seo",
    label: SCORECARD_LABELS.local_seo,
    score,
    evidence: gbpConnected
      ? `GBP audit score ${auditScore}/100 (NAP, hours, categories, photos, FAQ).`
      : `GBP not connected — audit simulated at ${auditScore}/100. Connect GBP to unlock live checks.`,
    nextHint: !gbpConnected
      ? "Connect Google Business Profile on Publishing."
      : auditScore < 70
        ? "Fix failing GBP checklist items on Local SEO."
        : undefined,
  };
}

export function scoreEngagementCard(input: {
  published30d: number;
  pendingApproval: number;
}): ExecScorecard {
  // Proxy until live engagement import (likes/comments) lands post-W6.
  const publishScore = clamp(Math.round((input.published30d / 8) * 70 + (input.published30d > 0 ? 15 : 0)));
  const backlogPenalty = Math.min(25, input.pendingApproval * 5);
  const score = clamp(publishScore - backlogPenalty);
  return {
    id: "engagement",
    label: SCORECARD_LABELS.engagement,
    score,
    evidence: `${input.published30d} published post(s) in 30 days; ${input.pendingApproval} awaiting approval. (Engagement metrics simulated until live analytics.)`,
    nextHint:
      input.pendingApproval > 2
        ? "Clear the approval backlog."
        : input.published30d < 4
          ? "Schedule more posts this week."
          : undefined,
  };
}

export function scoreRetentionCard(memberCount: number): ExecScorecard {
  if (memberCount <= 0) {
    return {
      id: "retention",
      label: SCORECARD_LABELS.retention,
      score: 40,
      evidence: "No loyalty members yet — retention is unmeasured.",
      nextHint: "Enable Loyalty and enrol a first cohort.",
    };
  }
  const score = clamp(Math.round(35 + Math.min(55, memberCount * 4)));
  return {
    id: "retention",
    label: SCORECARD_LABELS.retention,
    score,
    evidence: `${memberCount} loyalty member(s) on file.`,
    nextHint: memberCount < 10 ? "Promote a referral or birthday offer." : undefined,
  };
}

function nextBestFromScorecards(cards: ExecScorecard[], companyId: string): ExecNextBestAction[] {
  return cards
    .filter((c) => c.score < 65 && c.nextHint)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((c) => ({
      title: c.nextHint!,
      reason: `${c.label} score ${c.score}/100`,
      href:
        c.id === "reputation"
          ? "/reviews"
          : c.id === "local_seo"
            ? `/companies/${companyId}/local-seo`
            : c.id === "retention"
              ? "/loyalty"
              : c.id === "engagement"
                ? "/approvals"
                : `/companies/${companyId}`,
      source: "scorecard" as const,
    }));
}

function nextBestFromRecs(recs: Recommendation[]): ExecNextBestAction[] {
  return recs.slice(0, 2).map((r) => {
    const href =
      r.action.kind === "campaign"
        ? `/campaigns/new?company=${r.companyId}&objective=${encodeURIComponent(r.action.objective ?? r.title)}`
        : r.action.kind === "content_request"
          ? `/requests/new?company=${r.companyId}&topic=${encodeURIComponent(r.action.topic ?? r.title)}`
          : r.action.kind === "review"
            ? r.action.reviewHref || "/reviews"
            : r.action.kind === "repurpose" && r.action.contentId
              ? `/studio?repurposeFrom=${r.action.contentId}`
              : "/recommendations";
    return {
      title: r.title,
      reason: r.rationale?.slice(0, 140) || "Ranked recommendation",
      href,
      source: "recommendation" as const,
    };
  });
}

export function buildCompanyExecDash(input: {
  company: Company;
  health: CompanyHealthScore;
  reputation: ReturnType<typeof computeReputationScore>;
  localSeoScore: number;
  gbpConnected: boolean;
  published30d: number;
  pendingApproval: number;
  loyaltyMembers: number;
  openRecs: Recommendation[];
  attentionThreshold?: number;
}): CompanyExecDash {
  const threshold = input.attentionThreshold ?? DEFAULT_ATTENTION_THRESHOLD;
  const marketing: ExecScorecard = {
    id: "marketing",
    label: SCORECARD_LABELS.marketing,
    score: input.health.score,
    evidence: `Composite marketing health from publishing, approvals, paid ROAS, and leads.`,
    nextHint: input.health.needsAttention
      ? input.health.factors.sort((a, b) => a.score - b.score)[0]?.evidence
      : undefined,
  };
  const scorecards: ExecScorecard[] = [
    marketing,
    scoreReputationCard(input.reputation),
    scoreLocalSeoCard(input.localSeoScore, input.gbpConnected),
    scoreEngagementCard({
      published30d: input.published30d,
      pendingApproval: input.pendingApproval,
    }),
    scoreRetentionCard(input.loyaltyMembers),
  ];
  const overall = compositeFromScorecards(scorecards);
  const nextBest = [
    ...nextBestFromRecs(input.openRecs),
    ...nextBestFromScorecards(scorecards, input.company.id),
  ].slice(0, 3);

  if (nextBest.length === 0 && input.health.needsAttention) {
    nextBest.push({
      title: "Review marketing health factors",
      reason: `Overall health ${input.health.score} is below ${threshold}`,
      href: `/companies/${input.company.id}`,
      source: "health",
    });
  }

  return {
    companyId: input.company.id,
    companyName: input.company.name,
    businessTypeHint: resolveBusinessType(input.company),
    overall,
    scorecards,
    nextBest,
    health: input.health,
    computedAt: new Date().toISOString(),
    needsAttention: overall < threshold || input.health.needsAttention,
  };
}

export async function buildCompanyExecDashFull(
  tenantId: string,
  company: Company,
): Promise<CompanyExecDash> {
  const tenant = await getTenant(tenantId);
  const clock = resolveQueueClock(tenant);
  const windowStart = (() => {
    const d = new Date(clock.today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  const [healthScores, reviews, posts, content, members, recs, integrations, localProfile] =
    await Promise.all([
      buildTenantHealthScores(tenantId, { companyIds: [company.id] }),
      listCompanyReviews(tenantId, [company.id]),
      listScheduledPosts(tenantId),
      listContent(tenantId),
      listLoyaltyMembers(tenantId, company.id),
      listRecommendations(tenantId, [company.id], "open"),
      listIntegrations(tenantId, company.id),
      getLocalProfile(company.id),
    ]);

  const health = healthScores[0]!;
  const reputation = computeReputationScore(reviews);
  const gbpIntegration = integrations.find((i) => isGbpIntegration(i));
  const audit = await buildGbpAuditForCompany(company, {
    integration: gbpIntegration,
    localProfile: localProfile ?? undefined,
  });
  const published30d = posts.filter(
    (p) =>
      p.companyId === company.id &&
      p.status === "published" &&
      p.scheduledDate >= windowStart &&
      p.scheduledDate <= clock.today,
  ).length;
  const pendingApproval = content.filter(
    (c) => c.companyId === company.id && c.status === "pending_approval",
  ).length;

  const dash = buildCompanyExecDash({
    company,
    health,
    reputation,
    localSeoScore: audit.score,
    gbpConnected: audit.gbpConnected,
    published30d,
    pendingApproval,
    loyaltyMembers: members.length,
    openRecs: recs,
  });
  return dash;
}

export async function buildTenantExecDash(
  tenantId: string,
  opts?: { limit?: number },
): Promise<CompanyExecDash[]> {
  const companies = await listCompanies(tenantId);
  const rows: CompanyExecDash[] = [];
  for (const company of companies) {
    if (company.status === "archived") continue;
    rows.push(await buildCompanyExecDashFull(tenantId, company));
  }
  rows.sort((a, b) => a.overall - b.overall || a.companyName.localeCompare(b.companyName));
  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}

export function execPortfolioAttention(
  rows: CompanyExecDash[],
  opts?: { threshold?: number; limit?: number },
): CompanyExecDash[] {
  const threshold = opts?.threshold ?? DEFAULT_ATTENTION_THRESHOLD;
  const filtered = rows
    .filter((r) => r.overall < threshold || r.needsAttention)
    .sort((a, b) => a.overall - b.overall);
  return opts?.limit ? filtered.slice(0, opts.limit) : filtered;
}

/** Re-export for dashboard strips that already use health attention. */
export { companiesNeedingAttention, round1 };
