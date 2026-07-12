// Free AI image / short-video quotas from the company's marketing package.
// Mirrors promo-allowance: package includes N/mo; over-quota needs the AI video
// add-on (or package-included video). Usage is counted from durable ai_runs
// (kinds image_gen / video_gen) for the calendar month — no extra schema.
// Ads media spend is always extra and never covered by these quotas.

import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { companyHasAddon } from "@/lib/entitlements";
import { listAiRuns } from "@/lib/db";
import type { AiRun, Company, Tenant } from "@/lib/types";

export type VisualsGenKind = "image" | "video";

export function visualsPeriodKey(isoDate: string = new Date().toISOString()): string {
  return isoDate.slice(0, 7); // YYYY-MM
}

function runsInPeriod(runs: AiRun[], periodKey: string, kind: "image_gen" | "video_gen"): number {
  return runs.filter(
    (r) => r.kind === kind && (r.createdAt || "").slice(0, 7) === periodKey,
  ).length;
}

export type VisualsQuotaSlice = {
  used: number;
  limit: number;
  remaining: number;
  /** True when AI video add-on is active or package includes video. */
  unlimited: boolean;
};

export type VisualsAllowanceSummary = {
  periodKey: string;
  images: VisualsQuotaSlice;
  videos: VisualsQuotaSlice;
  imageQuotaPerMonth: number;
  videoQuotaPerMonth: number;
  packageIncludesVideo: boolean;
  videoAddonActive: boolean;
};

function slice(used: number, limit: number, unlimited: boolean): VisualsQuotaSlice {
  if (unlimited) {
    return { used, limit, remaining: Number.POSITIVE_INFINITY, unlimited: true };
  }
  const capped = Math.max(0, Math.round(limit));
  return {
    used,
    limit: capped,
    remaining: Math.max(0, capped - used),
    unlimited: false,
  };
}

/**
 * Summarise free image/video quota for a company this calendar month.
 * Pass pre-fetched ai runs when available (page load); otherwise fetches.
 */
export async function visualsAllowanceSummary(
  company: Company,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
  opts?: {
    asOfIso?: string;
    videoAddonActive?: boolean;
    runs?: AiRun[];
  },
): Promise<VisualsAllowanceSummary> {
  const pkg = resolveCompanyPackage(company, tenant);
  const periodKey = visualsPeriodKey(opts?.asOfIso);
  const packageIncludesVideo = pkg.includedAddonIds.includes("video");
  const videoAddonActive =
    opts?.videoAddonActive ?? (await companyHasAddon(company.id, "video"));
  const unlimited = packageIncludesVideo || videoAddonActive;

  const runs =
    opts?.runs ??
    (await listAiRuns(company.tenantId, [company.id])).filter(
      (r) => r.companyId === company.id,
    );

  const imagesUsed = runsInPeriod(runs, periodKey, "image_gen");
  const videosUsed = runsInPeriod(runs, periodKey, "video_gen");

  return {
    periodKey,
    images: slice(imagesUsed, pkg.imageQuotaPerMonth, unlimited),
    videos: slice(videosUsed, pkg.videoQuotaPerMonth, unlimited),
    imageQuotaPerMonth: pkg.imageQuotaPerMonth,
    videoQuotaPerMonth: pkg.videoQuotaPerMonth,
    packageIncludesVideo,
    videoAddonActive,
  };
}

/** Whether the company may start `count` image or video generations now. */
export async function canGenerateVisuals(
  company: Company,
  kind: VisualsGenKind,
  count = 1,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const summary = await visualsAllowanceSummary(company, tenant);
  const sliceQuota = kind === "image" ? summary.images : summary.videos;
  if (sliceQuota.unlimited) return { ok: true };
  if (sliceQuota.remaining >= count) return { ok: true };
  const label = kind === "image" ? "AI image" : "AI video";
  const limit = kind === "image" ? summary.imageQuotaPerMonth : summary.videoQuotaPerMonth;
  return {
    ok: false,
    reason:
      `Free ${label} quota for this month is used (${sliceQuota.used}/${limit}). ` +
      `Enable the AI video add-on on AI Visuals (or Billing) for more, or wait until next month.`,
  };
}

/** Throwing gate for visuals actions — free quota first, then paid/included add-on. */
export async function assertVisualsGeneration(
  company: Company,
  kind: VisualsGenKind,
  count = 1,
  tenant?: Pick<Tenant, "marketingPackageCatalog"> | null,
): Promise<void> {
  const result = await canGenerateVisuals(company, kind, count, tenant);
  if (!result.ok) throw new Error(result.reason);
}

export function formatVisualsRemaining(sliceQuota: VisualsQuotaSlice): string {
  if (sliceQuota.unlimited) return "Unlimited (AI video included)";
  if (sliceQuota.limit <= 0) return "0 free this month";
  return `${sliceQuota.remaining} of ${sliceQuota.limit} free left this month`;
}
