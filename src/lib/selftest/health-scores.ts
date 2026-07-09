// Self-test helpers for V1 health scores (Module 10).

import {
  computeCompanyHealthScore,
  companiesNeedingAttention,
  DEFAULT_ATTENTION_THRESHOLD,
  HEALTH_FACTOR_WEIGHTS,
  type HealthFactorId,
} from "@/lib/health-scores";
import type { AdCampaign, Company, ContentItem, Lead, ScheduledPost } from "@/lib/types";

export function stubHealthCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_health_stub",
    tenantId: "tn_health_stub",
    name: "Harbour View Dental",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "Health & Dental",
      serviceAreas: ["Harbourside"],
      services: ["Check-up & clean"],
      callsToAction: ["Book online"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
    ...overrides,
  } as Company;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function checkScoreInRange(): Promise<{ ok: boolean; detail: string }> {
  const company = stubHealthCompany();
  const today = todayIso();
  const posts: Pick<ScheduledPost, "scheduledDate" | "status" | "companyId">[] = Array.from(
    { length: 5 },
    (_, i) => ({
      companyId: company.id,
      status: "published" as const,
      scheduledDate: addDays(today, -7 * (i + 1)),
    }),
  );
  const result = computeCompanyHealthScore({
    company,
    todayIso: today,
    posts,
    content: [],
    campaigns: [],
    leads: [],
  });
  const ok = result.score >= 0 && result.score <= 100 && result.factors.length === 4;
  return {
    ok,
    detail: `score=${result.score} factors=${result.factors.length}`,
  };
}

export async function checkFactorsExplainable(): Promise<{ ok: boolean; detail: string }> {
  const company = stubHealthCompany({ id: "co_health_explain" });
  const today = todayIso();
  const campaigns: AdCampaign[] = [
    {
      id: "adc_health_1",
      companyId: company.id,
      adAccountId: "ad_stub",
      platform: "meta_ads",
      name: "Bookings",
      objective: "leads",
      dailyBudgetUsd: 25,
      status: "active",
      startDate: addDays(today, -20),
      createdById: "u_stub",
      createdAt: today,
      updatedAt: today,
    },
  ];
  const content: Pick<ContentItem, "companyId" | "status">[] = [
    { companyId: company.id, status: "pending_approval" },
    { companyId: company.id, status: "pending_approval" },
  ];
  const result = computeCompanyHealthScore({
    company,
    todayIso: today,
    posts: [],
    content,
    campaigns,
    leads: [],
  });

  const factorIds = new Set(result.factors.map((f) => f.id));
  const expectedIds: HealthFactorId[] = Object.keys(HEALTH_FACTOR_WEIGHTS) as HealthFactorId[];
  const allPresent = expectedIds.every((id) => factorIds.has(id));
  const explainable = result.factors.every(
    (f) =>
      f.label.length > 3 &&
      f.evidence.length > 10 &&
      f.contribution >= 0 &&
      f.weight > 0 &&
      Math.abs(f.contribution - (f.score * f.weight)) < 0.2,
  );
  const ok = allPresent && explainable;
  return {
    ok,
    detail: `factors=${result.factors.map((f) => `${f.id}:${f.contribution}`).join(",")}`,
  };
}

export async function checkAgencyNeedsAttentionSort(): Promise<{ ok: boolean; detail: string }> {
  const today = todayIso();
  const makeScore = (id: string, name: string, published: number, pending: number) => {
    const company = stubHealthCompany({ id, name });
    const posts = Array.from({ length: published }, (_, i) => ({
      companyId: id,
      status: "published" as const,
      scheduledDate: addDays(today, -5 * (i + 1)),
    }));
    const content = Array.from({ length: pending }, () => ({
      companyId: id,
      status: "pending_approval" as const,
    }));
    return computeCompanyHealthScore({
      company,
      todayIso: today,
      posts,
      content,
      campaigns: [],
      leads: [] as Lead[],
    });
  };

  const scores = [
    makeScore("co_high", "Alpha Clinic", 6, 0),
    makeScore("co_mid", "Beta Retail", 3, 2),
    makeScore("co_low", "Gamma Cafe", 0, 8),
  ];
  const attention = companiesNeedingAttention(scores, {
    threshold: DEFAULT_ATTENTION_THRESHOLD,
  });
  const sorted =
    attention.length < 2 ||
    attention.every((s, i) => i === 0 || attention[i - 1].score <= s.score);
  const lowestFirst = attention[0]?.companyId === "co_low";
  const ok = sorted && attention.length >= 2 && lowestFirst;
  return {
    ok,
    detail: `attention=${attention.map((s) => `${s.companyName}:${s.score}`).join(" < ")}`,
  };
}
