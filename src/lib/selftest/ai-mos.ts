// Self-test helpers for V1 AI-MOS (Module 11).

import {
  createAiMosOpportunity,
  getAiMosOpportunity,
  listAiRuns,
  listScheduledPosts,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import {
  detectOpportunitiesFromSignals,
  convertOpportunityToDraft,
  dismissOpportunity,
} from "@/lib/ai-mos";
import {
  computeCompanyHealthScore,
  DEFAULT_ATTENTION_THRESHOLD,
} from "@/lib/health-scores";
import { detectCalendarGap } from "@/lib/calendar-intelligence";
import type { Company, User } from "@/lib/types";

export function stubAiMosCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_aimos_stub",
    tenantId: "tn_aimos_stub",
    name: "Harbour Bistro",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "restaurant",
      serviceAreas: ["Harbour"],
      services: ["Dinner"],
      callsToAction: ["Book a table"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "local diners",
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

export async function checkSignalsProduceOpportunity(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAiMosCompany();
  const today = todayIso();
  const posts = await listScheduledPosts(company.tenantId);
  const gap = detectCalendarGap(posts, company.id, today);
  const health = computeCompanyHealthScore({
    company,
    todayIso: today,
    posts: [],
    content: Array.from({ length: 4 }, () => ({
      companyId: company.id,
      status: "pending_approval" as const,
    })),
    campaigns: [],
    leads: [],
  });
  const drafts = detectOpportunitiesFromSignals({
    company,
    health,
    calendarGap: gap,
    cadence: null,
    pendingApprovalCount: 4,
    topRecommendationTitle: "Boost weekday lunch trade",
    topRecommendationScore: 82,
  });
  const hasDiagnosis = drafts.some(
    (d) => d.diagnosis.length > 20 && d.suggestedAction.kind.length > 0,
  );
  const hasEvidence = drafts.some((d) => d.evidence.length > 0);
  const ok = drafts.length >= 2 && hasDiagnosis && hasEvidence;
  return {
    ok,
    detail: `drafts=${drafts.length} kinds=${drafts.map((d) => d.kind).join(",")}`,
  };
}

export async function checkConvertCreatesDraftOnly(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const opp = await createAiMosOpportunity({
    tenantId,
    companyId,
    kind: "publishing_cadence",
    title: "Test cadence opportunity",
    diagnosis: "Publishing cadence below target for self-test.",
    suggestedAction: {
      kind: "campaign",
      goal: "Increase weekday lunch bookings",
      objective: "Recover publishing cadence",
      audience: "local office workers",
    },
    evidence: [{ signal: "publishing_cadence", observed: "1/4 posts in 30 days" }],
    priority: 84,
    status: "open",
    createdById: userId,
  });

  const user = { id: userId, email: "selftest@example.com", tenantId } as User;
  const result = await convertOpportunityToDraft(opp, user);
  const updated = await getAiMosOpportunity(opp.id);
  const scheduled = await listScheduledPosts(tenantId);
  const hasScheduledForCampaign = scheduled.some((p) => p.companyId === companyId);

  const ok =
    result.resultType === "campaign" &&
    updated?.status === "converted" &&
    updated.resultType === "campaign" &&
    !hasScheduledForCampaign;
  return {
    ok,
    detail: `result=${result.resultType} status=${updated?.status} scheduled=${hasScheduledForCampaign}`,
  };
}

export async function checkDismissAudited(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const opp = await createAiMosOpportunity({
    tenantId,
    companyId,
    kind: "calendar_gap",
    title: "Test gap opportunity",
    diagnosis: "Calendar gap detected for dismiss audit check.",
    suggestedAction: {
      kind: "content_request",
      requestType: "social_post",
      topic: "Fill calendar gap",
    },
    evidence: [{ signal: "calendar_gap", observed: "0 posts in 14 days" }],
    priority: 88,
    status: "open",
    createdById: userId,
  });

  const user = { id: userId, email: "selftest@example.com", tenantId };
  const reason = "Not a priority this month";
  await dismissOpportunity(opp, user, reason);

  const updated = await getAiMosOpportunity(opp.id);
  const audit = await listAudit(tenantId, [companyId]);
  const dismissedAudit = audit.some(
    (e) => e.action === "ai_mos.dismissed" && e.targetId === opp.id,
  );
  const aiRuns = await listAiRuns(tenantId, [companyId]);
  const dismissRun = aiRuns.some((r) => r.kind === "ai_mos_dismiss");

  const ok =
    updated?.status === "dismissed" &&
    updated.dismissReason === reason &&
    dismissedAudit &&
    dismissRun;
  return {
    ok,
    detail: `status=${updated?.status} audit=${dismissedAudit} aiRun=${dismissRun}`,
  };
}

export async function checkHealthThresholdUsed(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAiMosCompany({ id: "co_aimos_threshold" });
  const today = todayIso();
  const lowHealth = computeCompanyHealthScore({
    company,
    todayIso: today,
    posts: [],
    content: Array.from({ length: 10 }, () => ({
      companyId: company.id,
      status: "pending_approval" as const,
    })),
    campaigns: [],
    leads: [],
  });
  const drafts = detectOpportunitiesFromSignals({
    company,
    health: lowHealth,
    calendarGap: null,
    cadence: null,
    pendingApprovalCount: 10,
  });
  const healthOpp = drafts.find((d) => d.kind === "health_decline");
  const ok =
    lowHealth.score < DEFAULT_ATTENTION_THRESHOLD &&
    !!healthOpp &&
    healthOpp.diagnosis.includes(String(DEFAULT_ATTENTION_THRESHOLD));
  return {
    ok,
    detail: `score=${lowHealth.score} healthOpp=${!!healthOpp}`,
  };
}
