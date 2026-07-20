// Self-tests: marketing-package Stripe kind helpers (no live Stripe calls).

import {
  isMarketingPackageCheckoutKind,
  verifyMarketingPackageCheckoutSession,
} from "@/lib/billing";
import { initialDetailedStrategyStatus } from "@/lib/managed-service/detailed-strategy";
import { includedPromoLimitForPeriod } from "@/lib/promo-allowance";
import { packageFor } from "@/lib/marketing-packages";
import {
  applyInvoicePaymentFailed,
  applyInvoicePaymentSucceeded,
  applyServiceOptionsEdit,
  initialCompanyServiceBilling,
  refreshFailedPaymentPause,
  requestPackageChange,
} from "@/lib/managed-service-billing";

export async function checkManagedPackageEntitlements(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const starter = packageFor("starter");
  const growth = packageFor("growth");
  const managed = packageFor("managed");
  const ok =
    starter.priceAudMonthly === 299 &&
    starter.campaignConceptsPerMonth === 4 &&
    !starter.searchVisibilityIncluded &&
    growth.priceAudMonthly === 699 &&
    growth.campaignConceptsPerMonth === 12 &&
    !growth.searchVisibilityIncluded &&
    managed.priceAudMonthly === 1499 &&
    managed.campaignConceptsPerMonth === 24 &&
    managed.searchVisibilityIncluded &&
    packageFor("basic").id === "starter" &&
    packageFor("pro").id === "growth" &&
    packageFor("blast").id === "managed";
  return {
    ok,
    detail: ok ? "Starter/Growth/Managed entitlements and legacy aliases" : "catalog mismatch",
  };
}

export async function checkManagedBillingTransitions(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const initial = applyInvoicePaymentSucceeded(
    initialCompanyServiceBilling("starter"),
    "2026-07-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
  );
  const upgradePending = requestPackageChange(
    initial,
    "growth",
    "2026-07-15T00:00:00.000Z",
  );
  const upgraded = applyInvoicePaymentSucceeded(
    upgradePending,
    "2026-07-15T00:01:00.000Z",
  );
  const optionsPending = applyServiceOptionsEdit(
    upgraded,
    "growth",
    { ...upgraded.serviceOptions, websitePublishing: true },
    "2026-07-16T00:00:00.000Z",
  );
  const optionsSettled = applyInvoicePaymentSucceeded(
    optionsPending,
    "2026-07-16T00:01:00.000Z",
  );
  const downgradePending = requestPackageChange(
    upgraded,
    "starter",
    "2026-07-20T00:00:00.000Z",
  );
  const beforeRenewal = applyInvoicePaymentSucceeded(
    downgradePending,
    "2026-07-25T00:00:00.000Z",
  );
  const atRenewal = applyInvoicePaymentSucceeded(
    beforeRenewal,
    "2026-08-01T00:00:01.000Z",
  );
  const failed = applyInvoicePaymentFailed(
    atRenewal,
    "2026-08-02T00:00:00.000Z",
  );
  const stillGrace = refreshFailedPaymentPause(
    failed,
    "2026-08-08T23:59:59.000Z",
  );
  const paused = refreshFailedPaymentPause(
    failed,
    "2026-08-09T00:00:00.000Z",
  );
  const recovered = applyInvoicePaymentSucceeded(
    paused,
    "2026-08-09T01:00:00.000Z",
  );
  const ok =
    upgradePending.activePackageId === "starter" &&
    upgraded.activePackageId === "growth" &&
    !upgraded.serviceOptions.websitePublishing &&
    optionsPending.pendingServiceOptions?.websitePublishing === true &&
    !optionsPending.serviceOptions.websitePublishing &&
    optionsSettled.serviceOptions.websitePublishing &&
    beforeRenewal.activePackageId === "growth" &&
    atRenewal.activePackageId === "starter" &&
    stillGrace.status === "past_due_grace" &&
    paused.status === "paused" &&
    recovered.status === "active";
  return {
    ok,
    detail: ok
      ? "paid upgrade, renewal downgrade, seven-day grace, pause and recovery"
      : JSON.stringify({ upgradePending, upgraded, beforeRenewal, atRenewal, stillGrace, paused, recovered }),
  };
}

export async function checkMarketingPackageCheckoutKind(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const pkg = isMarketingPackageCheckoutKind({ kind: "marketing_package" });
  const addon = isMarketingPackageCheckoutKind({ kind: "addon" });
  const missing = isMarketingPackageCheckoutKind({});
  const ok = pkg && !addon && !missing;
  return {
    ok,
    detail: ok
      ? "kind=marketing_package only"
      : `pkg=${pkg} addon=${addon} missing=${missing}`,
  };
}

export async function checkMarketingPackageCheckoutVerify(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const expect = { tenantId: "t1", companyId: "c1" };
  const good = verifyMarketingPackageCheckoutSession(
    {
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      client_reference_id: "t1",
      metadata: {
        kind: "marketing_package",
        tenantId: "t1",
        companyId: "c1",
        packageId: "pro",
      },
    },
    expect,
  );
  const bareSuccess = verifyMarketingPackageCheckoutSession(null, expect);
  const wrongKind = verifyMarketingPackageCheckoutSession(
    {
      id: "cs_test_2",
      status: "complete",
      payment_status: "paid",
      metadata: { kind: "addon", tenantId: "t1", companyId: "c1" },
    },
    expect,
  );
  const wrongCompany = verifyMarketingPackageCheckoutSession(
    {
      id: "cs_test_3",
      status: "complete",
      payment_status: "paid",
      metadata: {
        kind: "marketing_package",
        tenantId: "t1",
        companyId: "other",
      },
    },
    expect,
  );
  const ok =
    good.ok === true &&
    bareSuccess.ok === false &&
    wrongKind.ok === false &&
    wrongCompany.ok === false;
  return {
    ok,
    detail: ok
      ? "session verify rejects bare success / wrong kind / wrong company"
      : JSON.stringify({ good, bareSuccess, wrongKind, wrongCompany }),
  };
}

export async function checkCustomQuarterlyPromoLimit(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const basic = includedPromoLimitForPeriod(1 / 3);
  const customTwo = includedPromoLimitForPeriod(2 / 3);
  const monthly = includedPromoLimitForPeriod(2);
  const ok = basic === 1 && customTwo === 2 && monthly === 2;
  return {
    ok,
    detail: ok
      ? `basic=${basic} custom2q=${customTwo} monthly2=${monthly}`
      : JSON.stringify({ basic, customTwo, monthly }),
  };
}

export async function checkApprovalStrategyStartsDraft(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const approval = initialDetailedStrategyStatus("approval");
  const managed = initialDetailedStrategyStatus("managed_exceptions");
  const full = initialDetailedStrategyStatus("fully_managed");
  const ok =
    approval === "draft" &&
    managed === "client_review" &&
    full === "client_review";
  return {
    ok,
    detail: ok
      ? `approval=${approval} managed=${managed} full=${full}`
      : JSON.stringify({ approval, managed, full }),
  };
}
