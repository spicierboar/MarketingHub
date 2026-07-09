// Paid-advertising performance engine (Module 6).
//
// Live campaign execution runs on the Google Ads API + Meta Marketing API,
// which are gated on approval (the heaviest external gate). Until those land,
// per-campaign performance is SIMULATED deterministically — seeded by the
// campaign id so numbers are stable across reloads. This is the paid analogue
// of metricsForPost() in analytics.ts: the production drop-in is to replace
// campaignMetrics() with a pull from each platform's reporting API. Everything
// downstream (per-platform aggregation, CPL/ROAS, the management fee, the
// unified dashboard, the AI allocation guidance) is real logic that works
// unchanged on real numbers.
//
// MONEY DISCIPLINE (locked model): we NEVER front or hold ad spend. `spendUsd`
// here is the CLIENT's own spend (their card, billed by the platform). The only
// money we ever charge is the management fee (managementFeeUsd), invoiced via
// Stripe. Nothing in this module moves the client's ad money.

import { leadValue } from "@/lib/analytics";
import { now } from "@/lib/utils";
import type { AdBudget, AdCampaign, AdPlatform, Company, Lead } from "@/lib/types";
import { AD_PLATFORMS } from "@/lib/types";

// ---- deterministic seed (same FNV-1a scheme as analytics.ts) ------------------

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
function seededIn(str: string, min: number, max: number): number {
  return min + seed(str) * (max - min);
}

export interface PaidMetrics {
  spendUsd: number; // the CLIENT's spend (never ours)
  impressions: number;
  clicks: number;
  leads: number;
  cpcUsd: number | null; // spend / clicks
  cplUsd: number | null; // spend / leads
  ctr: number; // clicks / impressions
  revenueUsd: number; // leads × per-industry lead value
  roas: number | null; // revenue / spend
}

const EMPTY_PAID: PaidMetrics = {
  spendUsd: 0, impressions: 0, clicks: 0, leads: 0,
  cpcUsd: null, cplUsd: null, ctr: 0, revenueUsd: 0, roas: null,
};

// How many days of the trailing-30 reporting window a campaign was live —
// i.e. the days it was ACTUALLY spending, so the management fee (percent of
// spend) is never levied on phantom spend from a stopped campaign.
//   • draft            → 0 (never ran).
//   • active           → accrues to now.
//   • paused / ended   → accrues only up to when it STOPPED. We have no
//     dedicated stop timestamp, so the stop is the earliest of an explicit
//     endDate and updatedAt (the status flip stamps updatedAt) — a paused
//     campaign therefore freezes at its pause and stops billing, and an ended
//     campaign without an endDate closes at the moment it was ended, not today.
function activeDaysInWindow(campaign: AdCampaign): number {
  if (campaign.status === "draft") return 0;
  const nowMs = Date.parse(now());
  const windowStartMs = nowMs - 30 * 86_400_000;
  const startMs = Math.max(Date.parse(campaign.startDate + "T00:00:00.000Z"), windowStartMs);
  const endDateMs = campaign.endDate ? Date.parse(campaign.endDate + "T23:59:59.999Z") : nowMs;
  const stopMs =
    campaign.status === "active"
      ? nowMs
      : Math.min(endDateMs, Date.parse(campaign.updatedAt) || nowMs);
  const endMs = Math.min(stopMs, nowMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.min(30, Math.max(0, Math.round((endMs - startMs) / 86_400_000)) || 1);
}

// Simulated performance for one campaign over the trailing-30-day window. Draft
// campaigns report nothing. Spend paces slightly under the daily budget (never
// over — we obey the client's ceiling); realistic CPM / CTR / conversion bands.
export function campaignMetrics(campaign: AdCampaign, company: Company | undefined): PaidMetrics {
  const days = activeDaysInWindow(campaign);
  if (days === 0 || campaign.dailyBudgetUsd <= 0) return { ...EMPTY_PAID };
  const s = campaign.id;
  const spendUsd = Math.round(campaign.dailyBudgetUsd * days * seededIn(s + "pace", 0.78, 0.99));
  if (spendUsd <= 0) return { ...EMPTY_PAID };
  // impressions per dollar ≈ 1000/CPM; CPM band $7–$14 → ~70–140 impr/$.
  const impressions = Math.round(spendUsd * seededIn(s + "impr", 70, 140));
  const clicks = Math.round(impressions * seededIn(s + "ctr", 0.008, 0.025));
  const leads = Math.round(clicks * seededIn(s + "conv", 0.02, 0.09));
  const revenueUsd = leads * leadValue(company);
  return {
    spendUsd,
    impressions,
    clicks,
    leads,
    cpcUsd: clicks ? spendUsd / clicks : null,
    cplUsd: leads ? spendUsd / leads : null,
    ctr: impressions ? clicks / impressions : 0,
    revenueUsd,
    roas: spendUsd ? revenueUsd / spendUsd : null,
  };
}

export function sumPaid(rows: PaidMetrics[]): PaidMetrics {
  const t = rows.reduce(
    (acc, m) => ({
      spendUsd: acc.spendUsd + m.spendUsd,
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      leads: acc.leads + m.leads,
      revenueUsd: acc.revenueUsd + m.revenueUsd,
    }),
    { spendUsd: 0, impressions: 0, clicks: 0, leads: 0, revenueUsd: 0 },
  );
  return {
    ...t,
    cpcUsd: t.clicks ? t.spendUsd / t.clicks : null,
    cplUsd: t.leads ? t.spendUsd / t.leads : null,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    roas: t.spendUsd ? t.revenueUsd / t.spendUsd : null,
  };
}

// ---- management fee (the ONLY money we charge) --------------------------------

// The management fee for a period, from the budget's terms and the actual
// managed spend. percent_of_spend: feePercent × spend. flat_monthly: feeFlatUsd,
// but only when there was managed spend to justify it.
export function managementFeeUsd(budget: AdBudget | undefined, managedSpendUsd: number): number {
  if (!budget) return 0;
  if (budget.feeModel === "flat_monthly") {
    return managedSpendUsd > 0 ? Math.max(0, budget.feeFlatUsd) : 0;
  }
  return Math.max(0, budget.feePercent) * Math.max(0, managedSpendUsd);
}

// ---- per-company + per-platform rollup ----------------------------------------

export interface PlatformRollup {
  platform: AdPlatform;
  label: string;
  connected: boolean;
  campaigns: number;
  metrics: PaidMetrics;
}

export interface CompanyPaidSummary {
  companyId: string;
  totals: PaidMetrics;
  byPlatform: PlatformRollup[];
  leadsCaptured: number; // count of ingested Lead rows (attribution)
  managementFeeUsd: number;
}

// Roll a company's campaigns up by platform + compute the fee. `connectedSet`
// carries which platforms have a connected ad account (for the AI guidance +
// the dashboard's "connect me" prompts).
export function companyPaidSummary(args: {
  company: Company | undefined;
  campaigns: AdCampaign[];
  leads: Lead[];
  budget: AdBudget | undefined;
  connectedPlatforms: Set<AdPlatform>;
}): CompanyPaidSummary {
  const { company, campaigns, leads, budget, connectedPlatforms } = args;
  const metricsByCampaign = campaigns.map((c) => ({ c, m: campaignMetrics(c, company) }));
  const byPlatform: PlatformRollup[] = AD_PLATFORMS.map(({ key, label }) => {
    const rows = metricsByCampaign.filter((x) => x.c.platform === key);
    return {
      platform: key,
      label,
      connected: connectedPlatforms.has(key),
      campaigns: rows.length,
      metrics: sumPaid(rows.map((x) => x.m)),
    };
  });
  const totals = sumPaid(metricsByCampaign.map((x) => x.m));
  return {
    companyId: company?.id ?? "",
    totals,
    byPlatform,
    leadsCaptured: leads.length,
    managementFeeUsd: managementFeeUsd(budget, totals.spendUsd),
  };
}
