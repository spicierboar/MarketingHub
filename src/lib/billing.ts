// Billing & metering engine (SaaS T4).
//
// Env-gated like every other external: with no STRIPE_SECRET_KEY the demo runs
// unchanged — plan changes apply directly (owner-only action) and no payment
// flow exists. With Stripe configured, plan changes go through Checkout and
// arrive back via the signed webhook (src/app/api/billing/webhook).
//
// The meter is NOT new machinery: per-tenant AI spend is aiSpendThisMonth()
// over ai_runs.estCostUsd (Phase 10), and the company count is the tenant's
// own company list. Plans (src/lib/plans.ts) turn both into limits:
//   • companyLimit gates createCompanyAction (pricing is per client company);
//   • aiIncludedUsd clamps the effective AI cap (enforced in aiBudgetExceeded);
//   • automations/whiteLabel gate paid features.
//
// Uses the Stripe REST API directly (form-encoded fetch) rather than the SDK,
// so the demo keeps zero external dependencies.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  aiSpendThisMonth,
  effectiveAiCapUsd,
  getSecuritySettings,
  getTenant,
  listCompanies,
} from "@/lib/db";
import { localDemoEnabled } from "@/lib/env";
import { planFor, type PlanDef } from "@/lib/plans";
import type { AddonId, MarketingPackageId, PlanId, Tenant } from "@/lib/types";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Prefer mock package checkout in local demo even when Stripe keys exist. */
export function useMockPackageCheckout(): boolean {
  return localDemoEnabled() || !stripeConfigured();
}

// The Stripe Price for each plan (created in the owner's Stripe dashboard).
export function stripePriceId(plan: PlanId): string | undefined {
  return {
    starter: process.env.STRIPE_PRICE_STARTER,
    agency: process.env.STRIPE_PRICE_AGENCY,
    scale: process.env.STRIPE_PRICE_SCALE,
  }[plan];
}

// Reverse lookup for webhook payloads (subscription items carry the price id).
export function planForPriceId(priceId: string): PlanId | undefined {
  return (["starter", "agency", "scale"] as PlanId[]).find(
    (p) => stripePriceId(p) === priceId,
  );
}

// ---- Usage & limits -----------------------------------------------------------

export interface TenantUsage {
  plan: PlanDef;
  companiesUsed: number;
  companyLimit: number | null; // null = unlimited
  atCompanyLimit: boolean;
  aiSpendUsd: number;
  aiCapUsd: number; // effective: min(admin cap, plan allowance)
  adminCapUsd: number; // the tenant admin's own cap (Admin & Security)
}

export async function tenantUsage(tenantId: string): Promise<TenantUsage> {
  const [tenant, companies, aiSpendUsd, aiCapUsd, settings] = await Promise.all([
    getTenant(tenantId),
    listCompanies(tenantId),
    aiSpendThisMonth(tenantId),
    effectiveAiCapUsd(tenantId),
    getSecuritySettings(tenantId),
  ]);
  const plan = planFor(tenant?.plan);
  return {
    plan,
    companiesUsed: companies.length,
    companyLimit: plan.companyLimit,
    atCompanyLimit:
      plan.companyLimit !== null && companies.length >= plan.companyLimit,
    aiSpendUsd,
    aiCapUsd,
    adminCapUsd: settings.aiMonthlyCapUsd,
  };
}

// The plan gate on company count — call BEFORE creating a company. Existing
// companies are never touched by a downgrade; only new creation is blocked.
// Local demo skips the gate so seed tenants stay usable for walkthroughs.
export async function assertCompanyQuota(tenantId: string): Promise<void> {
  if (localDemoEnabled()) return;
  const usage = await tenantUsage(tenantId);
  if (usage.atCompanyLimit) {
    throw new Error(
      `Your ${usage.plan.name} plan includes ${usage.companyLimit} client ` +
        `compan${usage.companyLimit === 1 ? "y" : "ies"} and all are in use. ` +
        `Upgrade on the Billing page to add more.`,
    );
  }
}

export async function planIncludesAutomations(tenantId: string): Promise<boolean> {
  return planFor((await getTenant(tenantId))?.plan).automations;
}

export async function planIncludesWhiteLabel(tenantId: string): Promise<boolean> {
  return planFor((await getTenant(tenantId))?.plan).whiteLabel;
}

export async function assertPlanIncludesAutomations(tenantId: string): Promise<void> {
  if (!(await planIncludesAutomations(tenantId))) {
    throw new Error(
      "Enterprise Automation is not included in your plan. Upgrade on the Billing page to enable it.",
    );
  }
}

// ---- Stripe (env-gated) ---------------------------------------------------------

// Minimal form-encoded call to the Stripe REST API. Never surfaces Stripe's
// raw error text to callers (it can flow into audit/UI) — logs server-side.
async function stripePost(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(`[billing] Stripe ${path} failed (${res.status}):`, body);
      return null;
    }
    return body;
  } catch (err) {
    console.error(`[billing] Stripe ${path} request error:`, err);
    return null;
  }
}

async function stripeGet(
  path: string,
): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(`[billing] Stripe GET ${path} failed (${res.status}):`, body);
      return null;
    }
    return body;
  } catch (err) {
    console.error(`[billing] Stripe GET ${path} request error:`, err);
    return null;
  }
}

// Subscription Checkout for a plan change. Returns the hosted checkout URL,
// or null when Stripe is unconfigured / the call fails.
export async function createCheckoutSession(
  tenant: Tenant,
  plan: PlanId,
  origin: string,
  opts?: { successPath?: string; cancelPath?: string },
): Promise<string | null> {
  const price = stripePriceId(plan);
  if (!stripeConfigured() || !price) return null;
  // Onboarding routes checkout back into the wizard; billing defaults to /billing.
  const successPath = opts?.successPath ?? "/billing?checkout=success";
  const cancelPath = opts?.cancelPath ?? "/billing?checkout=cancelled";
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: tenant.id,
    "subscription_data[metadata][tenantId]": tenant.id,
    "metadata[tenantId]": tenant.id,
    "metadata[planId]": plan,
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
  };
  // Returning customer: reuse their Stripe customer so subscriptions merge.
  if (tenant.stripeCustomerId) params.customer = tenant.stripeCustomerId;
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

// Stripe Billing Portal — invoices, payment method, cancel/upgrade.
export async function createPortalSession(
  tenant: Tenant,
  origin: string,
): Promise<string | null> {
  if (!stripeConfigured() || !tenant.stripeCustomerId) return null;
  const session = await stripePost("billing_portal/sessions", {
    customer: tenant.stripeCustomerId,
    return_url: `${origin}/billing`,
  });
  return typeof session?.url === "string" ? session.url : null;
}

// ---- Module 6: ad-management fee invoicing (env-gated) --------------------------
//
// The ONLY money we ever charge on the paid-advertising side: our management
// fee (the client's own card pays the platform for ad spend — we never touch
// it). This raises a Stripe invoice against the TENANT's own Stripe customer.
// Env-gated + fail-safe like every external: with no Stripe key, or no customer
// on the tenant yet, it returns null and the UI shows the computed fee without
// billing it. Amount is dollars; Stripe wants integer cents.
export async function createManagementFeeInvoice(
  tenant: Tenant,
  amountUsd: number,
  description: string,
): Promise<string | null> {
  if (!stripeConfigured() || !tenant.stripeCustomerId) return null;
  const cents = Math.round(amountUsd * 100);
  if (cents <= 0) return null;
  // 1) attach a one-off invoice item to the customer's next invoice…
  const item = await stripePost("invoiceitems", {
    customer: tenant.stripeCustomerId,
    amount: String(cents),
    currency: "aud",
    description: description.slice(0, 350),
    "metadata[tenantId]": tenant.id,
    "metadata[kind]": "ad_management_fee",
  });
  if (!item) return null;
  // 2) …and finalise+send it immediately as its own invoice.
  const invoice = await stripePost("invoices", {
    customer: tenant.stripeCustomerId,
    auto_advance: "true",
    collection_method: "charge_automatically",
    "metadata[tenantId]": tenant.id,
    "metadata[kind]": "ad_management_fee",
  });
  const idVal = invoice?.id;
  return typeof idVal === "string" ? idVal : null;
}

// ---- Module 3: per-company add-ons (env-gated) ----------------------------------
//
// Each add-on maps to its own Stripe Price (a separate subscription line billed
// to the TENANT's own customer, on top of the base plan). Enabling routes to
// Checkout; the signed webhook applies the entitlement (metadata.kind === addon).
// Disabling cancels the add-on's Stripe subscription. Demo mode (no keys) skips
// Stripe entirely — the toggle writes the entitlement directly (see the actions).

export function stripeAddonPriceId(addonId: AddonId): string | undefined {
  return {
    video: process.env.STRIPE_PRICE_ADDON_VIDEO,
    photo: process.env.STRIPE_PRICE_ADDON_PHOTO,
    menus: process.env.STRIPE_PRICE_ADDON_MENUS,
    order_button: process.env.STRIPE_PRICE_ADDON_ORDER_BUTTON,
    bookings: process.env.STRIPE_PRICE_ADDON_BOOKINGS,
  }[addonId];
}

// Subscription Checkout for enabling one add-on on one client company. All the
// context the webhook needs is stamped in OUR-controlled metadata (tenant +
// company + add-on) on BOTH the session and the subscription, so
// subscription.deleted can later find and cancel the entitlement. Returns the
// hosted URL, or null when Stripe/the price is unconfigured.
export async function createAddonCheckoutSession(
  tenant: Tenant,
  addonId: AddonId,
  companyId: string,
  origin: string,
  returnPaths?: { successPath?: string; cancelPath?: string },
): Promise<string | null> {
  const price = stripeAddonPriceId(addonId);
  if (!stripeConfigured() || !price) return null;
  const successUrl = returnPaths?.successPath ? `${origin}${returnPaths.successPath}` : `${origin}/billing?addon=success`;
  const cancelUrl = returnPaths?.cancelPath ? `${origin}${returnPaths.cancelPath}` : `${origin}/billing?addon=cancelled`;
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: tenant.id,
    "metadata[tenantId]": tenant.id,
    "metadata[kind]": "addon",
    "metadata[addonId]": addonId,
    "metadata[companyId]": companyId,
    "subscription_data[metadata][tenantId]": tenant.id,
    "subscription_data[metadata][kind]": "addon",
    "subscription_data[metadata][addonId]": addonId,
    "subscription_data[metadata][companyId]": companyId,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  if (tenant.stripeCustomerId) params.customer = tenant.stripeCustomerId;
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

// ---- Marketing package Checkout (company SKU) --------------------------------
//
// Price IDs are optional env stubs. Mock Checkout only when local demo / no
// Stripe keys / no STRIPE_PRICE_PACKAGE_* — never fall through to mock after a
// failed live session create. Webhook kind=marketing_package clears
// packageChangePendingBilling and must NOT touch tenant plan / subscription.

export function stripeMarketingPackagePriceId(
  packageId: MarketingPackageId,
): string | undefined {
  if (packageId === "custom") {
    return process.env.STRIPE_PRICE_PACKAGE_CUSTOM?.trim() || undefined;
  }
  return (
    {
      basic: process.env.STRIPE_PRICE_PACKAGE_BASIC,
      pro: process.env.STRIPE_PRICE_PACKAGE_PRO,
      blast: process.env.STRIPE_PRICE_PACKAGE_BLAST,
    }[packageId]?.trim() || undefined
  );
}

/** True when Checkout metadata identifies a company marketing-package SKU. */
export function isMarketingPackageCheckoutKind(
  meta: Record<string, unknown> | undefined | null,
): boolean {
  return typeof meta?.kind === "string" && meta.kind === "marketing_package";
}

/**
 * Retrieve a Checkout Session by id (live Stripe only).
 * Returns null when unconfigured / not found — never invents a paid session.
 */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  if (!stripeConfigured() || !sessionId.trim()) return null;
  return stripeGet(`checkout/sessions/${encodeURIComponent(sessionId.trim())}`);
}

export type MarketingPackageCheckoutVerify =
  | { ok: true; sessionId: string; companyId: string; tenantId: string; packageId?: string }
  | { ok: false; reason: string };

/**
 * Server-side gate before clearing packageChangePendingBilling from a browser
 * return URL. `?checkout=success` alone must never settle.
 */
export function verifyMarketingPackageCheckoutSession(
  session: Record<string, unknown> | null | undefined,
  expect: { tenantId: string; companyId: string },
): MarketingPackageCheckoutVerify {
  if (!session) return { ok: false, reason: "session_missing" };
  const sessionId = typeof session.id === "string" ? session.id : "";
  if (!sessionId) return { ok: false, reason: "session_id_missing" };
  const meta = session.metadata as Record<string, unknown> | undefined;
  if (!isMarketingPackageCheckoutKind(meta)) {
    return { ok: false, reason: "wrong_kind" };
  }
  const tenantId =
    (typeof meta?.tenantId === "string" ? meta.tenantId : undefined) ??
    (typeof session.client_reference_id === "string"
      ? session.client_reference_id
      : undefined);
  const companyId = typeof meta?.companyId === "string" ? meta.companyId : undefined;
  if (!tenantId || tenantId !== expect.tenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (!companyId || companyId !== expect.companyId) {
    return { ok: false, reason: "company_mismatch" };
  }
  const paymentStatus =
    typeof session.payment_status === "string" ? session.payment_status : "";
  const status = typeof session.status === "string" ? session.status : "";
  // Subscription Checkout may report payment_status=paid or unpaid+complete
  // (trial / delayed invoice). Accept complete + paid/no_payment_required.
  const paidOk =
    paymentStatus === "paid" ||
    paymentStatus === "no_payment_required" ||
    (status === "complete" && paymentStatus !== "unpaid");
  if (!paidOk && status !== "complete") {
    return { ok: false, reason: `not_complete:${status || "?"}:${paymentStatus || "?"}` };
  }
  const packageId =
    typeof meta?.packageId === "string" ? meta.packageId : undefined;
  return { ok: true, sessionId, companyId, tenantId, packageId };
}

function withCheckoutSessionId(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}session_id={CHECKOUT_SESSION_ID}`;
}

/**
 * Hosted Stripe Checkout for a company marketing package subscription.
 * Returns null when demo / keys missing / price unset — caller should mock
 * only in those cases (never after a failed live create).
 */
export async function createMarketingPackageCheckoutSession(
  tenant: Tenant,
  companyId: string,
  packageId: MarketingPackageId,
  origin: string,
  returnPaths?: { successPath?: string; cancelPath?: string },
): Promise<string | null> {
  if (useMockPackageCheckout()) return null;
  const price = stripeMarketingPackagePriceId(packageId);
  if (!price) return null;
  const successPath = returnPaths?.successPath
    ? returnPaths.successPath
    : `/sales/new-client?step=checkout&companyId=${encodeURIComponent(companyId)}&checkout=success`;
  const cancelPath = returnPaths?.cancelPath
    ? returnPaths.cancelPath
    : `/sales/new-client?step=checkout&companyId=${encodeURIComponent(companyId)}&checkout=cancelled`;
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: tenant.id,
    "metadata[tenantId]": tenant.id,
    "metadata[kind]": "marketing_package",
    "metadata[packageId]": packageId,
    "metadata[companyId]": companyId,
    "subscription_data[metadata][tenantId]": tenant.id,
    "subscription_data[metadata][kind]": "marketing_package",
    "subscription_data[metadata][packageId]": packageId,
    "subscription_data[metadata][companyId]": companyId,
    success_url: withCheckoutSessionId(`${origin}${successPath}`),
    cancel_url: `${origin}${cancelPath}`,
  };
  if (tenant.stripeCustomerId) params.customer = tenant.stripeCustomerId;
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

// Minimal DELETE call (subscription cancellation). Like stripePost, never
// surfaces Stripe's raw error text; logs server-side and returns null on failure.
async function stripeDelete(path: string): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(`[billing] Stripe DELETE ${path} failed (${res.status}):`, body);
      return null;
    }
    return body;
  } catch (err) {
    console.error(`[billing] Stripe DELETE ${path} request error:`, err);
    return null;
  }
}

// Cancel an add-on's Stripe subscription immediately. Best-effort: true on
// success. The webhook (subscription.deleted, kind=addon) is the backstop that
// also flips the entitlement, but the action flips it locally too so the UI is
// correct without waiting for the webhook.
export async function cancelStripeSubscription(subscriptionId: string): Promise<boolean> {
  if (!stripeConfigured() || !subscriptionId) return false;
  return !!(await stripeDelete(`subscriptions/${encodeURIComponent(subscriptionId)}`));
}

// ---- Prepaid credit top-up (mode=payment) ------------------------------------
//
// One-off Checkout for company wallet top-ups. Webhook (metadata.kind ===
// credit_top_up) credits the wallet + issues a local tax invoice. Returns null
// when Stripe is unconfigured (demo falls back to simulated ledger credit).

export async function createCreditTopUpCheckoutSession(
  tenant: Tenant,
  companyId: string,
  amountUsd: number,
  origin: string,
  opts?: { successPath?: string; cancelPath?: string; stripeCustomerId?: string },
): Promise<string | null> {
  if (!stripeConfigured()) return null;
  const cents = Math.round(amountUsd * 100);
  if (!(cents > 0)) return null;
  const successPath =
    opts?.successPath ?? `/client/payments?topup=success`;
  const cancelPath =
    opts?.cancelPath ?? `/client/payments?topup=cancelled`;
  const amountStr = String(amountUsd);
  const params: Record<string, string> = {
    mode: "payment",
    client_reference_id: tenant.id,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]":
      `Account credit top-up ($${amountUsd.toFixed(2)})`,
    "line_items[0][quantity]": "1",
    "metadata[kind]": "credit_top_up",
    "metadata[tenantId]": tenant.id,
    "metadata[companyId]": companyId,
    "metadata[amountUsd]": amountStr,
    "payment_intent_data[metadata][kind]": "credit_top_up",
    "payment_intent_data[metadata][tenantId]": tenant.id,
    "payment_intent_data[metadata][companyId]": companyId,
    "payment_intent_data[metadata][amountUsd]": amountStr,
    // Save card for later off-session auto top-up (never auto-publishes ads).
    "payment_intent_data[setup_future_usage]": "off_session",
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
  };
  if (opts?.stripeCustomerId || tenant.stripeCustomerId) {
    params.customer = opts?.stripeCustomerId ?? tenant.stripeCustomerId!;
  }
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

/**
 * Off-session PaymentIntent for auto top-up when a saved payment method exists.
 * Returns payment_intent id on success, null when Stripe unconfigured / charge fails.
 */
export async function chargeOffSessionCreditTopUp(input: {
  customerId: string;
  paymentMethodId: string;
  amountUsd: number;
  tenantId: string;
  companyId: string;
}): Promise<{ paymentIntentId: string } | null> {
  if (!stripeConfigured()) return null;
  const cents = Math.round(input.amountUsd * 100);
  if (!(cents > 0)) return null;
  const amountStr = String(input.amountUsd);
  const pi = await stripePost("payment_intents", {
    amount: String(cents),
    currency: "aud",
    customer: input.customerId,
    payment_method: input.paymentMethodId,
    confirm: "true",
    off_session: "true",
    "metadata[kind]": "credit_auto_top_up",
    "metadata[tenantId]": input.tenantId,
    "metadata[companyId]": input.companyId,
    "metadata[amountUsd]": amountStr,
  });
  if (!pi || typeof pi.id !== "string") return null;
  const status = typeof pi.status === "string" ? pi.status : "";
  if (status !== "succeeded" && status !== "processing") return null;
  return { paymentIntentId: pi.id };
}

/** Client portal Billing Portal session (payment methods / invoices). */
export async function createClientBillingPortalSession(
  customerId: string,
  origin: string,
  returnPath = "/client/payments",
): Promise<string | null> {
  if (!stripeConfigured() || !customerId) return null;
  const session = await stripePost("billing_portal/sessions", {
    customer: customerId,
    return_url: `${origin}${returnPath}`,
  });
  return typeof session?.url === "string" ? session.url : null;
}

/** Load payment_method id from a PaymentIntent (Checkout completion). */
export async function paymentMethodFromPaymentIntent(
  paymentIntentId: string,
): Promise<{ customerId?: string; paymentMethodId?: string } | null> {
  if (!stripeConfigured() || !paymentIntentId) return null;
  const pi = await stripeGet(
    `payment_intents/${encodeURIComponent(paymentIntentId)}`,
  );
  if (!pi) return null;
  const customerId =
    typeof pi.customer === "string"
      ? pi.customer
      : typeof (pi.customer as { id?: string } | null)?.id === "string"
        ? (pi.customer as { id: string }).id
        : undefined;
  const paymentMethodId =
    typeof pi.payment_method === "string"
      ? pi.payment_method
      : typeof (pi.payment_method as { id?: string } | null)?.id === "string"
        ? (pi.payment_method as { id: string }).id
        : undefined;
  return { customerId, paymentMethodId };
}

// ---- Webhook signature (Stripe-Signature: t=...,v1=...) -------------------------
//
// HMAC-SHA256 of `${t}.${rawBody}` with the webhook secret, timing-safe
// compare, 5-minute replay tolerance. Implemented directly so the webhook
// route needs no SDK either.

export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1)] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
