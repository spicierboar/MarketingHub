// Resolve company / client Strategy panel state from managed delivery + package.

import {
  getCampaign,
  getCompany,
  getManagedDeliveryRun,
  getTenant,
  listManagedDeliveryRuns,
  updateCompany,
} from "@/lib/db";
import { unpackKeyMessage } from "@/lib/campaign-builder";
import {
  backfillDetailedStrategyFromThin,
  findStrategyVersion,
  listStrategyVersions,
} from "@/lib/managed-service/detailed-strategy";
import { clientStatusMessage } from "@/lib/managed-service/status-copy";
import {
  isStrategyEligible,
  STRATEGY_DUE_HOURS,
  STRATEGY_ELIGIBLE_HOURS,
} from "@/lib/managed-service/delivery-runner";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { now } from "@/lib/utils";
import type {
  Company,
  DetailedMarketingStrategy,
  ManagedDeliveryRun,
} from "@/lib/types";

export type StrategyVisibility =
  | "none"
  | "needs_package"
  | "waiting"
  | "preparing"
  | "ready"
  | "blocked"
  | "failed";

export interface CompanyStrategyView {
  visibility: StrategyVisibility;
  statusLine: string;
  packageName: string;
  packagePriceAud: number;
  channels: string[];
  postsPerMonth: number;
  strategySummary: string | null;
  strategyChannelPlan: string | null;
  /** Full structured strategy document (objectives, personas, roadmap). */
  detailedStrategy: DetailedMarketingStrategy | null;
  /** All versions newest-first for list / deep-link. */
  strategyVersions: DetailedMarketingStrategy[];
  campaignId: string | null;
  campaignHref: string | null;
  eligibleAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  eligible: boolean;
  hoursUntilEligible: number | null;
  runPhase: string | null;
  runId: string | null;
  eligibleHours: number;
  dueHours: number;
  demoImmediate: boolean;
  /** True when package assigned but Checkout / webhook not yet settled. */
  packageChangePendingBilling: boolean;
}

function hoursUntil(iso: string, atIso: string): number {
  const ms = new Date(iso).getTime() - new Date(atIso).getTime();
  return Math.max(0, ms / 3_600_000);
}

export async function buildCompanyStrategyView(
  company: Company,
  opts?: { atIso?: string; demoImmediate?: boolean; version?: number | null },
): Promise<CompanyStrategyView> {
  const at = opts?.atIso ?? now();
  const tenant = await getTenant(company.tenantId);
  const pkg = resolveCompanyPackage(company, tenant);
  const ms = company.profile.managedService;
  const runs = await listManagedDeliveryRuns(company.tenantId, company.id);
  const latest = runs[0] as ManagedDeliveryRun | undefined;
  const run =
    (ms?.lastDeliveryRunId
      ? await getManagedDeliveryRun(ms.lastDeliveryRunId)
      : undefined) ?? latest;

  let strategySummary = ms?.strategySummary?.trim() || null;
  let strategyChannelPlan = ms?.strategyChannelPlan?.trim() || null;
  let campaignId = run?.campaignId ?? null;

  if ((!strategySummary || !strategyChannelPlan) && campaignId) {
    const campaign = await getCampaign(campaignId);
    if (campaign) {
      const unpacked = unpackKeyMessage(campaign.keyMessage);
      if (!strategySummary && unpacked.strategy) strategySummary = unpacked.strategy;
      if (!strategyChannelPlan && unpacked.meta?.channelPlan) {
        strategyChannelPlan = unpacked.meta.channelPlan;
      }
    }
  }

  let detailedStrategy: DetailedMarketingStrategy | null =
    ms?.detailedStrategy ?? null;

  // Upgrade thin summary-only stamps to the structured document on read.
  if (!detailedStrategy && (ms?.strategySummary || ms?.strategyCompletedAt)) {
    const runVersion = run?.strategyVersion && run.strategyVersion > 0 ? run.strategyVersion : 1;
    const backfill = backfillDetailedStrategyFromThin({
      company,
      pkg,
      channels: pkg.channels,
      version: runVersion,
    });
    if (backfill && ms) {
      await updateCompany(company.id, {
        profile: {
          ...company.profile,
          managedService: {
            ...ms,
            detailedStrategy: backfill,
            strategySummary: ms.strategySummary ?? backfill.executiveSummary,
            strategyChannelPlan:
              ms.strategyChannelPlan ??
              backfill.channels
                .map((c) => `${c.channel}: ${c.tactics.slice(0, 2).join("; ")}`)
                .join(" · "),
          },
        },
      });
      detailedStrategy = backfill;
    }
  }

  if (opts?.version != null && Number.isFinite(opts.version)) {
    const refreshedMs = (await getCompany(company.id))?.profile.managedService ?? ms;
    detailedStrategy =
      findStrategyVersion(
        refreshedMs?.detailedStrategy ?? detailedStrategy ?? undefined,
        refreshedMs?.detailedStrategyHistory ?? ms?.detailedStrategyHistory,
        opts.version,
      ) ?? detailedStrategy;
  }
  if (detailedStrategy) {
    if (!strategySummary) strategySummary = detailedStrategy.executiveSummary;
    if (!strategyChannelPlan) {
      strategyChannelPlan = detailedStrategy.channels
        .map((c) => `${c.channel}: ${c.tactics.slice(0, 2).join("; ")}`)
        .join(" · ");
    }
  }

  const finalVersions = listStrategyVersions(
    detailedStrategy ?? ms?.detailedStrategy,
    ms?.detailedStrategyHistory,
  );

  const eligibleAt = run?.strategyEligibleAt ?? ms?.strategyEligibleAt ?? null;
  const dueAt = run?.strategyDueAt ?? ms?.strategyDueAt ?? null;
  const completedAt =
    run?.strategyCompletedAt ?? ms?.strategyCompletedAt ?? null;
  const eligible = run
    ? isStrategyEligible(run, at)
    : eligibleAt
      ? new Date(at).getTime() >= new Date(eligibleAt).getTime()
      : false;

  let visibility: StrategyVisibility = "none";
  const hasExplicitPackage = Boolean(ms?.marketingPackageId);
  if (run?.phase === "blocked") visibility = "blocked";
  else if (run?.phase === "failed") visibility = "failed";
  else if (detailedStrategy || strategySummary || completedAt) visibility = "ready";
  else if (run && !eligible) visibility = "waiting";
  else if (run) visibility = "preparing";
  else if (!hasExplicitPackage) visibility = "needs_package";
  // Package assigned (incl. default Basic) but delivery never enqueued — not idle "none".
  else visibility = "preparing";

  const statusLine =
    visibility === "ready"
      ? clientStatusMessage("strategy_ready")
      : visibility === "waiting"
        ? `Your ${pkg.name} strategy unlocks about ${STRATEGY_ELIGIBLE_HOURS}–${STRATEGY_DUE_HOURS} hours after signup`
        : visibility === "needs_package"
          ? "Waiting for a marketing package — assign Basic, Pro, Blast, or Custom to start strategy."
          : run
            ? clientStatusMessage(run.statusMessageKey)
            : hasExplicitPackage
              ? `${pkg.name} is assigned — preparing strategy delivery (open Strategy to generate if this stays empty).`
              : "No managed strategy run yet — assign a package and complete onboarding.";

  return {
    visibility,
    statusLine,
    packageName: ms?.strategyPackageName ?? pkg.name,
    packagePriceAud: pkg.priceAudMonthly,
    channels: pkg.channels,
    postsPerMonth: pkg.postsPerMonth,
    strategySummary,
    strategyChannelPlan,
    detailedStrategy,
    strategyVersions: finalVersions,
    campaignId,
    campaignHref: campaignId ? `/campaigns/${campaignId}` : null,
    eligibleAt,
    dueAt,
    completedAt,
    eligible,
    hoursUntilEligible:
      eligibleAt && !eligible ? hoursUntil(eligibleAt, at) : null,
    runPhase: run?.phase ?? null,
    runId: run?.id ?? null,
    eligibleHours: STRATEGY_ELIGIBLE_HOURS,
    dueHours: STRATEGY_DUE_HOURS,
    demoImmediate: Boolean(opts?.demoImmediate),
    packageChangePendingBilling: Boolean(ms?.packageChangePendingBilling),
  };
}
