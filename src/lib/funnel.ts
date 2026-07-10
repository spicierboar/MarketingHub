// Digital journey & conversion funnel engine (W4 M35).

import {
  createConversionFunnel,
  createFunnelAbExperiment,
  createFunnelJourney,
  createFunnelLandingPage,
  getFunnelLandingPage,
  updateConversionFunnel,
  updateFunnelAbExperiment,
  updateFunnelLandingPage,
} from "@/lib/db";
import {
  fetchLiveAbVariantResults,
  fetchLiveLandingPageMetrics,
  funnelConfigured,
  funnelLive,
  simulateAbVariantResults,
  simulateLandingPageMetrics,
} from "@/lib/funnel-connectors";
import type {
  ConversionFunnel,
  FunnelAbExperiment,
  FunnelAbVariant,
  FunnelCtaKind,
  FunnelJourney,
  FunnelLandingPage,
  FunnelStage,
  FunnelStageMetric,
  FunnelTouchpoint,
} from "@/lib/types";

export { funnelConfigured, funnelLive } from "@/lib/funnel-connectors";
export { funnelApiKey } from "@/lib/funnel-connectors";

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

function seededIn(input: string, min: number, max: number): number {
  return min + (hashSeed(input) / 100000) * (max - min);
}

export function defaultJourneyTouchpoints(): FunnelTouchpoint[] {
  return [
    { id: "tp_awareness", label: "Social / Ads", channel: "paid_social", order: 1 },
    { id: "tp_landing", label: "Landing page", channel: "web", order: 2 },
    { id: "tp_cta", label: "CTA / Form", channel: "web", order: 3 },
    { id: "tp_booking", label: "Booking / Enquiry", channel: "conversion", order: 4 },
  ];
}

export function defaultFunnelStages(): FunnelStage[] {
  return [
    { id: "st_visit", name: "Visit", order: 1 },
    { id: "st_interest", name: "Interest", order: 2, ctaKind: "button" as FunnelCtaKind },
    { id: "st_form", name: "Form submit", order: 3, ctaKind: "form" as FunnelCtaKind },
    { id: "st_book", name: "Booking", order: 4, ctaKind: "booking" as FunnelCtaKind },
  ];
}

export function computeStageMetrics(funnel: ConversionFunnel, totalEntrants = 1000): FunnelStageMetric[] {
  const sorted = [...funnel.stages].sort((a, b) => a.order - b.order);
  let entrants = totalEntrants;
  return sorted.map((stage, idx) => {
    const retainPct = seededIn(`${funnel.id}:${stage.id}:retain`, 0.52, 0.88);
    const nextEntrants =
      idx === sorted.length - 1 ? entrants : Math.max(0, Math.round(entrants * retainPct));
    const dropOff = entrants - nextEntrants;
    const dropOffPct = entrants > 0 ? Math.round((dropOff / entrants) * 1000) / 10 : 0;
    const conversionRatePct =
      totalEntrants > 0 ? Math.round((nextEntrants / totalEntrants) * 1000) / 10 : 0;
    const metric: FunnelStageMetric = {
      stageId: stage.id,
      stageName: stage.name,
      order: stage.order,
      entrants,
      dropOff,
      dropOffPct,
      conversionRatePct,
      ctaKind: stage.ctaKind,
    };
    entrants = nextEntrants;
    return metric;
  });
}

export function totalDropOffPct(metrics: FunnelStageMetric[]): number {
  if (!metrics.length) return 0;
  const first = metrics[0]!.entrants;
  const last = metrics[metrics.length - 1]!.entrants - metrics[metrics.length - 1]!.dropOff;
  if (first <= 0) return 0;
  return Math.round(((first - last) / first) * 1000) / 10;
}

export function computeCtaMetrics(
  page: Pick<FunnelLandingPage, "viewCount" | "uniqueVisitors" | "ctaClicks" | "formSubmissions">,
) {
  const views = Math.max(page.viewCount, 1);
  const visitors = Math.max(page.uniqueVisitors, 1);
  return {
    ctaClickRatePct: Math.round((page.ctaClicks / views) * 1000) / 10,
    formConversionRatePct: Math.round((page.formSubmissions / views) * 1000) / 10,
    visitorToCtaPct: Math.round((page.ctaClicks / visitors) * 1000) / 10,
  };
}

export function determineAbWinner(experiment: FunnelAbExperiment): string | null {
  const results = simulateAbVariantResults(experiment.id, experiment.variants);
  if (!results.length) return null;
  const winner = results.reduce((best, r) =>
    r.conversionRatePct > best.conversionRatePct ? r : best,
  );
  return winner.variantId;
}

export async function resolveAbVariantResults(experiment: FunnelAbExperiment) {
  if (funnelConfigured()) {
    const live = await fetchLiveAbVariantResults(experiment.id, experiment.variants);
    if (live?.length) return live;
  }
  return simulateAbVariantResults(experiment.id, experiment.variants);
}

export async function createDefaultJourney(input: {
  companyId: string;
  name: string;
  createdById: string;
  description?: string;
}): Promise<FunnelJourney> {
  return createFunnelJourney({
    companyId: input.companyId,
    name: input.name,
    description: input.description,
    touchpoints: defaultJourneyTouchpoints(),
    status: "draft",
    createdById: input.createdById,
  });
}

export async function createDefaultConversionFunnel(input: {
  companyId: string;
  name: string;
  createdById: string;
  journeyId?: string | null;
}): Promise<ConversionFunnel> {
  return createConversionFunnel({
    companyId: input.companyId,
    name: input.name,
    journeyId: input.journeyId ?? null,
    stages: defaultFunnelStages(),
    status: "draft",
    createdById: input.createdById,
  });
}

export async function createDefaultLandingPage(input: {
  companyId: string;
  slug: string;
  title: string;
  createdById: string;
  funnelId?: string | null;
  url?: string;
}): Promise<FunnelLandingPage> {
  const sim = simulateLandingPageMetrics(`new:${input.slug}`, input.slug);
  return createFunnelLandingPage({
    companyId: input.companyId,
    funnelId: input.funnelId ?? null,
    slug: input.slug,
    title: input.title,
    url: input.url,
    ...sim,
  });
}

export function defaultAbVariants(): FunnelAbVariant[] {
  return [
    { id: "var_a", label: "Control", headline: "Book your stay today", ctaText: "Book now", weight: 50 },
    { id: "var_b", label: "Variant B", headline: "Limited rooms — reserve now", ctaText: "Check availability", weight: 50 },
  ];
}

export async function createDefaultAbExperiment(input: {
  companyId: string;
  name: string;
  createdById: string;
  funnelId?: string | null;
  landingPageId?: string | null;
}): Promise<FunnelAbExperiment> {
  return createFunnelAbExperiment({
    companyId: input.companyId,
    name: input.name,
    funnelId: input.funnelId ?? null,
    landingPageId: input.landingPageId ?? null,
    status: "draft",
    variants: defaultAbVariants(),
    winnerVariantId: null,
    createdById: input.createdById,
  });
}

export async function activateAbExperiment(experiment: FunnelAbExperiment): Promise<FunnelAbExperiment> {
  const winnerVariantId = determineAbWinner(experiment);
  return (
    (await updateFunnelAbExperiment(experiment.id, {
      status: "running",
      winnerVariantId,
      updatedAt: new Date().toISOString(),
    })) ?? { ...experiment, status: "running", winnerVariantId }
  );
}

export async function completeAbExperiment(experiment: FunnelAbExperiment): Promise<FunnelAbExperiment> {
  const results = await resolveAbVariantResults(experiment);
  const winner = results.reduce((best, r) =>
    r.conversionRatePct > best.conversionRatePct ? r : best,
  );
  return (
    (await updateFunnelAbExperiment(experiment.id, {
      status: "completed",
      winnerVariantId: winner.variantId,
      updatedAt: new Date().toISOString(),
    })) ?? { ...experiment, status: "completed", winnerVariantId: winner.variantId }
  );
}

export async function importFunnelAnalyticsExternal(
  _tenantId: string,
  companyId: string,
  landingPageId: string,
) {
  const page = await getFunnelLandingPage(landingPageId);
  if (!page || page.companyId !== companyId) {
    return { mode: funnelConfigured() ? ("live" as const) : ("simulated" as const), updated: false, detail: "page not found" };
  }
  if (funnelConfigured()) {
    const live = await fetchLiveLandingPageMetrics(page);
    if (!live) {
      return { mode: "live" as const, updated: false, detail: "live fetch returned null" };
    }
    await updateFunnelLandingPage(landingPageId, live);
    return { mode: "live" as const, updated: true, detail: "live metrics imported" };
  }
  const sim = simulateLandingPageMetrics(page.id, page.slug);
  await updateFunnelLandingPage(landingPageId, sim);
  return { mode: "simulated" as const, updated: true, detail: "simulated metrics applied" };
}

export async function activateConversionFunnel(funnel: ConversionFunnel): Promise<ConversionFunnel> {
  return (
    (await updateConversionFunnel(funnel.id, {
      status: "active",
      updatedAt: new Date().toISOString(),
    })) ?? { ...funnel, status: "active" }
  );
}
