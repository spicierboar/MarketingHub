// Self-test helpers for W7 M55 video studio + continuous learning.

import {
  createLearningLesson,
  createRecommendation,
  createRecommendationDismissRecord,
  listLearningLessons,
  updateRecommendation,
} from "@/lib/db";
import { learningLive, learningMode } from "@/lib/learning-connectors";
import {
  createHypothesis,
  listLessonsForCompany,
  recordDismissLesson,
  recordExperimentOutcome,
} from "@/lib/learning";
import { visualsLive } from "@/lib/visuals-connectors";
import {
  ALL_VIDEO_CHANNELS,
  buildChannelVariants,
  buildDraftSpec,
  buildScriptFromPack,
  getScriptPack,
  listScriptPacks,
  listVideoTemplates,
} from "@/lib/video-studio";
import type { Company } from "@/lib/types";

function stubCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_m55_stub",
    tenantId: "tn_m55_stub",
    name: "Harbour Bistro",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "restaurant",
      serviceAreas: ["Harbour"],
      services: ["Dinner", "Functions"],
      callsToAction: ["Book a table"],
      prohibitedClaims: ["best in Australia"],
      approvedClaims: ["Fresh local produce"],
      requiredDisclaimers: [],
      targetCustomers: "locals",
      brandVoice: "warm and welcoming",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkLearningLiveDefaultOff(): Promise<{ ok: boolean; detail: string }> {
  return { ok: !learningLive(), detail: `LEARNING_LIVE=${learningLive()} mode=${learningMode()}` };
}

export async function checkDismissRecordsLesson(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCompany();
  const lesson = await recordDismissLesson({
    tenantId: company.tenantId,
    companyId: company.id,
    recommendationType: "content_gap",
    title: "Fill content gap",
    reason: "Not relevant this quarter",
    dismissedById: "u_stub",
  });
  const listed = await listLessonsForCompany(company.tenantId, company.id);
  const ok =
    lesson.source === "recommendation_dismiss" &&
    lesson.dismissReason === "Not relevant this quarter" &&
    listed.some((l) => l.id === lesson.id);
  return { ok, detail: `lessonId=${lesson.id} count=${listed.length}` };
}

export async function checkHypothesisOutcome(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCompany({ id: "co_m55_hyp" });
  const hyp = await createHypothesis({
    tenantId: company.tenantId,
    companyId: company.id,
    title: "Reels drive bookings",
    statement: "Short-form video increases booking clicks",
    metric: "booking rate",
    createdById: "u_stub",
  });
  const updated = await recordExperimentOutcome({
    hypothesisId: hyp.id,
    outcome: "positive",
    notes: "15% lift in test week",
  });
  const lessons = await listLearningLessons(company.tenantId, [company.id]);
  const ok =
    updated?.status === "validated" &&
    updated.experimentOutcome === "positive" &&
    lessons.some((l) => l.source === "experiment_outcome");
  return { ok, detail: `status=${updated?.status} lessons=${lessons.length}` };
}

export async function checkVideoStudioTemplates(): Promise<{ ok: boolean; detail: string }> {
  const templates = listVideoTemplates();
  const packs = listScriptPacks();
  const ok = templates.length >= 5 && packs.length >= 6;
  return { ok, detail: `templates=${templates.length} packs=${packs.length}` };
}

export async function checkVideoStudioChannelVariants(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCompany();
  const pack = getScriptPack("sp_default");
  if (!pack) return { ok: false, detail: "missing pack" };
  const script = buildScriptFromPack(company, pack, "Chef special");
  const variants = buildChannelVariants({
    company,
    templateId: "service_spotlight",
    scriptPackId: "sp_default",
    topic: "Chef special",
    script,
    channels: ALL_VIDEO_CHANNELS,
  });
  const allPlaceholder = variants.every((v) => v.renderMode === (visualsLive() ? "live" : "placeholder"));
  const ok = variants.length === 4 && allPlaceholder && variants.every((v) => v.script.includes("Chef special"));
  return {
    ok,
    detail: `variants=${variants.length} render=${variants[0]?.renderMode} visualsLive=${visualsLive()}`,
  };
}

export async function checkVideoStudioDraftSpec(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCompany();
  const spec = buildDraftSpec({
    company,
    templateId: "offer_promo",
    scriptPackId: "op_flash",
    channel: "tiktok",
    topic: "Lunch deal",
  });
  const ok =
    spec.channel === "tiktok" &&
    spec.durationSec <= 25 &&
    spec.onScreenBeats.length > 0 &&
    spec.script.includes("Lunch deal");
  return { ok, detail: `channel=${spec.channelLabel} dur=${spec.durationSec}s` };
}

export async function checkLearningTenantIsolation(): Promise<{ ok: boolean; detail: string }> {
  const tenantA = "tn_m55_iso_a";
  const tenantB = "tn_m55_iso_b";
  await createLearningLesson({
    tenantId: tenantA,
    companyId: "co_iso_a",
    source: "manual",
    title: "Tenant A lesson",
    lesson: "iso",
    createdById: "u_a",
  });
  const aLessons = await listLearningLessons(tenantA);
  const bLessons = await listLearningLessons(tenantB);
  const ok = aLessons.some((l) => l.title === "Tenant A lesson") && bLessons.length === 0;
  return { ok, detail: `a=${aLessons.length} b=${bLessons.length}` };
}

export async function checkDismissIntegrationStub(): Promise<{ ok: boolean; detail: string }> {
  const companyId = "co_m55_int";
  const rec = await createRecommendation({
    companyId,
    type: "timing",
    title: "Post at peak hours",
    rationale: "Stub",
    action: { kind: "task", objective: "Schedule" },
    status: "open",
    createdById: "u_stub",
  });
  await updateRecommendation(rec.id, { status: "dismissed", dismissReason: "Already covered" });
  await createRecommendationDismissRecord({
    companyId,
    recommendationType: rec.type,
    title: rec.title,
    reason: "Already covered",
    dismissedById: "u_stub",
  });
  const lesson = await recordDismissLesson({
    tenantId: "tn_m55_stub",
    companyId,
    recommendationType: rec.type,
    title: rec.title,
    reason: "Already covered",
    dismissedById: "u_stub",
  });
  return { ok: lesson.recommendationType === "timing", detail: `type=${lesson.recommendationType}` };
}

export async function runLearningSelfTests(
  expect: (name: string, fn: () => Promise<{ ok: boolean; detail: string }>) => Promise<void>,
): Promise<void> {
  await expect("learning.liveDefaultOff", () => checkLearningLiveDefaultOff());
  await expect("learning.dismissRecordsLesson", () => checkDismissRecordsLesson());
  await expect("learning.hypothesisOutcome", () => checkHypothesisOutcome());
  await expect("learning.tenantIsolation", () => checkLearningTenantIsolation());
  await expect("videoStudio.templates", () => checkVideoStudioTemplates());
  await expect("videoStudio.channelVariants", () => checkVideoStudioChannelVariants());
  await expect("videoStudio.draftSpec", () => checkVideoStudioDraftSpec());
}

/** Standalone runner for /api/dev/self-test (same shape as other W7 modules). */
export async function runLearningSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  async function expect(
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>,
  ) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  await runLearningSelfTests(expect);
  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed: [] as string[],
    durationMs: Date.now() - start,
    checks,
  };
}
