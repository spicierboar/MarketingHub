// Self-tests: marketing-package Stripe kind helpers (no live Stripe calls).

import {
  isMarketingPackageCheckoutKind,
  verifyMarketingPackageCheckoutSession,
} from "@/lib/billing";
import { initialDetailedStrategyStatus } from "@/lib/managed-service/detailed-strategy";
import { includedPromoLimitForPeriod } from "@/lib/promo-allowance";

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
