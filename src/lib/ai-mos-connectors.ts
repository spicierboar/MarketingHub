// AI-MOS signal connectors (W5 M42) — simulated when AI_MOS_LIVE is off.

import { listCompanyReviews, listLoyaltyMembers, listLoyaltyReferrals } from "@/lib/db";
import { computeReputationScore } from "@/lib/reviews";
import type { Company } from "@/lib/types";

export function aiMosLive(): boolean {
  return process.env.AI_MOS_LIVE === "true";
}

/** Suggest-only is always enforced — no auto-execution or live spend. */
export function aiMosSuggestOnly(): boolean {
  return true;
}

export function aiMosConfigured(): boolean {
  return aiMosLive();
}

export function aiMosExecutionMode(): "suggest_only" {
  return "suggest_only";
}

export interface ReviewSignalBundle {
  negativeOpen: number;
  averageRating: number;
  totalReviews: number;
  responseRate: number;
  mode: "simulated" | "live";
}

export interface LoyaltySignalBundle {
  memberCount: number;
  inactiveCount: number;
  referralPending: number;
  lowEngagementRate: number;
  mode: "simulated" | "live";
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function simulatedReviewBundle(company: Company): ReviewSignalBundle {
  const seed = hashSeed(`${company.id}:reviews`);
  const totalReviews = 4 + (seed % 8);
  const negativeOpen = seed % 5 === 0 ? 3 : seed % 7 === 0 ? 1 : 0;
  const averageRating = negativeOpen >= 2 ? 3.2 : 4.1 + (seed % 8) / 10;
  const responseRate = negativeOpen >= 2 ? 0.25 : 0.65;
  return {
    negativeOpen,
    averageRating: Math.round(averageRating * 10) / 10,
    totalReviews,
    responseRate,
    mode: "simulated",
  };
}

export function simulatedLoyaltyBundle(company: Company): LoyaltySignalBundle {
  const seed = hashSeed(`${company.id}:loyalty`);
  const memberCount = 6 + (seed % 12);
  const inactiveCount = seed % 4 === 0 ? 5 : seed % 3 === 0 ? 2 : 1;
  const referralPending = seed % 5 === 0 ? 3 : 1;
  const lowEngagementRate = inactiveCount / Math.max(1, memberCount);
  return {
    memberCount,
    inactiveCount,
    referralPending,
    lowEngagementRate: Math.round(lowEngagementRate * 100) / 100,
    mode: "simulated",
  };
}

export async function loadReviewSignals(
  tenantId: string,
  company: Company,
): Promise<ReviewSignalBundle> {
  const reviews = await listCompanyReviews(tenantId, [company.id]);
  if (reviews.length > 0) {
    const rep = computeReputationScore(reviews);
    return {
      negativeOpen: rep.negativeOpen,
      averageRating: rep.averageRating,
      totalReviews: rep.totalReviews,
      responseRate: rep.responseRate,
      mode: aiMosConfigured() ? "live" : "simulated",
    };
  }
  if (!aiMosConfigured()) return simulatedReviewBundle(company);
  return {
    negativeOpen: 0,
    averageRating: 0,
    totalReviews: 0,
    responseRate: 0,
    mode: "live",
  };
}

export async function loadLoyaltySignals(
  tenantId: string,
  company: Company,
): Promise<LoyaltySignalBundle> {
  const [members, referrals] = await Promise.all([
    listLoyaltyMembers(tenantId, company.id),
    listLoyaltyReferrals(tenantId, company.id),
  ]);
  if (members.length > 0 || referrals.length > 0) {
    const inactiveCount = members.filter((m) => m.pointsBalance < 25 && m.stampsBalance < 2).length;
    const referralPending = referrals.filter((r) => r.status === "pending").length;
    const lowEngagementRate = inactiveCount / Math.max(1, members.length);
    return {
      memberCount: members.length,
      inactiveCount,
      referralPending,
      lowEngagementRate: Math.round(lowEngagementRate * 100) / 100,
      mode: aiMosConfigured() ? "live" : "simulated",
    };
  }
  if (!aiMosConfigured()) return simulatedLoyaltyBundle(company);
  return {
    memberCount: 0,
    inactiveCount: 0,
    referralPending: 0,
    lowEngagementRate: 0,
    mode: "live",
  };
}

export function reviewSignalActionable(bundle: ReviewSignalBundle): boolean {
  return (
    bundle.negativeOpen >= 2 ||
    (bundle.totalReviews >= 3 && bundle.averageRating < 4) ||
    (bundle.totalReviews >= 3 && bundle.responseRate < 0.5)
  );
}

export function loyaltySignalActionable(bundle: LoyaltySignalBundle): boolean {
  return (
    bundle.inactiveCount >= 3 ||
    bundle.referralPending >= 2 ||
    (bundle.memberCount >= 5 && bundle.lowEngagementRate >= 0.4)
  );
}
