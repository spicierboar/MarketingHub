/**
 * Client self-serve marketing package change — quote helpers.
 * Credits (wallet *Usd fields, treated as AUD-equivalent for package deltas)
 * apply toward upgrade amount due, or refund on downgrade.
 */

import {
  currentPackageId,
  packageChangeKind,
} from "@/lib/managed-service-billing";
import {
  listActivePackagesForSignup,
  resolvePackageById,
  type MarketingPackageDef,
} from "@/lib/marketing-packages";
import type {
  Company,
  CurrentMarketingPackageId,
  Tenant,
} from "@/lib/types";

export type ClientPackageOption = {
  id: CurrentMarketingPackageId;
  name: string;
  priceAudMonthly: number;
  blurb: string;
  imageQuotaPerMonth: number;
  videoQuotaPerMonth: number;
  postsPerMonth: number;
};

export type ClientPackageChangeQuote = {
  kind: "upgrade" | "downgrade" | "same";
  currentPackageId: CurrentMarketingPackageId;
  currentPackageName: string;
  currentPriceAud: number;
  targetPackageId: CurrentMarketingPackageId;
  targetPackageName: string;
  targetPriceAud: number;
  /** target − current monthly */
  priceDeltaAud: number;
  /** Credit applied toward upgrade due, or refunded on downgrade */
  creditAppliedAud: number;
  /** Amount to charge now (upgrade remainder). 0 for downgrade / fully covered */
  amountDueNowAud: number;
  effectiveAtLabel: string;
  submitLabel: "Pay and place order" | "Confirm change";
};

export function listClientPackageOptions(
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
): ClientPackageOption[] {
  return listActivePackagesForSignup(tenant)
    .filter((p) => p.id === "starter" || p.id === "growth" || p.id === "managed")
    .map((p) => toOption(p));
}

function toOption(p: MarketingPackageDef): ClientPackageOption {
  return {
    id: currentPackageId(p.id),
    name: p.name,
    priceAudMonthly: p.priceAudMonthly,
    blurb: p.blurb,
    imageQuotaPerMonth: p.imageQuotaPerMonth,
    videoQuotaPerMonth: p.videoQuotaPerMonth,
    postsPerMonth: p.postsPerMonth,
  };
}

export function buildClientPackageChangeQuote(input: {
  currentPackageId: string;
  currentPackageName: string;
  currentPriceAud: number;
  targetPackageId: string;
  targetPackageName: string;
  targetPriceAud: number;
  creditBalanceUsd: number;
  periodEndIso?: string | null;
}): ClientPackageChangeQuote {
  const activeId = currentPackageId(input.currentPackageId);
  const targetId = currentPackageId(input.targetPackageId);
  const kind = packageChangeKind(activeId, targetId);
  const priceDeltaAud = input.targetPriceAud - input.currentPriceAud;
  const creditBalance = Math.max(0, input.creditBalanceUsd);

  let creditAppliedAud = 0;
  let amountDueNowAud = 0;
  let effectiveAtLabel: string;
  let submitLabel: ClientPackageChangeQuote["submitLabel"];

  if (kind === "same") {
    effectiveAtLabel = "No change";
    submitLabel = "Confirm change";
  } else if (kind === "upgrade") {
    const due = Math.max(0, priceDeltaAud);
    creditAppliedAud = Math.min(creditBalance, due);
    amountDueNowAud = Math.max(0, due - creditAppliedAud);
    effectiveAtLabel = "Takes effect immediately after payment confirms";
    submitLabel =
      amountDueNowAud > 0 ? "Pay and place order" : "Confirm change";
  } else {
    // Downgrade — schedule at period end; credit monthly savings to wallet now.
    creditAppliedAud = Math.max(0, -priceDeltaAud);
    amountDueNowAud = 0;
    const end = input.periodEndIso?.trim();
    effectiveAtLabel = end
      ? `Scheduled for ${end.slice(0, 10)} (end of current billing period)`
      : "Takes effect at the end of the current billing period (or immediately if no period is set)";
    submitLabel = "Confirm change";
  }

  return {
    kind,
    currentPackageId: activeId,
    currentPackageName: input.currentPackageName,
    currentPriceAud: input.currentPriceAud,
    targetPackageId: targetId,
    targetPackageName: input.targetPackageName,
    targetPriceAud: input.targetPriceAud,
    priceDeltaAud,
    creditAppliedAud,
    amountDueNowAud,
    effectiveAtLabel,
    submitLabel,
  };
}

/** Server-side quote from company + tenant catalog. */
export function quoteClientPackageChange(input: {
  company: Pick<Company, "profile">;
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined;
  targetPackageId: string;
  creditBalanceUsd: number;
}): ClientPackageChangeQuote {
  const billing = input.company.profile.managedService?.serviceBilling;
  const activeId = currentPackageId(
    billing?.activePackageId ??
      input.company.profile.managedService?.marketingPackageId ??
      "starter",
  );
  const targetId = currentPackageId(input.targetPackageId);
  const currentPkg = resolvePackageById(input.tenant, activeId);
  const targetPkg = resolvePackageById(input.tenant, targetId);
  return buildClientPackageChangeQuote({
    currentPackageId: activeId,
    currentPackageName: currentPkg.name,
    currentPriceAud: currentPkg.priceAudMonthly,
    targetPackageId: targetId,
    targetPackageName: targetPkg.name,
    targetPriceAud: targetPkg.priceAudMonthly,
    creditBalanceUsd: input.creditBalanceUsd,
    periodEndIso: billing?.currentPeriodEnd,
  });
}
