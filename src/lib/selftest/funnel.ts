// Self-test helpers for W4 M35 funnel / A/B module.

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  listConversionFunnels,
  listFunnelAbExperiments,
  listFunnelJourneys,
  listFunnelLandingPages,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  computeCtaMetrics,
  computeStageMetrics,
  createDefaultAbExperiment,
  createDefaultConversionFunnel,
  createDefaultJourney,
  createDefaultLandingPage,
  determineAbWinner,
  importFunnelAnalyticsExternal,
  totalDropOffPct,
} from "@/lib/funnel";
import {
  fetchLiveAbVariantResults,
  fetchLiveLandingPageMetrics,
  funnelConfigured,
  funnelLive,
  simulateAbVariantResults,
  simulateLandingPageMetrics,
} from "@/lib/funnel-connectors";
import type { ConversionFunnel, FunnelAbVariant } from "@/lib/types";

const STUB_VARIANTS: FunnelAbVariant[] = [
  { id: "var_a", label: "A", headline: "Head A", ctaText: "Go", weight: 50 },
  { id: "var_b", label: "B", headline: "Head B", ctaText: "Start", weight: 50 },
];

const STUB_FUNNEL: ConversionFunnel = {
  id: "fnl_stub",
  companyId: "co_stub",
  name: "Stub funnel",
  stages: [
    { id: "s1", name: "Visit", order: 1 },
    { id: "s2", name: "Form", order: 2, ctaKind: "form" },
    { id: "s3", name: "Book", order: 3, ctaKind: "booking" },
  ],
  status: "draft",
  createdById: "u_stub",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export async function checkFunnelSimulatedWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  return { ok: !funnelLive(), detail: `FUNNEL_LIVE=${funnelLive()}` };
}

export async function checkFunnelDropOffDeterministic(): Promise<{ ok: boolean; detail: string }> {
  const a = computeStageMetrics(STUB_FUNNEL, 1000);
  const b = computeStageMetrics(STUB_FUNNEL, 1000);
  const dropA = totalDropOffPct(a);
  const dropB = totalDropOffPct(b);
  const ok = a.length === 3 && a[0]!.entrants === 1000 && dropA === dropB && dropA > 0;
  return { ok, detail: `stages=${a.length} dropOff=${dropA}%` };
}

export async function checkFunnelLandingAnalyticsSimulated(): Promise<{ ok: boolean; detail: string }> {
  const m1 = simulateLandingPageMetrics("flp_test", "summer-offer");
  const m2 = simulateLandingPageMetrics("flp_test", "summer-offer");
  const ok = !funnelConfigured() && m1.viewCount === m2.viewCount && m1.viewCount > 0;
  return { ok, detail: `views=${m1.viewCount}` };
}

export async function checkFunnelCtaConversionMetrics(): Promise<{ ok: boolean; detail: string }> {
  const cta = computeCtaMetrics({
    viewCount: 1000,
    uniqueVisitors: 600,
    ctaClicks: 120,
    formSubmissions: 36,
  });
  const ok = cta.ctaClickRatePct === 12 && cta.formConversionRatePct === 3.6 && cta.visitorToCtaPct === 20;
  return { ok, detail: `cta=${cta.ctaClickRatePct}% form=${cta.formConversionRatePct}%` };
}

export async function checkFunnelAbTestDeterministicWinner(): Promise<{ ok: boolean; detail: string }> {
  const results = simulateAbVariantResults("fab_det", STUB_VARIANTS);
  const again = simulateAbVariantResults("fab_det", STUB_VARIANTS);
  const winner = determineAbWinner({
    id: "fab_det",
    companyId: "co",
    name: "Test",
    status: "draft",
    variants: STUB_VARIANTS,
    createdById: "u",
    createdAt: "",
    updatedAt: "",
  });
  const ok =
    results.length === 2 &&
    results[0]!.impressions === again[0]!.impressions &&
    !!winner &&
    STUB_VARIANTS.some((v) => v.id === winner);
  return { ok, detail: `winner=${winner}` };
}

export async function checkFunnelFetchNullWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const landing = await fetchLiveLandingPageMetrics({ id: "flp_x", slug: "x" });
  const ab = await fetchLiveAbVariantResults("fab_x", STUB_VARIANTS);
  const ok = !funnelConfigured() && landing === null && ab === null;
  return { ok, detail: `configured=${funnelConfigured()}` };
}

export async function runFunnelSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];

  async function expect(
    name: string,
    fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string },
  ) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  await expect("funnel.simulatedWhenLiveOff", () => checkFunnelSimulatedWhenLiveOff());
  await expect("funnel.dropOffDeterministic", () => checkFunnelDropOffDeterministic());
  await expect("funnel.landingAnalyticsSimulated", () => checkFunnelLandingAnalyticsSimulated());
  await expect("funnel.ctaConversionMetrics", () => checkFunnelCtaConversionMetrics());
  await expect("funnel.abTestDeterministicWinner", () => checkFunnelAbTestDeterministicWinner());
  await expect("funnel.fetchNullWhenLiveOff", () => checkFunnelFetchNullWhenLiveOff());

  let tenantId: string | undefined;
  try {
    const suffix = `${Date.now()}`;
    const tenant = await createTenant({
      name: "Funnel ST",
      kind: "agency",
      plan: "starter",
      status: "active",
      timezone: "Australia/Sydney",
    });
    tenantId = tenant.id;
    const admin = await createUser({
      email: `funnel+${suffix}@selftest.dev`,
      name: "Funnel Tester",
      role: "admin",
    });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "owner" });
    const company = await createCompany({ tenantId: tenant.id, name: "Funnel Co", createdBy: admin.id });
    await updateCompany(company.id, { status: "approved" });

    const journey = await createDefaultJourney({
      companyId: company.id,
      name: "Guest journey",
      createdById: admin.id,
    });
    checks.push({
      name: "funnel.journeyPersisted",
      ok: (await listFunnelJourneys(tenant.id, company.id)).some((j) => j.id === journey.id),
      detail: `touchpoints=${journey.touchpoints.length}`,
    });

    const funnel = await createDefaultConversionFunnel({
      companyId: company.id,
      name: "Booking funnel",
      journeyId: journey.id,
      createdById: admin.id,
    });
    const metrics = computeStageMetrics(funnel, 500);
    checks.push({
      name: "funnel.stageMetrics",
      ok: metrics.length === 4 && metrics[0]!.entrants === 500,
      detail: `dropOff=${totalDropOffPct(metrics)}%`,
    });

    const page = await createDefaultLandingPage({
      companyId: company.id,
      slug: `offer-${suffix}`,
      title: "Summer offer",
      funnelId: funnel.id,
      createdById: admin.id,
    });
    checks.push({
      name: "funnel.landingPagePersisted",
      ok: (await listFunnelLandingPages(tenant.id, company.id)).some((p) => p.id === page.id),
      detail: `views=${page.viewCount}`,
    });

    const imp = await importFunnelAnalyticsExternal(tenant.id, company.id, page.id);
    checks.push({
      name: "funnel.importSimulated",
      ok: imp.mode === "simulated" && imp.updated,
      detail: imp.detail,
    });

    const experiment = await createDefaultAbExperiment({
      companyId: company.id,
      name: "Headline test",
      funnelId: funnel.id,
      landingPageId: page.id,
      createdById: admin.id,
    });
    const winner = determineAbWinner(experiment);
    checks.push({
      name: "funnel.abExperimentPersisted",
      ok:
        (await listFunnelAbExperiments(tenant.id, company.id)).some((e) => e.id === experiment.id) &&
        !!winner,
      detail: `winner=${winner}`,
    });

    checks.push({
      name: "funnel.conversionFunnelListed",
      ok: (await listConversionFunnels(tenant.id, company.id)).length >= 1,
    });
  } finally {
    if (tenantId) {
      try {
        await purgeTenant(tenantId);
      } catch {
        purgeFailed.push(tenantId);
      }
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && !purgeFailed.length,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - start,
    checks,
  };
}
