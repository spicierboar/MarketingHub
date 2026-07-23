"use server";

/**
 * Client self-serve marketing package upgrade / downgrade.
 * Mirrors sales checkout semantics; applies wallet credit toward upgrades
 * and refunds monthly savings to the wallet on downgrades.
 */

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  changeMarketingPackageSubscription,
  createMarketingPackageCheckoutSession,
  marketingPackageCheckoutConfigurationError,
  mockPackageCheckoutEnabled,
  stripeConfigured,
} from "@/lib/billing";
import { quoteClientPackageChange } from "@/lib/client-package-change";
import { debitCredit, getOrCreateCreditWallet, topUpCredit } from "@/lib/credit-wallet";
import { getCompany, getTenant, updateCompany } from "@/lib/db";
import {
  applyInvoicePaymentSucceeded,
  applyServiceOptionsEdit,
  currentPackageId,
  initialCompanyServiceBilling,
  normaliseCompanyServiceOptions,
  requestPackageChange,
} from "@/lib/managed-service-billing";
import { resolveOrigin } from "@/lib/origin";
import type {
  ManagedServiceSettings,
  MarketingPackageId,
} from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function revalidatePackagePaths() {
  revalidatePath("/client/account");
  revalidatePath("/client/payments");
  revalidatePath("/client/billing");
  revalidatePath("/client");
  revalidatePath("/client/strategy");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

async function settleClientPackageBilling(
  companyId: string,
  user: Parameters<typeof logAction>[0],
  detail: string,
  stripeLink?: { customerId?: string; subscriptionId?: string },
) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  const prev = company.profile.managedService;
  if (!prev) return;
  const paidAt = new Date().toISOString();
  const nextBilling = applyInvoicePaymentSucceeded(
    {
      ...(prev.serviceBilling ??
        initialCompanyServiceBilling(
          prev.marketingPackageId ?? "starter",
          prev.serviceOptions,
        )),
      ...(stripeLink?.customerId
        ? { stripeCustomerId: stripeLink.customerId }
        : {}),
      ...(stripeLink?.subscriptionId
        ? { stripeSubscriptionId: stripeLink.subscriptionId }
        : {}),
    },
    paidAt,
  );
  const nextMs: ManagedServiceSettings = {
    ...prev,
    marketingPackageId: nextBilling.activePackageId,
    serviceOptions: nextBilling.serviceOptions,
    serviceBilling: nextBilling,
  };
  delete nextMs.packageChangePendingBilling;
  await updateCompany(companyId, {
    profile: { ...company.profile, managedService: nextMs },
  });
  await logAction(user, "company.marketing_package_paid", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail,
  });
}

/**
 * Confirm a client-selected package change.
 * Form fields: companyId, targetPackageId.
 */
export async function confirmClientPackageChangeAction(formData: FormData) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  const companyId = text(formData, "companyId");
  if (!companyId || companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }
  const targetRaw = text(formData, "targetPackageId");
  if (!targetRaw) throw new Error("Choose a marketing package.");

  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");

  const prev = company.profile.managedService;
  if (prev?.packageChangePendingBilling) {
    throw new Error(
      "A package change is already pending billing confirmation. Wait for it to finish, or contact your agency.",
    );
  }

  const wallet = await getOrCreateCreditWallet(companyId);
  const quote = quoteClientPackageChange({
    company,
    tenant,
    targetPackageId: targetRaw,
    creditBalanceUsd: wallet.balanceUsd,
  });
  if (quote.kind === "same") {
    throw new Error("You are already on that package.");
  }

  const targetId = currentPackageId(quote.targetPackageId);
  const nowIso = new Date().toISOString();
  const existingBilling = prev?.serviceBilling;
  const serviceOptions = normaliseCompanyServiceOptions(
    targetId,
    existingBilling?.serviceOptions ?? prev?.serviceOptions,
  );

  const nextBilling = existingBilling
    ? applyServiceOptionsEdit(
        requestPackageChange(existingBilling, targetId, nowIso),
        targetId,
        serviceOptions,
        nowIso,
      )
    : {
        ...initialCompanyServiceBilling(targetId, serviceOptions),
        pendingTransitionId: randomUUID(),
        pendingPackageId: targetId,
        pendingChangeKind: quote.kind,
        pendingEffectiveAt: nowIso,
        pendingServiceOptions: serviceOptions,
      };

  const nextMs: ManagedServiceSettings = {
    ...(prev ?? {
      serviceLevel: "managed_exceptions",
      marketingPackageId: targetId,
    }),
    serviceLevel: prev?.serviceLevel ?? "managed_exceptions",
    // Keep active package until settlement activates pending.
    marketingPackageId: existingBilling
      ? existingBilling.activePackageId
      : (prev?.marketingPackageId ?? targetId),
    serviceOptions: existingBilling
      ? existingBilling.serviceOptions
      : serviceOptions,
    serviceBilling: nextBilling,
    packageChangePendingBilling: true,
  };

  await updateCompany(companyId, {
    profile: { ...company.profile, managedService: nextMs },
  });
  await logAction(user, "company.marketing_package_set", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: `client self-serve ${quote.kind} → ${targetId}`,
  });

  // Apply credits: debit toward upgrade due, or refund savings on downgrade.
  if (quote.kind === "upgrade" && quote.creditAppliedAud > 0) {
    await debitCredit({
      companyId,
      amountUsd: quote.creditAppliedAud,
      user,
      reason: `Package upgrade credit toward ${quote.targetPackageName}`,
      related: { type: "marketing_package", id: targetId },
    });
  }
  if (quote.kind === "downgrade" && quote.creditAppliedAud > 0) {
    await topUpCredit({
      companyId,
      amountUsd: quote.creditAppliedAud,
      user,
      kind: "refund",
      reason: `Package downgrade credit from ${quote.currentPackageName} → ${quote.targetPackageName}`,
      related: { type: "marketing_package", id: targetId },
    });
  }

  const refreshed = await getCompany(companyId);
  const billing = refreshed?.profile.managedService?.serviceBilling;
  const packageId = (billing?.pendingPackageId ?? targetId) as MarketingPackageId;

  // Live Stripe path when remainder is due and billing is live.
  const useLiveStripe =
    quote.amountDueNowAud > 0 &&
    !mockPackageCheckoutEnabled() &&
    stripeConfigured();

  if (useLiveStripe && billing?.stripeSubscriptionId) {
    if (!billing.pendingChangeKind) {
      throw new Error("No validated package transition is pending.");
    }
    const changed = await changeMarketingPackageSubscription({
      tenantId: user.tenantId,
      companyId,
      packageId,
      changeKind: billing.pendingChangeKind,
      billing,
      serviceOptions: billing.pendingServiceOptions ?? serviceOptions,
    });
    if (!changed.ok) {
      throw new Error(
        `Could not modify the existing Stripe subscription (${changed.reason}).`,
      );
    }
    await updateCompany(companyId, {
      profile: {
        ...refreshed!.profile,
        managedService: {
          ...refreshed!.profile.managedService!,
          serviceBilling: {
            ...billing,
            stripeSubscriptionItemId: changed.subscriptionItemId,
            ...(changed.mode === "upgrade_invoiced"
              ? { stripePriceId: changed.priceId }
              : {}),
          },
        },
      },
    });
    revalidatePackagePaths();
    redirect(
      `/client/payments?package=${
        changed.mode === "upgrade_invoiced"
          ? "awaiting_webhook"
          : "downgrade_scheduled"
      }`,
    );
  }

  if (useLiveStripe) {
    const configurationError = marketingPackageCheckoutConfigurationError(
      packageId,
      billing?.pendingServiceOptions ?? serviceOptions,
    );
    if (configurationError) {
      throw new Error(`Could not start Stripe Checkout: ${configurationError}.`);
    }
    const url = await createMarketingPackageCheckoutSession(
      tenant,
      companyId,
      packageId,
      await requestOrigin(),
      {
        successPath: `/client/payments?package=checkout_success`,
        cancelPath: `/client/payments?package=checkout_cancelled`,
      },
      serviceOptions,
      billing,
    );
    if (!url) {
      throw new Error(
        "Could not start Stripe Checkout for this marketing package.",
      );
    }
    redirect(url);
  }

  // Demo / staging / credit-covered / downgrade path — settle locally when due now
  // is covered, or when downgrade is effective immediately.
  const settleNow =
    quote.kind === "upgrade" ||
    !billing?.pendingEffectiveAt ||
    Date.parse(billing.pendingEffectiveAt) <= Date.now();

  if (settleNow) {
    await settleClientPackageBilling(
      companyId,
      user,
      quote.kind === "upgrade"
        ? `client package upgrade · ${quote.targetPackageName} · credit A$${quote.creditAppliedAud} · due A$${quote.amountDueNowAud} (local settle)`
        : `client package downgrade · ${quote.targetPackageName} · credit refund A$${quote.creditAppliedAud} (local settle)`,
    );
  }

  revalidatePackagePaths();
  redirect(
    `/client/payments?package=${
      settleNow
        ? "changed"
        : quote.kind === "downgrade"
          ? "downgrade_scheduled"
          : "pending"
    }`,
  );
}
