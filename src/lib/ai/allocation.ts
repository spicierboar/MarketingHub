// AI budget-allocation guidance (Module 6, §6 "AI recommends the allocation
// from performance data").
//
// Rule-based and grounded in real paid-performance data (CPL, lead value,
// ROAS) — the same deterministic-engine pattern as the AI Recommendation Engine
// (src/lib/ai/recommend.ts). It proposes how to split the client's monthly ad
// budget across their CONNECTED platforms and explains why, but an ADMIN must
// apply it: we never let a model silently move a client's money. Live AI (a
// Claude key) could enrich the NARRATIVE later, but the allocation math stays
// deterministic on purpose — it decides dollars.
//
// Guardrails baked in: only connected platforms receive budget; no platform is
// starved (MIN_SHARE) or allowed to hog everything (MAX_SHARE), so an untested
// channel keeps an exploratory slice and a temporary winner can't zero the rest.

import { campaignMetrics, type PaidMetrics } from "@/lib/paid";
import { AD_PLATFORMS } from "@/lib/types";
import type { AdBudget, AdCampaign, AdPlatform, Company } from "@/lib/types";

// A connected platform never drops below this or rises above this share, so the
// guidance diversifies rather than betting the whole budget on one channel.
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;
// Platforms with no spend history yet get this neutral "worth testing" weight so
// they aren't starved by a channel that merely has a head start.
const EXPLORATORY_WEIGHT = 1.0;

export interface PlatformGuidance {
  platform: AdPlatform;
  label: string;
  connected: boolean;
  hasData: boolean;
  spendUsd: number;
  leads: number;
  cplUsd: number | null;
  roas: number | null;
  currentShare: number;
  recommendedShare: number;
  recommendedMonthlyUsd: number;
}

export interface AllocationGuidance {
  hasConnected: boolean;
  hasData: boolean;
  monthlyBudgetUsd: number;
  perPlatform: PlatformGuidance[];
  recommended: Partial<Record<AdPlatform, number>>;
  rationale: string[];
  model: string;
}

// Normalise weights to shares summing to 1, then clamp every share into
// [MIN_SHARE, MAX_SHARE] and redistribute the residual across the unclamped
// platforms — iterated to convergence. Deterministic.
function boundedShares(weights: Map<AdPlatform, number>): Map<AdPlatform, number> {
  const keys = [...weights.keys()];
  if (keys.length === 0) return new Map();
  if (keys.length === 1) return new Map([[keys[0], 1]]);
  // Feasibility: with N platforms the bounds must be able to sum to 1.
  const min = Math.min(MIN_SHARE, 1 / keys.length);
  const max = Math.max(MAX_SHARE, 1 / keys.length);
  const total = keys.reduce((s, k) => s + Math.max(0, weights.get(k) ?? 0), 0);
  let shares = new Map<AdPlatform, number>(
    keys.map((k) => [k, total > 0 ? Math.max(0, weights.get(k) ?? 0) / total : 1 / keys.length]),
  );
  for (let iter = 0; iter < 8; iter++) {
    const clamped = new Map<AdPlatform, boolean>();
    let fixedSum = 0;
    for (const k of keys) {
      const v = shares.get(k)!;
      if (v <= min) { shares.set(k, min); clamped.set(k, true); fixedSum += min; }
      else if (v >= max) { shares.set(k, max); clamped.set(k, true); fixedSum += max; }
    }
    const free = keys.filter((k) => !clamped.get(k));
    if (free.length === 0) break;
    const freeBudget = 1 - fixedSum;
    const freeWeight = free.reduce((s, k) => s + shares.get(k)!, 0);
    let changed = false;
    for (const k of free) {
      const next = freeWeight > 0 ? (shares.get(k)! / freeWeight) * freeBudget : freeBudget / free.length;
      if (Math.abs(next - shares.get(k)!) > 1e-6) changed = true;
      shares.set(k, next);
    }
    if (!changed) break;
  }
  // Guard against tiny float drift so the shares sum to exactly 1. NOTE: for
  // N ≤ 2 platforms (the only case today — AD_PLATFORMS has 2) the clamp/
  // redistribute loop always lands on a bound-respecting, sum-1 result and this
  // renormalise is a no-op. For N ≥ 3 an all-clamped round can exit at sum ≠ 1
  // and this rescale could nudge a share just past a bound; if a third ad
  // platform is ever added, revisit with a proper water-filling allocation.
  const sum = keys.reduce((s, k) => s + shares.get(k)!, 0);
  if (sum > 0 && Math.abs(sum - 1) > 1e-9) {
    shares = new Map(keys.map((k) => [k, shares.get(k)! / sum]));
  }
  return shares;
}

function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-AU");
}

export function recommendAllocation(args: {
  company: Company | undefined;
  budget: AdBudget | undefined;
  campaigns: AdCampaign[];
  connectedPlatforms: Set<AdPlatform>;
}): AllocationGuidance {
  const { company, budget, campaigns, connectedPlatforms } = args;
  const monthlyBudgetUsd = Math.max(0, budget?.monthlyBudgetUsd ?? 0);

  // Aggregate simulated performance per platform.
  const agg = new Map<AdPlatform, PaidMetrics & { count: number }>();
  for (const { key } of AD_PLATFORMS) {
    agg.set(key, { spendUsd: 0, impressions: 0, clicks: 0, leads: 0, cpcUsd: null, cplUsd: null, ctr: 0, revenueUsd: 0, roas: null, count: 0 });
  }
  for (const c of campaigns) {
    const m = campaignMetrics(c, company);
    const a = agg.get(c.platform);
    if (!a) continue;
    a.spendUsd += m.spendUsd;
    a.leads += m.leads;
    a.revenueUsd += m.revenueUsd;
    a.count += 1;
  }
  for (const a of agg.values()) {
    a.cplUsd = a.leads ? a.spendUsd / a.leads : null;
    a.roas = a.spendUsd ? a.revenueUsd / a.spendUsd : null;
  }

  const connected = AD_PLATFORMS.filter((p) => connectedPlatforms.has(p.key));
  const current = budget?.allocation ?? {};

  // Weight each connected platform by observed efficiency (ROAS), with an
  // exploratory floor for platforms that have spend but no return yet and a
  // neutral weight for platforms with no data at all.
  const weights = new Map<AdPlatform, number>();
  let anyData = false;
  for (const p of connected) {
    const a = agg.get(p.key)!;
    if (a.spendUsd > 0) {
      anyData = true;
      // ROAS-driven, but never fully zero a channel that has spend — keep a
      // small exploratory floor so one bad month doesn't kill it outright.
      weights.set(p.key, Math.max(0.25, a.roas ?? 0));
    } else {
      weights.set(p.key, EXPLORATORY_WEIGHT);
    }
  }
  const shares = boundedShares(weights);

  const perPlatform: PlatformGuidance[] = AD_PLATFORMS.map(({ key, label }) => {
    const a = agg.get(key)!;
    const recShare = shares.get(key) ?? 0;
    return {
      platform: key,
      label,
      connected: connectedPlatforms.has(key),
      hasData: a.spendUsd > 0,
      spendUsd: a.spendUsd,
      leads: a.leads,
      cplUsd: a.cplUsd,
      roas: a.roas,
      currentShare: current[key] ?? 0,
      recommendedShare: recShare,
      recommendedMonthlyUsd: monthlyBudgetUsd * recShare,
    };
  });

  const recommended: Partial<Record<AdPlatform, number>> = {};
  for (const [k, v] of shares) recommended[k] = v;

  // ---- Rationale narrative ----------------------------------------------------
  const rationale: string[] = [];
  if (connected.length === 0) {
    rationale.push(
      "No ad accounts are connected yet. Connect the client's Google Ads and/or Meta ad account (delegated access) to receive an AI budget split — we manage the campaigns; their own card pays the platform.",
    );
  } else if (monthlyBudgetUsd <= 0) {
    rationale.push("Set a monthly ad budget to see the recommended dollar split per platform.");
  } else if (!anyData) {
    rationale.push(
      `No spend history yet, so the budget is split evenly across the ${connected.length} connected platform(s) to gather first-touch data. After a few weeks the guidance will shift budget toward the platform with the lower cost-per-lead and higher return.`,
    );
  } else {
    // Compare the connected platforms with data by ROAS / CPL.
    const withData = connected
      .map((p) => ({ p, a: agg.get(p.key)! }))
      .filter((x) => x.a.spendUsd > 0)
      .sort((a, b) => (b.a.roas ?? 0) - (a.a.roas ?? 0));
    const best = withData[0];
    if (best) {
      const cpl = best.a.cplUsd !== null ? ` at ${fmtUsd(best.a.cplUsd)} cost-per-lead` : "";
      const roas = best.a.roas !== null ? ` returning ${best.a.roas.toFixed(1)}× on spend` : "";
      rationale.push(
        `${best.p.label} is the strongest channel${cpl}${roas} — the guidance leans the budget toward it while keeping at least ${Math.round(MIN_SHARE * 100)}% on every connected platform so no channel is starved.`,
      );
    }
    for (const { p, a } of withData.slice(1)) {
      const cpl = a.cplUsd !== null ? `${fmtUsd(a.cplUsd)} CPL` : "no leads yet";
      rationale.push(
        `${p.label}: ${a.leads} lead(s) from ${fmtUsd(a.spendUsd)} spend (${cpl}). Recommended share ${Math.round((recommended[p.key] ?? 0) * 100)}%.`,
      );
    }
    // Note any connected platform with no data.
    for (const p of connected) {
      if ((agg.get(p.key)!.spendUsd) === 0) {
        rationale.push(
          `${p.label} has no spend yet — it keeps an exploratory ${Math.round((recommended[p.key] ?? 0) * 100)}% slice so it can be tested.`,
        );
      }
    }
  }

  return {
    hasConnected: connected.length > 0,
    hasData: anyData,
    monthlyBudgetUsd,
    perPlatform,
    recommended,
    rationale,
    model: "rule-based",
  };
}
