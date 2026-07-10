// Self-test helpers for W5 AI-MOS (M42).

import {
  addMembership,
  createAiMosOpportunity,
  createCompany,
  createTenant,
  createUser,
  getCompany,
  getAiMosOpportunity,
  listAiMosOpportunities,
  listAiMosSignalRuns,
  listAiRuns,
  listScheduledPosts,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import {
  aiMosConfigured,
  aiMosExecutionMode,
  aiMosSuggestOnly,
  simulatedLoyaltyBundle,
  simulatedReviewBundle,
} from "@/lib/ai-mos-connectors";
import {
  detectOpportunitiesFromSignals,
  convertOpportunityToDraft,
  dismissOpportunity,
  recordCompanySignalRun,
  scanCompanyOpportunities,
  surfaceTenantOpportunities,
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

export function checkSimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return { ok: !aiMosConfigured(), detail: `AI_MOS_LIVE=${process.env.AI_MOS_LIVE ?? "unset"}` };
}

export function checkSuggestOnlyEnforced(): { ok: boolean; detail: string } {
  return { ok: aiMosSuggestOnly() && aiMosExecutionMode() === "suggest_only", detail: `mode=${aiMosExecutionMode()}` };
}

export async function checkSignalsProduceOpportunity(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAiMosCompany();
  const health = computeCompanyHealthScore({
    company, todayIso: todayIso(), posts: [],
    content: Array.from({ length: 4 }, () => ({ companyId: company.id, status: "pending_approval" as const })),
    campaigns: [], leads: [],
  });
  const drafts = detectOpportunitiesFromSignals({
    company, health, calendarGap: detectCalendarGap(await listScheduledPosts(company.tenantId), company.id, todayIso()),
    cadence: null, pendingApprovalCount: 4, topRecommendationTitle: "Boost weekday lunch trade", topRecommendationScore: 82,
  });
  const ok = drafts.length >= 2 && drafts.some((d) => d.evidence.length > 0);
  return { ok, detail: `drafts=${drafts.length}` };
}

export function checkReviewSignalProducesOpportunity(): { ok: boolean; detail: string } {
  const company = stubAiMosCompany({ id: "co_aimos_review" });
  const reviewSignal = simulatedReviewBundle(company);
  const drafts = detectOpportunitiesFromSignals({
    company,
    health: computeCompanyHealthScore({ company, todayIso: todayIso(), posts: [], content: [], campaigns: [], leads: [] }),
    calendarGap: null, cadence: null, pendingApprovalCount: 0, reviewSignal,
  });
  const reviewOpp = drafts.find((d) => d.kind === "review_signal");
  return { ok: !!reviewOpp, detail: `reviewOpp=${!!reviewOpp}` };
}

export function checkLoyaltySignalProducesOpportunity(): { ok: boolean; detail: string } {
  const company = stubAiMosCompany({ id: "co_aimos_loyalty_seed5" });
  const loyaltySignal = simulatedLoyaltyBundle(company);
  const drafts = detectOpportunitiesFromSignals({
    company,
    health: computeCompanyHealthScore({ company, todayIso: todayIso(), posts: [], content: [], campaigns: [], leads: [] }),
    calendarGap: null, cadence: null, pendingApprovalCount: 0, loyaltySignal,
  });
  const loyaltyOpp = drafts.find((d) => d.kind === "loyalty_signal");
  return { ok: !!loyaltyOpp, detail: `loyaltyOpp=${!!loyaltyOpp}` };
}

export async function checkConvertCreatesDraftOnly(companyId: string, userId: string, tenantId: string) {
  const opp = await createAiMosOpportunity({
    tenantId, companyId, kind: "publishing_cadence", title: "Test cadence opportunity",
    diagnosis: "Publishing cadence below target for self-test.",
    suggestedAction: { kind: "campaign", goal: "Increase weekday lunch bookings", objective: "Recover publishing cadence", audience: "local office workers" },
    evidence: [{ signal: "publishing_cadence", observed: "1/4 posts in 30 days" }], priority: 84, status: "open", createdById: userId,
  });
  const user = { id: userId, email: "selftest@example.com", tenantId } as User;
  const result = await convertOpportunityToDraft(opp, user);
  const updated = await getAiMosOpportunity(opp.id);
  const scheduled = await listScheduledPosts(tenantId);
  const ok = result.resultType === "campaign" && updated?.status === "converted" && !scheduled.some((p) => p.companyId === companyId);
  return { ok, detail: `result=${result.resultType}` };
}

export async function checkDismissAudited(companyId: string, userId: string, tenantId: string) {
  const opp = await createAiMosOpportunity({
    tenantId, companyId, kind: "calendar_gap", title: "Test gap opportunity", diagnosis: "Calendar gap detected.",
    suggestedAction: { kind: "content_request", requestType: "social_post", topic: "Fill calendar gap" },
    evidence: [{ signal: "calendar_gap", observed: "0 posts in 14 days" }], priority: 88, status: "open", createdById: userId,
  });
  const user = { id: userId, email: "selftest@example.com", tenantId };
  const reason = "Not a priority this month";
  await dismissOpportunity(opp, user, reason);
  const updated = await getAiMosOpportunity(opp.id);
  const audit = await listAudit(tenantId, [companyId]);
  const aiRuns = await listAiRuns(tenantId, [companyId]);
  const ok = updated?.status === "dismissed" && audit.some((e) => e.action === "ai_mos.dismissed") && aiRuns.some((r) => r.kind === "ai_mos_dismiss");
  return { ok, detail: `status=${updated?.status}` };
}

export async function checkHealthThresholdUsed() {
  const company = stubAiMosCompany({ id: "co_aimos_threshold" });
  const lowHealth = computeCompanyHealthScore({
    company, todayIso: todayIso(), posts: [],
    content: Array.from({ length: 10 }, () => ({ companyId: company.id, status: "pending_approval" as const })),
    campaigns: [], leads: [],
  });
  const drafts = detectOpportunitiesFromSignals({ company, health: lowHealth, calendarGap: null, cadence: null, pendingApprovalCount: 10 });
  const healthOpp = drafts.find((d) => d.kind === "health_decline");
  const ok = lowHealth.score < DEFAULT_ATTENTION_THRESHOLD && !!healthOpp && healthOpp.diagnosis.includes(String(DEFAULT_ATTENTION_THRESHOLD));
  return { ok, detail: `score=${lowHealth.score}` };
}

export function checkOpportunitiesSortedByPriority() {
  const company = stubAiMosCompany({ id: "co_aimos_sort" });
  const drafts = detectOpportunitiesFromSignals({
    company,
    health: computeCompanyHealthScore({ company, todayIso: todayIso(), posts: [], content: Array.from({ length: 5 }, () => ({ companyId: company.id, status: "pending_approval" as const })), campaigns: [], leads: [] }),
    calendarGap: { lookaheadDays: 14, scheduledCount: 0, minExpected: 3, gapDays: 8, daysSinceLastPublish: null },
    cadence: null, pendingApprovalCount: 5, topRecommendationTitle: "Refresh weekend brunch", topRecommendationScore: 85,
    reviewSignal: simulatedReviewBundle(company), loyaltySignal: simulatedLoyaltyBundle(company),
  });
  const sorted = drafts.every((d, i, arr) => i === 0 || arr[i - 1]!.priority >= d.priority);
  return { ok: sorted && drafts.length >= 3, detail: `count=${drafts.length}` };
}

export async function checkSignalRunRecorded(companyId: string, userId: string, tenantId: string) {
  await updateCompany(companyId, { status: "ai_ready" });
  const company = await getCompany(companyId);
  if (!company) return { ok: false, detail: "company missing" };
  const before = (await listAiMosSignalRuns(tenantId, [companyId])).length;
  const { drafts, signals } = await scanCompanyOpportunities(tenantId, company);
  await recordCompanySignalRun({
    tenantId,
    companyId,
    userId,
    signals,
    opportunityCount: drafts.length,
  });
  const after = await listAiMosSignalRuns(tenantId, [companyId]);
  const latest = after[0];
  return {
    ok: after.length > before && latest?.executionMode === "suggest_only",
    detail: `after=${after.length}`,
  };
}

export async function checkSurfaceDedupesByKind(companyId: string, userId: string, tenantId: string) {
  await updateCompany(companyId, { status: "ai_ready" });
  await surfaceTenantOpportunities(tenantId, userId, { companyIds: [companyId] });
  const firstCount = (await listAiMosOpportunities(tenantId, [companyId], "open")).length;
  await surfaceTenantOpportunities(tenantId, userId, { companyIds: [companyId] });
  const open = await listAiMosOpportunities(tenantId, [companyId], "open");
  const kinds = new Set(open.map((o) => o.kind));
  return { ok: open.length === kinds.size && open.length === firstCount, detail: `open=${open.length}` };
}

export async function runAiMosSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(name: string, fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string }) {
    try { const r = await fn(); checks.push({ name, ok: r.ok, detail: r.detail }); }
    catch (e) { checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  await expect("aiMos.simulatedWhenLiveOff", () => checkSimulatedWhenLiveOff());
  await expect("aiMos.suggestOnlyEnforced", () => checkSuggestOnlyEnforced());
  await expect("aiMos.signalsProduceOpportunity", () => checkSignalsProduceOpportunity());
  await expect("aiMos.reviewSignalProducesOpportunity", () => checkReviewSignalProducesOpportunity());
  await expect("aiMos.loyaltySignalProducesOpportunity", () => checkLoyaltySignalProducesOpportunity());
  await expect("aiMos.healthThresholdUsed", () => checkHealthThresholdUsed());
  await expect("aiMos.opportunitiesSortedByPriority", () => checkOpportunitiesSortedByPriority());
  const t = await createTenant({ name: "AI-MOS Persist", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `aimos-persist-${Date.now()}@example.dev`, name: "AI-MOS Persist", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "AI-MOS Persist Co", createdBy: user.id });
  await updateCompany(company.id, { status: "ai_ready" });
  await expect("aiMos.signalRunRecorded", () => checkSignalRunRecorded(company.id, user.id, t.id));
  await expect("aiMos.surfaceDedupesByKind", () => checkSurfaceDedupesByKind(company.id, user.id, t.id));
  await expect("aiMos.convertCreatesDraftOnly", () => checkConvertCreatesDraftOnly(company.id, user.id, t.id));
  await expect("aiMos.dismissAudited", () => checkDismissAudited(company.id, user.id, t.id));
  try { await purgeTenant(t.id); } catch { purgeFailed.push(t.id); }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && !purgeFailed.length, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - start, checks };
}
