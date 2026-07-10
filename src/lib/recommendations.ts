// W5 M41 — ranked recommendations engine (Module 9).

import { generateForCompany, type RecommendationDraft } from "@/lib/ai/recommend";
import {
  detectCalendarGap,
  detectPublishingCadence,
  recommendationCadenceUrgencyBoost,
  recommendationGapUrgencyBoost,
} from "@/lib/calendar-intelligence";
import {
  listCompanyReviews,
  listCrmContacts,
  listGaps,
  listLoyaltyMembers,
  listScheduledPosts,
} from "@/lib/db";
import { now } from "@/lib/utils";
import { recommendationsMode } from "@/lib/recommendations-connectors";
import type {
  AgencyPortfolioAttention,
  Company,
  Recommendation,
  RecommendationDismissRecord,
  RecommendationEvidence,
  RecommendationType,
} from "@/lib/types";

export type { RecommendationDraft };
export { generateForCompany };

export interface ScoredRecommendationDraft extends RecommendationDraft {
  score: number;
  evidence?: RecommendationEvidence[];
}

const TYPE_WEIGHTS: Record<RecommendationType, number> = {
  complaint_insight: 95,
  retention_risk: 94,
  offer_refresh: 88,
  calendar_gap: 86,
  review_gap: 85,
  publishing_cadence: 82,
  stale_content: 78,
  best_platform: 76,
  seo_gap: 75,
  content_gap: 72,
  top_performer_repurpose: 70,
  loyalty_opportunity: 68,
  faq_insight: 66,
  timing: 62,
  next_campaign: 58,
  underperformer: 52,
};

export function scoreRecommendation(
  draft: RecommendationDraft & { evidence?: RecommendationEvidence[] },
  opts?: { gapBoost?: number; cadenceBoost?: number },
): number {
  let score = TYPE_WEIGHTS[draft.type] ?? 50;
  const rationale = draft.rationale.toLowerCase();

  if (draft.type === "calendar_gap") score += opts?.gapBoost ?? 0;
  if (draft.type === "publishing_cadence") score += opts?.cadenceBoost ?? 0;
  if (/\b0 post|no post|no published\b/.test(rationale)) score += 8;
  if (/\bcomplaint|service issue\b/.test(rationale)) score += 5;
  if (/\bending soon|expir/.test(rationale)) score += 6;
  if (/\bengagement|leads\b/.test(rationale) && draft.type === "best_platform") score += 4;
  if (/\bgap|thin|below target\b/.test(rationale)) score += 3;
  if ((draft.evidence?.length ?? 0) > 0) score += 2;

  return Math.min(99, score);
}

export function rankRecommendations(
  drafts: (RecommendationDraft & { evidence?: RecommendationEvidence[] })[],
  opts?: { min?: number; max?: number; gapBoost?: number; cadenceBoost?: number },
): ScoredRecommendationDraft[] {
  const min = opts?.min ?? 3;
  const max = opts?.max ?? 5;
  const scored = drafts
    .map((d) => ({ ...d, score: scoreRecommendation(d, opts) }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  if (scored.length <= max) return scored;
  const top = scored.slice(0, max);
  if (top.length >= min) return top;
  return scored.slice(0, Math.min(min, scored.length));
}

async function supplementalDrafts(company: Company): Promise<
  (RecommendationDraft & { evidence?: RecommendationEvidence[] })[]
> {
  const cid = company.id;
  const tid = company.tenantId;
  const base = { companyId: cid };
  const out: (RecommendationDraft & { evidence?: RecommendationEvidence[] })[] = [];

  const gaps = await listGaps({ companyId: cid, openOnly: true });
  if (gaps.length > 0) {
    const g = gaps[0];
    out.push({
      ...base,
      type: "seo_gap",
      title: "Close a Brand Brain knowledge gap",
      rationale: `Open knowledge gap blocks safe drafting: "${g.question.slice(0, 120)}". Answer or dismiss before scaling content.`,
      action: {
        kind: "task",
        objective: `Resolve knowledge gap for ${company.name}`,
        reviewHref: `/companies/${cid}/brand-brain`,
      },
      evidence: [{ signal: "knowledge_gap", observed: g.question }],
    });
  }

  const reviews = await listCompanyReviews(tid, [cid]);
  const negative = reviews.filter((r) => r.rating <= 3 || r.sentiment === "negative");
  if (negative.length > 0) {
    const r = negative[0];
    out.push({
      ...base,
      type: "review_gap",
      title: "Respond to negative reviews",
      rationale: `${negative.length} review(s) need attention — latest ${r.rating} stars from ${r.authorName}.`,
      action: {
        kind: "review",
        reviewHref: `/reviews`,
        objective: `Draft responses for ${negative.length} review(s)`,
      },
      evidence: [{ signal: "review_sentiment", observed: `${r.rating} stars — ${r.body.slice(0, 80)}` }],
    });
  }

  const members = await listLoyaltyMembers(tid, cid);
  if (members.length >= 5) {
    const top = [...members].sort((a, b) => b.pointsBalance - a.pointsBalance)[0];
    out.push({
      ...base,
      type: "loyalty_opportunity",
      title: "Reward loyal members",
      rationale: `${members.length} loyalty member(s); top balance ${top.pointsBalance} pts — run a points promo or tier upgrade.`,
      action: {
        kind: "campaign",
        objective: `Loyalty engagement campaign for ${company.name}`,
        audience: "loyalty members",
      },
      evidence: [{ signal: "loyalty_members", observed: `${members.length} active members` }],
    });
  }

  const contacts = await listCrmContacts(tid, cid);
  const stale = contacts.filter((c) => c.tags.includes("at_risk") || c.tags.includes("churned"));
  if (stale.length > 0) {
    out.push({
      ...base,
      type: "retention_risk",
      title: "Re-engage at-risk contacts",
      rationale: `${stale.length} CRM contact(s) tagged at-risk/churned — launch a win-back sequence.`,
      action: {
        kind: "campaign",
        objective: `Win-back campaign for ${company.name}`,
        audience: "at-risk customers",
      },
      evidence: [{ signal: "crm_retention", observed: `${stale.length} at-risk contacts` }],
    });
  }

  return out;
}

export async function generateRankedForCompany(company: Company): Promise<ScoredRecommendationDraft[]> {
  const today = now().slice(0, 10);
  const posts = (await listScheduledPosts(company.tenantId)).filter((p) => p.companyId === company.id);
  const calGap = detectCalendarGap(posts, company.id, today);
  const cadence = detectPublishingCadence(posts, company.id, today);
  const gapBoost = recommendationGapUrgencyBoost(calGap);
  const cadenceBoost = recommendationCadenceUrgencyBoost(cadence);

  const base = await generateForCompany(company);
  const extra = await supplementalDrafts(company);
  const byType = new Map<string, RecommendationDraft & { evidence?: RecommendationEvidence[] }>();
  for (const d of [...base, ...extra]) byType.set(d.type, d);
  let drafts = [...byType.values()];

  if (recommendationsMode() === "simulated") {
    drafts = drafts.map((d) => ({
      ...d,
      rationale: `[Simulated] ${d.rationale}`,
      evidence: [...(d.evidence ?? []), { signal: "mode", observed: "RECOMMENDATIONS_LIVE off" }],
    }));
  }

  return rankRecommendations(drafts, { gapBoost, cadenceBoost });
}

export function dismissedTypesFromHistory(
  history: RecommendationDismissRecord[],
  withinDays = 90,
): Set<RecommendationType> {
  const cutoff = Date.now() - withinDays * 86_400_000;
  const types = new Set<RecommendationType>();
  for (const row of history) {
    if (Date.parse(row.dismissedAt) >= cutoff) types.add(row.recommendationType);
  }
  return types;
}

export function buildAgencyPortfolioAttention(
  companies: Company[],
  recs: Recommendation[],
  opts?: { limit?: number },
): AgencyPortfolioAttention[] {
  const byCompany = new Map<string, Recommendation[]>();
  for (const r of recs) {
    if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, []);
    byCompany.get(r.companyId)!.push(r);
  }
  const rows: AgencyPortfolioAttention[] = companies.map((c) => {
    const list = byCompany.get(c.id) ?? [];
    const open = list.filter((r) => r.status === "open");
    const snoozed = list.filter((r) => r.status === "snoozed");
    const topScore = open.reduce((m, r) => Math.max(m, recommendationScore(r) ?? 0), 0);
    const headline =
      open.length === 0
        ? snoozed.length > 0
          ? `${snoozed.length} snoozed`
          : "No open recommendations"
        : `${open.length} open - top score ${topScore}`;
    return {
      companyId: c.id,
      companyName: c.name,
      openCount: open.length,
      snoozedCount: snoozed.length,
      topScore,
      headline,
    };
  });
  rows.sort(
    (a, b) =>
      b.openCount - a.openCount ||
      b.topScore - a.topScore ||
      a.companyName.localeCompare(b.companyName),
  );
  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}

export function dismissReasonOf(rec: Pick<Recommendation, "action" | "dismissReason">): string | undefined {
  return rec.dismissReason ?? rec.action.dismiss?.reason;
}

export function recommendationScore(rec: Pick<Recommendation, "score" | "action">): number | undefined {
  return rec.score ?? rec.action._score;
}

export function withDismissReason(
  action: Recommendation["action"],
  reason: string,
): Recommendation["action"] {
  return {
    ...action,
    dismiss: { reason, dismissedAt: new Date().toISOString() },
  };
}
