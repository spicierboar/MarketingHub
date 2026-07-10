// Live funnel / landing-page analytics connectors (W4 M35).
//
// Env-gated (FUNNEL_LIVE=true + FUNNEL_API_KEY): fetchLive* returns metrics from
// an external analytics provider. When off, callers fall back to deterministic
// simulators in this module.

import type { FunnelAbVariant, FunnelLandingPage } from "@/lib/types";

export function funnelLive(): boolean {
  return process.env.FUNNEL_LIVE === "true";
}

export function funnelApiKey(): string | undefined {
  return process.env.FUNNEL_API_KEY?.trim() || undefined;
}

export function funnelConfigured(): boolean {
  return funnelLive() && !!funnelApiKey();
}

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

export interface SimulatedLandingMetrics {
  viewCount: number;
  uniqueVisitors: number;
  ctaClicks: number;
  formSubmissions: number;
  bounceRatePct: number;
  avgTimeOnPageSec: number;
}

export function simulateLandingPageMetrics(pageId: string, slug?: string): SimulatedLandingMetrics {
  const seed = `${pageId}:${slug ?? "page"}`;
  const viewCount = Math.round(seededIn(seed + "views", 800, 12000));
  const uniqueVisitors = Math.round(viewCount * seededIn(seed + "uniq", 0.55, 0.82));
  const ctaClicks = Math.round(uniqueVisitors * seededIn(seed + "cta", 0.08, 0.28));
  const formSubmissions = Math.round(ctaClicks * seededIn(seed + "form", 0.18, 0.55));
  const bounceRatePct = Math.round(seededIn(seed + "bounce", 28, 68) * 10) / 10;
  const avgTimeOnPageSec = Math.round(seededIn(seed + "time", 22, 240));
  return { viewCount, uniqueVisitors, ctaClicks, formSubmissions, bounceRatePct, avgTimeOnPageSec };
}

export interface AbVariantResult {
  variantId: string;
  label: string;
  impressions: number;
  conversions: number;
  conversionRatePct: number;
}

export function simulateAbVariantResults(
  experimentId: string,
  variants: FunnelAbVariant[],
): AbVariantResult[] {
  return variants.map((variant) => {
    const seed = `${experimentId}:${variant.id}:${variant.label}`;
    const impressions = Math.round(seededIn(seed + "imp", 1200, 9000) * (variant.weight / 50));
    const conversionRatePct = Math.round(seededIn(seed + "cr", 1.2, 9.5) * 10) / 10;
    const conversions = Math.round(impressions * (conversionRatePct / 100));
    return {
      variantId: variant.id,
      label: variant.label,
      impressions,
      conversions,
      conversionRatePct,
    };
  });
}

export async function fetchLiveLandingPageMetrics(
  page: Pick<FunnelLandingPage, "id" | "slug" | "url">,
): Promise<SimulatedLandingMetrics | null> {
  if (!funnelConfigured()) return null;
  const base = process.env.FUNNEL_API_URL?.trim();
  const key = funnelApiKey();
  if (!base || !key) return null;
  try {
    const params = new URLSearchParams({ pageId: page.id, slug: page.slug });
    const res = await fetch(`${base}/landing-metrics?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as Partial<SimulatedLandingMetrics> | null;
    if (!json?.viewCount) return null;
    return {
      viewCount: json.viewCount,
      uniqueVisitors: json.uniqueVisitors ?? 0,
      ctaClicks: json.ctaClicks ?? 0,
      formSubmissions: json.formSubmissions ?? 0,
      bounceRatePct: json.bounceRatePct ?? 0,
      avgTimeOnPageSec: json.avgTimeOnPageSec ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchLiveAbVariantResults(
  experimentId: string,
  variants: FunnelAbVariant[],
): Promise<AbVariantResult[] | null> {
  if (!funnelConfigured()) return null;
  const base = process.env.FUNNEL_API_URL?.trim();
  const key = funnelApiKey();
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/ab-results/${encodeURIComponent(experimentId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { variants?: AbVariantResult[] } | null;
    if (!json?.variants?.length) return null;
    return json.variants.filter((v) => variants.some((x) => x.id === v.variantId));
  } catch {
    return null;
  }
}
