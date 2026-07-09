// V1 module 9 — ranked recommendations wrapper (Phase 17 slice).
// Extends generateForCompany with explicit scoring, calendar-gap + cadence
// signals, and a 3–5 cap. Dismiss reasons persist via action.dismiss jsonb.

import { generateForCompany, type RecommendationDraft } from "@/lib/ai/recommend";
import type { Company, Recommendation, RecommendationType } from "@/lib/types";

export type { RecommendationDraft };
export { generateForCompany };

export interface ScoredRecommendationDraft extends RecommendationDraft {
  score: number;
}

/** Base urgency weights — higher = surfaced first. */
const TYPE_WEIGHTS: Record<RecommendationType, number> = {
  complaint_insight: 95,
  offer_refresh: 88,
  calendar_gap: 86,
  publishing_cadence: 82,
  stale_content: 78,
  best_platform: 76,
  content_gap: 72,
  top_performer_repurpose: 70,
  faq_insight: 66,
  timing: 62,
  next_campaign: 58,
  underperformer: 52,
};

export function scoreRecommendation(draft: RecommendationDraft): number {
  let score = TYPE_WEIGHTS[draft.type] ?? 50;
  const rationale = draft.rationale.toLowerCase();

  if (/\b0 post|no post|no published\b/.test(rationale)) score += 8;
  if (/\bcomplaint|service issue\b/.test(rationale)) score += 5;
  if (/\bending soon|expir/.test(rationale)) score += 6;
  if (/\bengagement|leads\b/.test(rationale) && draft.type === "best_platform") score += 4;
  if (/\bgap|thin|below target\b/.test(rationale)) score += 3;

  return Math.min(99, score);
}

/** Rank candidates and return the top 3–5 (fewer if data is thin). */
export function rankRecommendations(
  drafts: RecommendationDraft[],
  opts?: { min?: number; max?: number },
): ScoredRecommendationDraft[] {
  const min = opts?.min ?? 3;
  const max = opts?.max ?? 5;
  const scored = drafts
    .map((d) => ({ ...d, score: scoreRecommendation(d) }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  if (scored.length <= max) return scored;
  const top = scored.slice(0, max);
  if (top.length >= min) return top;
  return scored.slice(0, Math.min(min, scored.length));
}

export async function generateRankedForCompany(
  company: Company,
): Promise<ScoredRecommendationDraft[]> {
  return rankRecommendations(await generateForCompany(company));
}

export function dismissReasonOf(rec: Pick<Recommendation, "action" | "dismissReason">): string | undefined {
  return rec.dismissReason ?? rec.action.dismiss?.reason;
}

export function recommendationScore(
  rec: Pick<Recommendation, "score" | "action">,
): number | undefined {
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
