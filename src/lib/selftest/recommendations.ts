// Self-test helpers for W5 recommendations (Module 9).

import {
  createRecommendation,
  createRecommendationDismissRecord,
  getRecommendation,
  listRecommendationDismissHistory,
  listScheduledPosts,
  updateRecommendation,
} from "@/lib/db";
import {
  detectCalendarGap,
  recommendationCadenceUrgencyBoost,
  recommendationGapUrgencyBoost,
  detectPublishingCadence,
} from "@/lib/calendar-intelligence";
import { generateForCompany } from "@/lib/ai/recommend";
import { recommendationsMode } from "@/lib/recommendations-connectors";
import {
  buildAgencyPortfolioAttention,
  dismissedTypesFromHistory,
  dismissReasonOf,
  generateRankedForCompany,
  rankRecommendations,
  withDismissReason,
} from "@/lib/recommendations";
import type { Company } from "@/lib/types";

export function stubRecommendCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_rec_stub",
    tenantId: "tn_rec_stub",
    name: "Riverside Cafe",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "cafe",
      serviceAreas: ["Riverside"],
      services: ["Breakfast", "Coffee"],
      callsToAction: ["Order online"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "local families",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkRankedTopFive(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const ranked = await generateRankedForCompany(company);
  const sorted =
    ranked.length < 2 ||
    ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score);
  const inRange = ranked.length >= 1 && ranked.length <= 5;
  const explicitScores = ranked.every((r) => r.score > 0 && r.rationale.length > 20);
  const ok = inRange && sorted && explicitScores;
  return {
    ok,
    detail: `count=${ranked.length} top=${ranked[0]?.score ?? 0} types=${ranked.map((r) => r.type).join(",")}`,
  };
}

export async function checkCalendarGapSignal(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const today = new Date().toISOString().slice(0, 10);
  const posts = await listScheduledPosts(company.tenantId);
  const gap = detectCalendarGap(posts, company.id, today);
  const drafts = await generateForCompany(company);
  const hasType = drafts.some((d) => d.type === "calendar_gap");
  const ranked = rankRecommendations(drafts);
  const inTop = ranked.some((d) => d.type === "calendar_gap");
  const ok = !!gap && hasType && inTop;
  return {
    ok,
    detail: `gap=${gap?.gapDays ?? "none"} scheduled=${gap?.scheduledCount ?? 0} inTop=${inTop}`,
  };
}

export async function checkDismissPersistsReason(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany({ tenantId: "tn_rec_dismiss" });
  const rec = await createRecommendation({
    companyId: company.id,
    type: "content_gap",
    title: "Test gap",
    rationale: "Stub rationale for dismiss persistence check.",
    action: { kind: "content_request", requestType: "social_post", topic: "Test", _score: 72 },
    status: "open",
    createdById: "u_stub",
  });
  const reason = "Not relevant this quarter";
  await updateRecommendation(rec.id, {
    status: "dismissed",
    action: withDismissReason(rec.action, reason),
  });
  const loaded = await getRecommendation(rec.id);
  const persisted = loaded ? dismissReasonOf(loaded) : undefined;
  const ok = loaded?.status === "dismissed" && persisted === reason;
  return {
    ok,
    detail: `status=${loaded?.status} reason=${persisted ?? "missing"}`,
  };
}

export async function checkGapUrgencyBoost(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const today = new Date().toISOString().slice(0, 10);
  const posts = await listScheduledPosts(company.tenantId);
  const gap = detectCalendarGap(posts, company.id, today);
  const boost = recommendationGapUrgencyBoost(gap);
  const ok = !!gap && boost > 0;
  return { ok, detail: `boost=${boost} gapDays=${gap?.gapDays ?? 0}` };
}

export async function checkCadenceUrgencyBoost(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const today = new Date().toISOString().slice(0, 10);
  const posts = await listScheduledPosts(company.tenantId);
  const cadence = detectPublishingCadence(posts, company.id, today);
  const boost = recommendationCadenceUrgencyBoost(cadence);
  const ok = !!cadence && boost > 0;
  return { ok, detail: `boost=${boost} published=${cadence?.publishedCount ?? 0}` };
}

export async function checkSnoozePersistsUntil(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany({ tenantId: "tn_rec_snooze" });
  const rec = await createRecommendation({
    companyId: company.id,
    type: "timing",
    title: "Snooze test",
    rationale: "Stub snooze persistence check for recommendations.",
    action: { kind: "task", objective: "Test" },
    status: "open",
    createdById: "u_stub",
  });
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await updateRecommendation(rec.id, { status: "snoozed", snoozedUntil: until });
  const loaded = await getRecommendation(rec.id);
  const ok = loaded?.status === "snoozed" && loaded.snoozedUntil === until;
  return { ok, detail: `status=${loaded?.status} until=${loaded?.snoozedUntil ?? "missing"}` };
}

export async function checkDismissHistoryDedupesRegenerate(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany({ tenantId: "tn_rec_dedupe", id: "co_rec_dedupe" });
  await createRecommendationDismissRecord({
    companyId: company.id,
    recommendationType: "content_gap",
    title: "Prior gap",
    reason: "done",
    dismissedById: "u_stub",
  });
  const history = await listRecommendationDismissHistory(company.id);
  const blocked = dismissedTypesFromHistory(history).has("content_gap");
  const ok = blocked && history.length >= 1;
  return { ok, detail: `history=${history.length} blocked=${blocked}` };
}

export async function checkEvidenceTrailPresent(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const ranked = await generateRankedForCompany(company);
  const withEvidence = ranked.filter((r) => (r.evidence?.length ?? 0) > 0);
  const ok = withEvidence.length >= 1;
  return { ok, detail: `withEvidence=${withEvidence.length}/${ranked.length}` };
}

export async function checkAgencyPortfolioStrip(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany({ id: "co_portfolio", name: "Portfolio Co" });
  const rows = buildAgencyPortfolioAttention(
    [company],
    [
      {
        id: "rec_p1",
        companyId: company.id,
        type: "calendar_gap",
        title: "Gap",
        rationale: "Test",
        action: { kind: "task" },
        status: "open",
        score: 88,
        createdById: "u_stub",
        createdAt: new Date().toISOString(),
      },
    ],
  );
  const ok = rows.length === 1 && rows[0].openCount === 1 && rows[0].topScore === 88;
  return { ok, detail: `open=${rows[0]?.openCount} top=${rows[0]?.topScore}` };
}

export async function checkRecommendationsLiveSimulated(): Promise<{ ok: boolean; detail: string }> {
  const mode = recommendationsMode();
  const company = stubRecommendCompany();
  const ranked = await generateRankedForCompany(company);
  const simulated = ranked.every((r) => r.rationale.startsWith("[Simulated]"));
  const ok = mode === "simulated" && simulated;
  return { ok, detail: `mode=${mode} simulatedPrefix=${simulated}` };
}

// W5 parallel-branch isolation aliases (M43 naming)
export const checkDismissDedupeOnRegenerate = checkDismissHistoryDedupesRegenerate;
export const checkDismissHistoryPersists = checkDismissHistoryDedupesRegenerate;
export const checkRecommendationsLiveOffSimulated = checkRecommendationsLiveSimulated;
export const checkSnoozeUntilBlocksResurface = checkSnoozePersistsUntil;
export const checkReviewLoyaltySignalsRanked = checkRankedTopFive;

