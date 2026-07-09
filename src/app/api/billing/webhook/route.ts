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
  updateRestaurantOrder,
  updateTenant,
  upsertCompanyEntitlement,
} from "@/lib/db";
import { planForPriceId, stripeConfigured, verifyStripeSignature } from "@/lib/billing";
import { planFor } from "@/lib/plans";
import { isAddonId } from "@/lib/addons";
import { runInServiceContext } from "@/lib/db/service-context";
import { logAction } from "@/lib/audit";
import type { PlanId, Tenant } from "@/lib/types";

const WEBHOOK_ACTOR = { id: "stripe_webhook", email: "webhooks@stripe.com" };

type StripeObject = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// checkout.session.completed → link the Stripe customer/subscription and set
// the purchased plan (metadata.planId was stamped when we created the session).
// An ADD-ON checkout (metadata.kind === "addon") is a different beast — it
// enables a per-company entitlement, never touches the plan — so it forks first.
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
  const tenantId =
    str(session.client_reference_id) ??
    str((session.metadata as StripeObject | undefined)?.tenantId);
  if (!tenantId) return;
  const tenant = await getTenant(tenantId);
  if (!tenant) return;
  const plan = str((session.metadata as StripeObject | undefined)?.planId);
  const nextPlan = plan ? planFor(plan).id : tenant.plan;
  const nextCustomer = str(session.customer) ?? tenant.stripeCustomerId;
  const nextSubscription = str(session.subscription) ?? tenant.stripeSubscriptionId;
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
// Add-on subscriptions carry metadata.kind === "addon" and are NOT plan
// subscriptions — ignore them here (they have no plan to sync; their lifecycle
// is enable-on-checkout / cancel-on-delete).
async function onSubscriptionUpdated(sub: StripeObject): Promise<void> {
  if (str((sub.metadata as StripeObject | undefined)?.kind) === "addon") return;
  const tenant = await tenantForSubscription(sub);
  if (!tenant) return;
  const items = (sub.items as StripeObject | undefined)?.data as
    | StripeObject[]
    | undefined;
  const priceId = str((items?.[0]?.price as StripeObject | undefined)?.id);
  const plan: PlanId | undefined = priceId ? planForPriceId(priceId) : undefined;
  if (!plan || plan === tenant.plan) return;
  await updateTenant(tenant.id, { plan, stripeSubscriptionId: str(sub.id) });
  await logAction(WEBHOOK_ACTOR, "billing.plan_synced", {
    tenantId: tenant.id,
    targetType: "tenant",
    targetId: tenant.id,
    detail: `Plan synced to ${plan} from Stripe subscription`,
  });
}

// customer.subscription.deleted → graceful downgrade to Starter. Existing
// companies keep working; only NEW company creation is gated by the limit.
// If the ended subscription is an ADD-ON (not the plan), cancel the entitlement
// instead — downgrading the plan on an add-on cancellation would be a bug.
async function onSubscriptionDeleted(sub: StripeObject): Promise<void> {
  if (str((sub.metadata as StripeObject | undefined)?.kind) === "addon") {
    await onAddonSubscriptionDeleted(sub);
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
  if (!tenant.stripeSubscriptionId || deletedSubId !== tenant.stripeSubscriptionId) return;
  await updateTenant(tenant.id, { plan: "starter", stripeSubscriptionId: undefined });
  await logAction(WEBHOOK_ACTOR, "billing.subscription_cancelled", {
    tenantId: tenant.id,
    targetType: "tenant",
    targetId: tenant.id,
    detail: "Subscription cancelled — downgraded to starter",
  });
}

async function tenantForSubscription(sub: StripeObject): Promise<Tenant | undefined> {
  const tenantId = str((sub.metadata as StripeObject | undefined)?.tenantId);
  if (tenantId) return getTenant(tenantId);
  const customer = str(sub.customer);
  return customer ? getTenantByStripeCustomer(customer) : undefined;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: StripeObject;
  try {
    event = JSON.parse(rawBody) as StripeObject;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const object = (event.data as StripeObject | undefined)?.object as
    | StripeObject
    | undefined;
  if (!object) return NextResponse.json({ received: true });

  // Handlers are defensive against odd payload shapes, but the data layer may
  // throw once it's a real Postgres adapter (not the in-memory store). Catch so
  // a single deterministic "poison" event can't 500 and be retried by Stripe
  // forever, wedging the endpoint and delaying every later event. We ack (200)
  // and log server-side; genuinely retryable failures are handled by Stripe's
  // own dashboard replay.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutCompleted(object);
        break;
      case "customer.subscription.updated":
        await onSubscriptionUpdated(object);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(object);
        break;
      default:
        break; // other events acknowledged, unprocessed
    }
  } catch (err) {
    console.error(`[billing] webhook handler failed for ${event.type}:`, err);
  }
  return NextResponse.json({ received: true });
}
