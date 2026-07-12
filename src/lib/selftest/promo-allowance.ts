import {
  includedPromoLimitForPeriod,
  includedPromosUsedInPeriod,
  promoPeriodKey,
  resolvePromoBillingClass,
} from "@/lib/promo-allowance";
import type { ClientPromoSelection, Company } from "@/lib/types";
import { stubGbpCompany } from "@/lib/selftest/gbp-audit";

function stubSelection(
  partial: Partial<ClientPromoSelection> & Pick<ClientPromoSelection, "id">,
): ClientPromoSelection {
  return {
    templateId: "t1",
    templateName: "Test promo",
    industry: "retail",
    status: "requested",
    startDate: "2026-07-01",
    endDate: "2026-07-14",
    budgetUsd: 100,
    markupPercent: 0.4,
    feeUsd: 40,
    totalUsd: 140,
    channels: ["instagram"],
    requestedById: "u1",
    requestedAt: "2026-07-12T00:00:00.000Z",
    billingClass: "included",
    periodKey: "2026-07",
    ...partial,
  };
}

export async function checkPromoPeriodKeyQuarterly(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const q = promoPeriodKey("2026-07-12T00:00:00.000Z", 1 / 3);
  const m = promoPeriodKey("2026-07-12T00:00:00.000Z", 1);
  const ok = q === "2026-Q3" && m === "2026-07";
  return { ok, detail: ok ? `quarter=${q} month=${m}` : `q=${q} m=${m}` };
}

export async function checkPromoAllowanceBillingClass(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const limit = includedPromoLimitForPeriod(1);
  const basicLimit = includedPromoLimitForPeriod(1 / 3);
  const customTwoQuarter = includedPromoLimitForPeriod(2 / 3);
  const zero = includedPromoLimitForPeriod(0);

  const company: Company = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      managedService: {
        serviceLevel: "managed_exceptions",
        marketingPackageId: "pro",
      },
      promoSelections: [
        stubSelection({ id: "p1", billingClass: "included", periodKey: "2026-07" }),
      ],
    },
  });

  // Pro = 1/mo; already used 1 → next is extra
  const next = resolvePromoBillingClass(company, null, "2026-07-15T00:00:00.000Z");
  const used = includedPromosUsedInPeriod(
    company.profile.promoSelections ?? [],
    "2026-07",
    1,
  );

  const ok =
    limit === 1 &&
    basicLimit === 1 &&
    customTwoQuarter === 2 &&
    zero === 0 &&
    used === 1 &&
    next === "extra";

  return {
    ok,
    detail: ok
      ? `limit=${limit} basicLimit=${basicLimit} custom2q=${customTwoQuarter} used=${used} next=${next}`
      : JSON.stringify({ limit, basicLimit, customTwoQuarter, zero, used, next }),
  };
}

export async function checkPromoIncludedStillAvailable(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company: Company = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      managedService: {
        serviceLevel: "fully_managed",
        marketingPackageId: "blast",
      },
      promoSelections: [
        stubSelection({ id: "p1", billingClass: "included", periodKey: "2026-07" }),
      ],
    },
  });
  // Blast = 2/mo; 1 used → still included
  const next = resolvePromoBillingClass(company, null, "2026-07-15T00:00:00.000Z");
  const ok = next === "included";
  return { ok, detail: ok ? `next=${next}` : `expected included got ${next}` };
}
