// Self-test helpers for W7 executive dashboard (M52).

import {
  buildCompanyExecDash,
  compositeFromScorecards,
  scoreEngagementCard,
  scoreLocalSeoCard,
  scoreReputationCard,
  scoreRetentionCard,
} from "@/lib/exec-dash";
import { stubHealthCompany } from "@/lib/selftest/health-scores";
import type { CompanyHealthScore } from "@/lib/health-scores";

function stubHealth(score = 72): CompanyHealthScore {
  return {
    companyId: "co_health_stub",
    companyName: "Harbour View Dental",
    score,
    factors: [
      {
        id: "publishing_cadence",
        label: "Publishing cadence",
        score: 80,
        weight: 0.3,
        contribution: 24,
        evidence: "On track",
      },
    ],
    computedAt: new Date().toISOString(),
    needsAttention: score < 60,
  };
}

export function checkExecScorecardsExplainable(): { ok: boolean; detail: string } {
  const cards = [
    scoreReputationCard({ score: 70, averageRating: 4.2, totalReviews: 12, negativeOpen: 1 }),
    scoreLocalSeoCard(65, true),
    scoreEngagementCard({ published30d: 6, pendingApproval: 1 }),
    scoreRetentionCard(8),
  ];
  const ok = cards.every((c) => c.evidence.length > 10 && c.score >= 0 && c.score <= 100);
  return { ok, detail: `cards=${cards.length} composite=${compositeFromScorecards(cards)}` };
}

export function checkExecNextBestAction(): { ok: boolean; detail: string } {
  const company = stubHealthCompany();
  const dash = buildCompanyExecDash({
    company,
    health: stubHealth(48),
    reputation: { score: 40, averageRating: 3.1, totalReviews: 4, responseRate: 0.25, negativeOpen: 2 },
    localSeoScore: 50,
    gbpConnected: false,
    published30d: 1,
    pendingApproval: 5,
    loyaltyMembers: 0,
    openRecs: [],
  });
  const ok = dash.nextBest.length > 0 && dash.scorecards.length === 5 && dash.needsAttention;
  return {
    ok,
    detail: `nba=${dash.nextBest.length} overall=${dash.overall} cards=${dash.scorecards.map((c) => c.id).join(",")}`,
  };
}

export function checkExecPortfolioSort(): { ok: boolean; detail: string } {
  const a = buildCompanyExecDash({
    company: stubHealthCompany({ id: "a", name: "Alpha" }),
    health: stubHealth(90),
    reputation: { score: 90, averageRating: 4.8, totalReviews: 20, responseRate: 0.9, negativeOpen: 0 },
    localSeoScore: 88,
    gbpConnected: true,
    published30d: 10,
    pendingApproval: 0,
    loyaltyMembers: 40,
    openRecs: [],
  });
  const b = buildCompanyExecDash({
    company: stubHealthCompany({ id: "b", name: "Beta" }),
    health: stubHealth(40),
    reputation: { score: 30, averageRating: 2.5, totalReviews: 3, responseRate: 0, negativeOpen: 2 },
    localSeoScore: 40,
    gbpConnected: false,
    published30d: 0,
    pendingApproval: 8,
    loyaltyMembers: 0,
    openRecs: [],
  });
  const sorted = [a, b].sort((x, y) => x.overall - y.overall);
  const ok = sorted[0]!.companyId === "b" && sorted[0]!.overall < sorted[1]!.overall;
  return { ok, detail: `order=${sorted.map((r) => `${r.companyName}:${r.overall}`).join(" → ")}` };
}

export async function runExecDashSelfTest() {
  const started = Date.now();
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const expect = async (name: string, fn: () => { ok: boolean; detail: string } | Promise<{ ok: boolean; detail: string }>) => {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };
  await expect("execDash.scorecardsExplainable", () => checkExecScorecardsExplainable());
  await expect("execDash.nextBestAction", () => checkExecNextBestAction());
  await expect("execDash.portfolioSort", () => checkExecPortfolioSort());
  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed: [] as string[],
    durationMs: Date.now() - started,
    checks,
  };
}
