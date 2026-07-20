// Stripe webhook (SaaS T4). The ONLY writer of billing state when Stripe is
// live: plan changes land here (checkout completed / subscription updated),
// never directly from user actions. Env-gated — without Stripe keys this
// endpoint refuses, and demo plan changes go through the owner-only action.
//
// Isolation: the tenant is resolved from OUR OWN ids inside the signed payload
// (client_reference_id / subscription metadata.tenantId set at checkout, or
// the stored stripeCustomerId) — never from anything a browser could supply.

import { NextRequest, NextResponse } from "next/server";
import {
  getCompany,
  getCompanyEntitlement,
  getRestaurantOrder,
  getTenant,
  getTenantByStripeCustomer,
  hasProcessedStripeWebhookEvent,
  recordProcessedStripeWebhookEvent,
  updateCompany,
  updateRestaurantOrder,
  updateTenant,
  upsertCompanyEntitlement,
} from "@/lib/db";
import {
  changeMarketingPackageSubscription,
  isMarketingPackageCheckoutKind,
  planForPriceId,
  retrieveMarketingPackageSubscriptionCorrelation,
  retrieveMarketingPackageSubscriptionState,
  verifyStripeSignature,
} from "@/lib/billing";
import { applyPaidCreditTopUp } from "@/lib/credit-top-up";
import { planFor } from "@/lib/plans";
import { isAddonId } from "@/lib/addons";
import { runInServiceContext } from "@/lib/db/service-context";
import { logAction } from "@/lib/audit";
import type {
  ActingUser,
  ManagedServiceSettings,
  MarketingPackageId,
  PlanId,
  Tenant,
} from "@/lib/types";
import { TENANT_ROLE_TIER } from "@/lib/types";
import {
  applyInvoicePaymentFailed,
  applyInvoicePaymentSucceeded,
  checkoutMatchesPendingServiceTransition,
  currentPackageId,
  initialCompanyServiceBilling,
  isCurrentServiceSubscriptionEvent,
  normaliseCompanyServiceOptions,
} from "@/lib/managed-service-billing";
import { ensureAndKickManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";

const WEBHOOK_ACTOR = { id: "stripe_webhook", email: "webhooks@stripe.com" };

function webhookUser(tenantId: string): ActingUser {
  return {
    id: WEBHOOK_ACTOR.id,
    email: WEBHOOK_ACTOR.email,
    name: "Stripe Webhook",
    role: TENANT_ROLE_TIER.owner,
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "",
  };
}

type StripeObject = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function stripeId(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : str((value as StripeObject | null | undefined)?.id);
}

async function auditStaleManagedSubscriptionEvent(args: {
  tenantId: string;
  companyId: string;
  eventKind: string;
  incomingSubscriptionId?: string;
  currentSubscriptionId?: string;
}): Promise<void> {
  await logAction(WEBHOOK_ACTOR, "company.service_webhook_stale_ignored", {
    tenantId: args.tenantId,
    targetType: "company",
    targetId: args.companyId,
    companyId: args.companyId,
    detail: `${args.eventKind} · incoming=${args.incomingSubscriptionId ?? "missing"} · current=${args.currentSubscriptionId ?? "missing"}`,
  });
}

// checkout.session.completed → link the Stripe customer/subscription and set
// the purchased plan (metadata.planId was stamped when we created the session).
// Kind forks first: addon / order / credit_top_up / marketing_package never
// touch tenant plan or stripeSubscriptionId.
async function onCheckoutCompleted(session: StripeObject): Promise<void> {
  const meta = session.metadata as StripeObject | undefined;
  if (str(meta?.kind) === "addon") {
    await onAddonCheckout(session);
    return;
  }
  if (str(meta?.kind) === "order") {
    await onOrderCheckout(session);
    return;
  }
  if (str(meta?.kind) === "credit_top_up") {
    await onCreditTopUpCheckout(session);
    return;
  }
  if (isMarketingPackageCheckoutKind(meta)) {
    await onMarketingPackageCheckout(session);
    return;
  }
  const tenantId =
    str(session.client_reference_id) ??
    str((session.metadata as StripeObject | undefined)?.tenantId);
  if (!tenantId) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const plan = str((session.metadata as StripeObject | undefined)?.planId);
  const nextPlan = plan ? planFor(plan).id : tenant.plan;
  const nextCustomer = str(session.customer) ?? tenant.stripeCustomerId;
  const nextSubscription =
    str(session.subscription) ?? tenant.stripeSubscriptionId;
  // Idempotency: Stripe legitimately redelivers the same event on retry. If
  // this checkout has already been applied (plan + linkage unchanged), skip the
  // write and the audit row so redelivery doesn't pollute the compliance trail.
  if (
    tenant.plan === nextPlan &&
    tenant.stripeCustomerId === nextCustomer &&
    tenant.stripeSubscriptionId === nextSubscription
  ) {
    return;
  }
  await updateTenant(tenantId, {
    plan: nextPlan,
    stripeCustomerId: nextCustomer,
    stripeSubscriptionId: nextSubscription,
    status: "active",
  });
  await logAction(WEBHOOK_ACTOR, "billing.checkout_completed", {
    tenantId,
    targetType: "tenant",
    targetId: tenantId,
    detail: `Plan set to ${nextPlan} via Stripe Checkout`,
  });
}

/**
 * Company marketing-package Checkout completed → clear
 * packageChangePendingBilling only. Never writes tenant.plan /
 * stripeSubscriptionId (those are SaaS plan Checkout fields).
 */
async function onMarketingPackageCheckout(
  session: StripeObject,
): Promise<void> {
  const meta = session.metadata as StripeObject | undefined;
  const tenantId = str(session.client_reference_id) ?? str(meta?.tenantId);
  const companyId = str(meta?.companyId);
  const packageId = str(meta?.packageId);
  if (!tenantId || !companyId) return;
  const paymentStatus = str(session.payment_status);
  if (
    paymentStatus &&
    paymentStatus !== "paid" &&
    paymentStatus !== "no_payment_required"
  ) {
    return;
  }
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const prev = company.profile.managedService;
    if (!prev) return;
    const paidAt = new Date().toISOString();
    const before =
      prev.serviceBilling ??
      initialCompanyServiceBilling(
        prev.marketingPackageId ?? packageId ?? "starter",
        prev.serviceOptions,
      );
    if (!packageId) return;
    const requested = currentPackageId(packageId);
    const checkoutSubscriptionId = stripeId(session.subscription);
    if (!checkoutSubscriptionId) return;
    const correlation = await retrieveMarketingPackageSubscriptionCorrelation(
      checkoutSubscriptionId,
      {
        tenantId,
        companyId,
        packageId: packageId as MarketingPackageId,
      },
    );
    if (!correlation) {
      await logAction(
        WEBHOOK_ACTOR,
        "company.marketing_package_correlation_failed",
        {
          tenantId,
          targetType: "company",
          targetId: companyId,
          companyId,
          detail: `subscription=${checkoutSubscriptionId}`,
        },
      );
      return;
    }
    if (
      requested === before.activePackageId &&
      checkoutSubscriptionId === before.stripeSubscriptionId &&
      (before.status === "active" || before.status === "cancel_at_period_end")
    ) {
      await ensureAndKickManagedDeliveryForCompany({
        actor: webhookUser(tenantId),
        tenantId,
        companyId,
        reason: "signup",
        process: true,
        demoForceGenerate: false,
      });
      return;
    }
    const metadataKind = str(meta?.pendingChangeKind);
    const metadataEffectiveAt = str(meta?.pendingEffectiveAt);
    if (
      !checkoutMatchesPendingServiceTransition(before, {
        packageId,
        pendingTransitionId: str(meta?.pendingTransitionId),
        pendingChangeKind: metadataKind,
        pendingEffectiveAt: metadataEffectiveAt,
      })
    ) {
      await logAction(
        WEBHOOK_ACTOR,
        "company.marketing_package_checkout_mismatch",
        {
          tenantId,
          targetType: "company",
          targetId: companyId,
          companyId,
          detail: `package=${requested} expected=${before.pendingPackageId ?? before.activePackageId} kind=${metadataKind ?? "none"} effective=${metadataEffectiveAt ?? "none"}`,
        },
      );
      return;
    }
    const paidOptions = normaliseCompanyServiceOptions(requested, {
      searchVisibility: str(meta?.searchVisibility) === "true",
      websiteConnectionSetup: true,
      websitePublishing: str(meta?.websitePublishing) === "true",
      hostedLandingPage: str(meta?.hostedLandingPage) === "true",
      monthlyAdCapAud: Number(str(meta?.monthlyAdCapAud) ?? 0),
    });
    const nextBilling = applyInvoicePaymentSucceeded(
      {
        ...before,
        pendingServiceOptions:
          before.pendingServiceOptions ??
          (before.status === "pending_payment" ? paidOptions : undefined),
        stripeCustomerId: stripeId(session.customer) ?? before.stripeCustomerId,
        stripeSubscriptionId: checkoutSubscriptionId,
        stripeSubscriptionItemId: correlation.subscriptionItemId,
        stripePriceId: correlation.priceId,
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
    await ensureAndKickManagedDeliveryForCompany({
      actor: webhookUser(tenantId),
      tenantId,
      companyId,
      reason: "signup",
      process: true,
      demoForceGenerate: false,
    });
    const sessionId = str(session.id);
    await logAction(WEBHOOK_ACTOR, "company.marketing_package_paid", {
      tenantId,
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: [
        "stripe webhook · packageChangePendingBilling cleared",
        packageId ? `package=${packageId}` : null,
        sessionId ? `session=${sessionId}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  });
}

function invoiceMetadata(invoice: StripeObject): StripeObject | undefined {
  const direct = invoice.metadata as StripeObject | undefined;
  if (str(direct?.companyId)) return direct;
  const parent = invoice.parent as StripeObject | undefined;
  const subscriptionDetails = parent?.subscription_details as
    StripeObject | undefined;
  const subscriptionMeta = subscriptionDetails?.metadata as
    StripeObject | undefined;
  if (str(subscriptionMeta?.companyId)) return subscriptionMeta;
  const lines = (invoice.lines as StripeObject | undefined)?.data as
    StripeObject[] | undefined;
  return lines
    ?.map((line) => line.metadata as StripeObject | undefined)
    .find((meta) => Boolean(str(meta?.companyId)));
}

function invoiceSubscriptionId(invoice: StripeObject): string | undefined {
  const direct = stripeId(invoice.subscription);
  if (direct) return direct;
  const parent = invoice.parent as StripeObject | undefined;
  return stripeId(
    (parent?.subscription_details as StripeObject | undefined)?.subscription,
  );
}

async function onManagedServiceInvoice(
  invoice: StripeObject,
  succeeded: boolean,
): Promise<void> {
  const meta = invoiceMetadata(invoice);
  if (str(meta?.kind) !== "marketing_package") return;
  const tenantId = str(meta?.tenantId);
  const companyId = str(meta?.companyId);
  if (!tenantId || !companyId) return;
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const prev = company.profile.managedService;
    if (!prev) return;
    const occurredAt = new Date().toISOString();
    const before =
      prev.serviceBilling ??
      initialCompanyServiceBilling(
        prev.marketingPackageId ?? "starter",
        prev.serviceOptions,
      );
    const incomingSubscriptionId = invoiceSubscriptionId(invoice);
    if (!isCurrentServiceSubscriptionEvent(before, incomingSubscriptionId)) {
      await auditStaleManagedSubscriptionEvent({
        tenantId,
        companyId,
        eventKind: succeeded
          ? "invoice.payment_succeeded"
          : "invoice.payment_failed",
        incomingSubscriptionId,
        currentSubscriptionId: before.stripeSubscriptionId,
      });
      return;
    }
    if (
      succeeded &&
      before.pendingTransitionId &&
      str(meta?.pendingTransitionId) !== before.pendingTransitionId
    ) {
      await auditStaleManagedSubscriptionEvent({
        tenantId,
        companyId,
        eventKind: "invoice.pending_transition_mismatch",
        incomingSubscriptionId,
        currentSubscriptionId: before.stripeSubscriptionId,
      });
      return;
    }
    const invoiceLines = (invoice.lines as StripeObject | undefined)?.data as
      StripeObject[] | undefined;
    const firstPeriod = invoiceLines?.[0]?.period as StripeObject | undefined;
    const periodEndSeconds = Number(firstPeriod?.end);
    const periodEnd = Number.isFinite(periodEndSeconds)
      ? new Date(periodEndSeconds * 1000).toISOString()
      : undefined;
    let settlementBase = before;
    if (
      succeeded &&
      before.pendingChangeKind &&
      ["downgrade", "options_downgrade", "mixed"].includes(
        before.pendingChangeKind,
      ) &&
      before.pendingPackageId &&
      before.pendingEffectiveAt &&
      Date.parse(before.pendingEffectiveAt) <= Date.parse(occurredAt)
    ) {
      const changed = await changeMarketingPackageSubscription({
        tenantId,
        companyId,
        packageId: before.pendingPackageId,
        changeKind: before.pendingChangeKind,
        billing: before,
        serviceOptions: before.pendingServiceOptions ?? before.serviceOptions,
        applyDowngradeAtRenewal: true,
      });
      if (!changed.ok || changed.mode !== "downgrade_applied") {
        throw new Error(
          `Could not apply scheduled Stripe downgrade (${changed.ok ? changed.mode : changed.reason})`,
        );
      }
      settlementBase = {
        ...before,
        stripeSubscriptionItemId: changed.subscriptionItemId,
        stripePriceId: changed.priceId,
      };
    }
    const nextBilling = succeeded
      ? applyInvoicePaymentSucceeded(settlementBase, occurredAt, periodEnd)
      : applyInvoicePaymentFailed(before, occurredAt);
    const nextMs: ManagedServiceSettings = {
      ...prev,
      marketingPackageId: nextBilling.activePackageId,
      serviceOptions: nextBilling.serviceOptions,
      serviceBilling: nextBilling,
    };
    if (succeeded) delete nextMs.packageChangePendingBilling;
    await updateCompany(companyId, {
      profile: { ...company.profile, managedService: nextMs },
    });
    await logAction(
      WEBHOOK_ACTOR,
      succeeded
        ? "company.service_invoice_paid"
        : "company.service_invoice_failed",
      {
        tenantId,
        targetType: "company",
        targetId: companyId,
        companyId,
        detail: succeeded
          ? `invoice=${str(invoice.id) ?? "?"} · service active`
          : `invoice=${str(invoice.id) ?? "?"} · seven-day grace started`,
      },
    );
  });
}

// Guest order checkout completed → mark the restaurant order paid. Isolation:
// company + order ids come from signed metadata; company.tenantId is re-checked.
async function onOrderCheckout(session: StripeObject): Promise<void> {
  const meta = session.metadata as StripeObject | undefined;
  const orderId = str(meta?.orderId);
  const companyId = str(meta?.companyId);
  const tenantId = str(meta?.tenantId);
  if (!orderId || !companyId || !tenantId) return;
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const order = await getRestaurantOrder(orderId);
    if (!order || order.companyId !== companyId) return;
    if (order.paymentStatus === "paid") return;
    const sessionId = str(session.id);
    await updateRestaurantOrder(orderId, {
      status: "paid",
      paymentStatus: "paid",
      stripeCheckoutSessionId: sessionId,
    });
    await logAction(WEBHOOK_ACTOR, "ordering.checkout_completed", {
      tenantId,
      targetType: "restaurant_order",
      targetId: orderId,
      companyId,
      detail: `Order paid via Stripe Checkout (${sessionId ?? "?"})`,
    });
  });
}

// Prepaid credit top-up Checkout → wallet credit + local tax invoice.
// Idempotent on stripe checkout session id (ledger related + tax_invoices unique).
async function onCreditTopUpCheckout(session: StripeObject): Promise<void> {
  const meta = session.metadata as StripeObject | undefined;
  const companyId = str(meta?.companyId);
  const tenantId = str(meta?.tenantId) ?? str(session.client_reference_id);
  const amountUsd = Number(str(meta?.amountUsd) ?? NaN);
  const sessionId = str(session.id);
  if (!companyId || !tenantId || !sessionId || !(amountUsd > 0)) return;
  const paymentStatus = str(session.payment_status);
  if (paymentStatus && paymentStatus !== "paid") return;

  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const paymentIntent = session.payment_intent;
    const piId =
      typeof paymentIntent === "string"
        ? paymentIntent
        : str((paymentIntent as StripeObject | undefined)?.id);
    await applyPaidCreditTopUp({
      companyId,
      amountUsd,
      user: webhookUser(tenantId),
      reason: "Stripe Checkout credit top-up",
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: piId,
    });
    // Persist saved card for off-session auto top-up when Checkout used setup_future_usage.
    if (piId) {
      const { paymentMethodFromPaymentIntent } = await import("@/lib/billing");
      const { getOrCreateCreditWallet } = await import("@/lib/credit-wallet");
      const { updateCompanyCreditWallet } = await import("@/lib/db");
      const pm = await paymentMethodFromPaymentIntent(piId);
      const customerFromSession = str(session.customer);
      if (pm?.paymentMethodId || customerFromSession || pm?.customerId) {
        const wallet = await getOrCreateCreditWallet(companyId);
        await updateCompanyCreditWallet(wallet.id, {
          ...(pm?.paymentMethodId
            ? { stripePaymentMethodId: pm.paymentMethodId }
            : {}),
          ...(customerFromSession || pm?.customerId
            ? {
                stripeCustomerId: customerFromSession ?? pm?.customerId,
              }
            : {}),
        });
      }
    }
  });
}

// An add-on checkout completed → enable the per-company entitlement. Isolation:
// the tenant + company come from OUR signed metadata, and we re-validate that the
// company actually belongs to the tenant before writing (never trust a stray id).
async function onAddonCheckout(session: StripeObject): Promise<void> {
  const meta = session.metadata as StripeObject | undefined;
  const tenantId = str(session.client_reference_id) ?? str(meta?.tenantId);
  const addonId = str(meta?.addonId);
  const companyId = str(meta?.companyId);
  if (!tenantId || !companyId || !isAddonId(addonId)) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  // company_entitlements is company-scoped (RLS has_company_access), but a Stripe
  // webhook is SESSION-LESS — under Supabase the RLS client has no auth.uid() and
  // would block these reads/writes (customer paid, add-on never activates). Run
  // the company-scoped work in the same trusted service context the cron uses;
  // isolation still holds because we validate company.tenantId === tenantId.
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return; // company must be in the tenant
    const subId = str(session.subscription);
    // Idempotency + anti-resurrection: skip if we've already processed THIS
    // subscription's checkout — whether it's still active (nothing to do) OR the
    // owner has since disabled it (a redelivered/replayed event must NOT silently
    // re-enable a cancelled add-on on a now-dead subscription). A genuinely new
    // purchase carries a NEW subscription id and falls through to enable.
    const existing = await getCompanyEntitlement(companyId, addonId);
    if (existing && existing.stripeSubscriptionId === subId) return;
    await upsertCompanyEntitlement({
      companyId,
      addonId,
      status: "active",
      enabledById: WEBHOOK_ACTOR.id,
      stripeSubscriptionId: subId,
    });
    await logAction(WEBHOOK_ACTOR, "billing.addon_enabled", {
      tenantId,
      targetType: "company",
      targetId: companyId,
      detail: `Add-on "${addonId}" enabled via Stripe Checkout`,
    });
  });
}

// An add-on's Stripe subscription ended → flip the entitlement to cancelled.
async function onAddonSubscriptionDeleted(sub: StripeObject): Promise<void> {
  const meta = sub.metadata as StripeObject | undefined;
  const tenantId = str(meta?.tenantId);
  const addonId = str(meta?.addonId);
  const companyId = str(meta?.companyId);
  if (!tenantId || !companyId || !isAddonId(addonId)) return;
  // Session-less webhook → run the company-scoped work in the service context
  // (see onAddonCheckout); the company.tenantId check keeps isolation.
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const ent = await getCompanyEntitlement(companyId, addonId);
    if (!ent || ent.status === "cancelled") return; // already off / never existed
    await upsertCompanyEntitlement({
      companyId,
      addonId,
      status: "cancelled",
      enabledById: WEBHOOK_ACTOR.id,
    });
    await logAction(WEBHOOK_ACTOR, "billing.addon_cancelled", {
      tenantId,
      targetType: "company",
      targetId: companyId,
      detail: `Add-on "${addonId}" cancelled — Stripe subscription ended`,
    });
  });
}

// customer.subscription.updated → sync the plan to whatever price is active.
// Add-on / marketing-package subscriptions carry metadata.kind and are NOT
// tenant plan subscriptions — ignore them here.
async function onSubscriptionUpdated(sub: StripeObject): Promise<void> {
  const kind = str((sub.metadata as StripeObject | undefined)?.kind);
  if (kind === "addon") return;
  if (kind === "marketing_package") {
    await onMarketingPackageSubscriptionUpdated(sub);
    return;
  }
  const tenant = await tenantForSubscription(sub);
  if (!tenant) return;
  const items = (sub.items as StripeObject | undefined)?.data as
    StripeObject[] | undefined;
  const priceId = str((items?.[0]?.price as StripeObject | undefined)?.id);
  const plan: PlanId | undefined = priceId
    ? planForPriceId(priceId)
    : undefined;
  if (!plan || plan === tenant.plan) return;
  await updateTenant(tenant.id, { plan, stripeSubscriptionId: str(sub.id) });
  await logAction(WEBHOOK_ACTOR, "billing.plan_synced", {
    tenantId: tenant.id,
    targetType: "tenant",
    targetId: tenant.id,
    detail: `Plan synced to ${plan} from Stripe subscription`,
  });
}

async function onMarketingPackageSubscriptionUpdated(
  sub: StripeObject,
): Promise<void> {
  const meta = sub.metadata as StripeObject | undefined;
  const tenantId = str(meta?.tenantId);
  const companyId = str(meta?.companyId);
  if (!tenantId || !companyId) return;
  await runInServiceContext(tenantId, async () => {
    const company = await getCompany(companyId);
    if (!company || company.tenantId !== tenantId) return;
    const prev = company.profile.managedService;
    if (!prev) return;
    const before =
      prev.serviceBilling ??
      initialCompanyServiceBilling(
        prev.marketingPackageId ?? "starter",
        prev.serviceOptions,
      );
    const incomingSubscriptionId = str(sub.id);
    if (!isCurrentServiceSubscriptionEvent(before, incomingSubscriptionId)) {
      await auditStaleManagedSubscriptionEvent({
        tenantId,
        companyId,
        eventKind: "customer.subscription.updated",
        incomingSubscriptionId,
        currentSubscriptionId: before.stripeSubscriptionId,
      });
      return;
    }
    const currentState =
      incomingSubscriptionId &&
      (await retrieveMarketingPackageSubscriptionState(
        incomingSubscriptionId,
        { tenantId, companyId },
      ));
    if (!currentState) {
      throw new Error("Stripe marketing-package item correlation failed");
    }
    const currentPeriodEnd = currentState.currentPeriodEnd
      ? new Date(currentState.currentPeriodEnd * 1000).toISOString()
      : before.currentPeriodEnd;
    const cancelAtPeriodEnd = currentState.cancelAtPeriodEnd;
    const nextBilling = {
      ...before,
      stripeSubscriptionId: str(sub.id) ?? before.stripeSubscriptionId,
      stripeSubscriptionItemId: currentState.subscriptionItemId,
      stripePriceId: currentState.priceId,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      status: cancelAtPeriodEnd
        ? ("cancel_at_period_end" as const)
        : before.status,
    };
    await updateCompany(companyId, {
      profile: {
        ...company.profile,
        managedService: { ...prev, serviceBilling: nextBilling },
      },
    });
  });
}

// customer.subscription.deleted → graceful downgrade to Starter. Existing
// companies keep working; only NEW company creation is gated by the limit.
// If the ended subscription is an ADD-ON (not the plan), cancel the entitlement
// instead — downgrading the plan on an add-on cancellation would be a bug.
// Marketing-package subs never touch tenant plan either.
async function onSubscriptionDeleted(sub: StripeObject): Promise<void> {
  const kind = str((sub.metadata as StripeObject | undefined)?.kind);
  if (kind === "addon") {
    await onAddonSubscriptionDeleted(sub);
    return;
  }
  if (kind === "marketing_package") {
    const meta = sub.metadata as StripeObject | undefined;
    const tenantId = str(meta?.tenantId);
    const companyId = str(meta?.companyId);
    if (!tenantId || !companyId) return;
    await runInServiceContext(tenantId, async () => {
      const company = await getCompany(companyId);
      if (!company || company.tenantId !== tenantId) return;
      const prev = company.profile.managedService;
      if (!prev?.serviceBilling) return;
      const deletedSubscriptionId = str(sub.id);
      if (
        !isCurrentServiceSubscriptionEvent(
          prev.serviceBilling,
          deletedSubscriptionId,
        )
      ) {
        await auditStaleManagedSubscriptionEvent({
          tenantId,
          companyId,
          eventKind: "customer.subscription.deleted",
          incomingSubscriptionId: deletedSubscriptionId,
          currentSubscriptionId: prev.serviceBilling.stripeSubscriptionId,
        });
        return;
      }
      await updateCompany(companyId, {
        profile: {
          ...company.profile,
          managedService: {
            ...prev,
            serviceBilling: {
              ...prev.serviceBilling,
              status: "paused",
              pausedAt: new Date().toISOString(),
              cancelAtPeriodEnd: true,
            },
          },
        },
      });
    });
    return;
  }
  const tenant = await tenantForSubscription(sub);
  if (!tenant || tenant.plan === "starter") return;
  // Only downgrade when the deleted subscription is the tenant's CURRENT plan
  // subscription. A plan change (onCheckoutCompleted) overwrites
  // stripeSubscriptionId to the new sub without cancelling the prior one, so a
  // superseded plan subscription can still be deleted later (portal / dunning);
  // that deletion must NOT force-downgrade a tenant whose current subscription is
  // alive and billing. (If we have no recorded subscription id, don't guess.)
  const deletedSubId = str(sub.id);
  if (
    !tenant.stripeSubscriptionId ||
    deletedSubId !== tenant.stripeSubscriptionId
  )
    return;
  await updateTenant(tenant.id, {
    plan: "starter",
    stripeSubscriptionId: undefined,
  });
  await logAction(WEBHOOK_ACTOR, "billing.subscription_cancelled", {
    tenantId: tenant.id,
    targetType: "tenant",
    targetId: tenant.id,
    detail: "Subscription cancelled — downgraded to starter",
  });
}

async function tenantForSubscription(
  sub: StripeObject,
): Promise<Tenant | undefined> {
  const tenantId = str((sub.metadata as StripeObject | undefined)?.tenantId);
  if (tenantId) return getTenant(tenantId);
  const customer = str(sub.customer);
  return customer ? getTenantByStripeCustomer(customer) : undefined;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json(
      { error: "billing not configured" },
      { status: 503 },
    );
  }
  const rawBody = await req.text();
  if (
    !verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret)
  ) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: StripeObject;
  try {
    event = JSON.parse(rawBody) as StripeObject;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const object = (event.data as StripeObject | undefined)?.object as
    StripeObject | undefined;
  if (!object) return NextResponse.json({ received: true });
  const eventId = str(event.id);
  const eventType = str(event.type);
  if (!eventId || !eventType) {
    return NextResponse.json(
      { error: "event id/type missing" },
      { status: 400 },
    );
  }

  try {
    if (await hasProcessedStripeWebhookEvent(eventId)) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    switch (eventType) {
      case "checkout.session.completed":
        await onCheckoutCompleted(object);
        break;
      case "customer.subscription.updated":
        await onSubscriptionUpdated(object);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(object);
        break;
      case "invoice.payment_failed":
        await onManagedServiceInvoice(object, false);
        break;
      case "invoice.payment_succeeded":
        await onManagedServiceInvoice(object, true);
        break;
      default:
        break; // other events acknowledged, unprocessed
    }
    await recordProcessedStripeWebhookEvent({
      eventId,
      eventType,
    });
  } catch (err) {
    console.error(`[billing] webhook handler failed for ${eventType}:`, err);
    return NextResponse.json(
      { error: "temporary webhook processing failure" },
      { status: 500 },
    );
  }
  return NextResponse.json({ received: true });
}
