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
import {
  appEnv,
  liveIntegrationsAllowed,
  localDemoEnabled,
  providerLiveFlagEnabled,
} from "@/lib/env";
import { planFor, type PlanDef } from "@/lib/plans";
import { clientCompaniesOnly } from "@/lib/content-create-scope";
import type {
  AddonId,
  CompanyServiceBillingState,
  CompanyServiceOptions,
  MarketingPackageId,
  PlanId,
  Tenant,
} from "@/lib/types";
import {
  currentPackageId,
  normaliseCompanyServiceOptions,
} from "@/lib/managed-service-billing";

export function stripeConfigured(): boolean {
  return (
    providerLiveFlagEnabled(process.env.STRIPE_BILLING_LIVE) &&
    liveIntegrationsAllowed() &&
    Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  );
}

/** Mock settlement is opt-in and is never available in production. */
export function mockPackageCheckoutEnabled(): boolean {
  return appEnv() === "development" && localDemoEnabled();
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
  const [tenant, companiesRaw, aiSpendUsd, aiCapUsd, settings] =
    await Promise.all([
      getTenant(tenantId),
      listCompanies(tenantId),
      aiSpendThisMonth(tenantId),
      effectiveAiCapUsd(tenantId),
      getSecuritySettings(tenantId),
    ]);
  // Internal /content library shelf is not a billable client seat.
  const companies = clientCompaniesOnly(companiesRaw);
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

export async function planIncludesAutomations(
  tenantId: string,
): Promise<boolean> {
  return planFor((await getTenant(tenantId))?.plan).automations;
}

export async function planIncludesWhiteLabel(
  tenantId: string,
): Promise<boolean> {
  return planFor((await getTenant(tenantId))?.plan).whiteLabel;
}

export async function assertPlanIncludesAutomations(
  tenantId: string,
): Promise<void> {
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
  if (!stripeConfigured()) return null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) return null;
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
  if (!stripeConfigured()) return null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(
        `[billing] Stripe GET ${path} failed (${res.status}):`,
        body,
      );
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
  const successUrl = returnPaths?.successPath
    ? `${origin}${returnPaths.successPath}`
    : `${origin}/billing?addon=success`;
  const cancelUrl = returnPaths?.cancelPath
    ? `${origin}${returnPaths.cancelPath}`
    : `${origin}/billing?addon=cancelled`;
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
      starter:
        process.env.STRIPE_PRICE_PACKAGE_STARTER ??
        process.env.STRIPE_PRICE_PACKAGE_BASIC,
      growth:
        process.env.STRIPE_PRICE_PACKAGE_GROWTH ??
        process.env.STRIPE_PRICE_PACKAGE_PRO,
      managed:
        process.env.STRIPE_PRICE_PACKAGE_MANAGED ??
        process.env.STRIPE_PRICE_PACKAGE_BLAST,
      basic: process.env.STRIPE_PRICE_PACKAGE_BASIC,
      pro: process.env.STRIPE_PRICE_PACKAGE_PRO,
      blast: process.env.STRIPE_PRICE_PACKAGE_BLAST,
    }[packageId]?.trim() || undefined
  );
}

export function marketingPackageCheckoutConfigurationError(
  packageId: MarketingPackageId,
  serviceOptions?: Partial<CompanyServiceOptions>,
): string | null {
  if (!stripeConfigured()) return "STRIPE_SECRET_KEY is not configured";
  if (!stripeMarketingPackagePriceId(packageId)) {
    return `Stripe price is not configured for package ${packageId}`;
  }
  const options = normaliseCompanyServiceOptions(packageId, serviceOptions);
  const required: Array<[boolean, string, string | undefined]> = [
    [
      true,
      "website connection setup",
      process.env.STRIPE_PRICE_WEBSITE_CONNECTION_SETUP,
    ],
    [
      options.searchVisibility && packageId === "growth",
      "search visibility",
      process.env.STRIPE_PRICE_SEARCH_VISIBILITY,
    ],
    [
      options.websitePublishing,
      "website publishing",
      process.env.STRIPE_PRICE_WEBSITE_PUBLISHING,
    ],
    [
      options.hostedLandingPage,
      "hosted landing page",
      process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE,
    ],
    [
      options.hostedLandingPage,
      "hosted landing page setup",
      process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE_SETUP,
    ],
  ];
  const missing = required
    .filter(([selected, , price]) => selected && !price?.trim())
    .map(([, label]) => label);
  return missing.length
    ? `Stripe price is not configured for ${missing.join(", ")}`
    : null;
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

export function uniqueSubscriptionItemForPrice(
  subscription: Record<string, unknown> | null | undefined,
  expectedPriceId: string,
): { subscriptionItemId: string; priceId: string } | null {
  const items = ((subscription?.items as Record<string, unknown> | undefined)
    ?.data ?? []) as Array<Record<string, unknown>>;
  const matches = items.filter(
    (item) =>
      typeof item.id === "string" &&
      item.id.length > 0 &&
      (item.price as Record<string, unknown> | undefined)?.id ===
        expectedPriceId,
  );
  return matches.length === 1
    ? {
        subscriptionItemId: matches[0]!.id as string,
        priceId: expectedPriceId,
      }
    : null;
}

export async function retrieveMarketingPackageSubscriptionState(
  subscriptionId: string,
  expect: { tenantId: string; companyId: string },
): Promise<{
  subscriptionItemId: string;
  priceId: string;
  packageId: MarketingPackageId;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
} | null> {
  if (!subscriptionId) return null;
  const subscription = await stripeGet(
    `subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`,
  );
  const metadata = subscription?.metadata as
    | Record<string, unknown>
    | undefined;
  const packageId = metadata?.packageId;
  if (
    subscription?.id !== subscriptionId ||
    metadata?.kind !== "marketing_package" ||
    metadata?.tenantId !== expect.tenantId ||
    metadata?.companyId !== expect.companyId ||
    typeof packageId !== "string" ||
    ![
      "starter",
      "growth",
      "managed",
      "basic",
      "pro",
      "blast",
      "custom",
    ].includes(packageId)
  ) {
    return null;
  }
  const typedPackageId = packageId as MarketingPackageId;
  const expectedPriceId = stripeMarketingPackagePriceId(typedPackageId);
  const correlation = expectedPriceId
    ? uniqueSubscriptionItemForPrice(subscription, expectedPriceId)
    : null;
  if (!correlation) return null;
  const periodEnd = Number(subscription.current_period_end);
  return {
    ...correlation,
    packageId: typedPackageId,
    ...(Number.isFinite(periodEnd) ? { currentPeriodEnd: periodEnd } : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

export async function retrieveMarketingPackageSubscriptionCorrelation(
  subscriptionId: string,
  expect: {
    tenantId: string;
    companyId: string;
    packageId: MarketingPackageId;
  },
): Promise<{ subscriptionItemId: string; priceId: string } | null> {
  const state = await retrieveMarketingPackageSubscriptionState(
    subscriptionId,
    expect,
  );
  const expectedPriceId = stripeMarketingPackagePriceId(expect.packageId);
  if (!state || !expectedPriceId || state.priceId !== expectedPriceId) {
    return null;
  }
  return {
    subscriptionItemId: state.subscriptionItemId,
    priceId: state.priceId,
  };
}

export type MarketingPackageCheckoutVerify =
  | {
      ok: true;
      sessionId: string;
      companyId: string;
      tenantId: string;
      packageId?: string;
    }
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
  const companyId =
    typeof meta?.companyId === "string" ? meta.companyId : undefined;
  if (!tenantId || tenantId !== expect.tenantId) {
    return { ok: false, reason: "tenant_mismatch" };
  }
  if (!companyId || companyId !== expect.companyId) {
    return { ok: false, reason: "company_mismatch" };
  }
  const paymentStatus =
    typeof session.payment_status === "string" ? session.payment_status : "";
  const status = typeof session.status === "string" ? session.status : "";
  // Never infer payment from session completion alone.
  const paidOk =
    paymentStatus === "paid" || paymentStatus === "no_payment_required";
  if (status !== "complete" || !paidOk) {
    return {
      ok: false,
      reason: `not_complete:${status || "?"}:${paymentStatus || "?"}`,
    };
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
  serviceOptions?: Partial<CompanyServiceOptions>,
  pendingTransition?: Pick<
    CompanyServiceBillingState,
    "pendingTransitionId" | "pendingChangeKind" | "pendingEffectiveAt"
  >,
): Promise<string | null> {
  if (mockPackageCheckoutEnabled()) return null;
  if (marketingPackageCheckoutConfigurationError(packageId, serviceOptions)) {
    return null;
  }
  const price = stripeMarketingPackagePriceId(packageId);
  if (!price) return null;
  const connectionSetupPrice =
    process.env.STRIPE_PRICE_WEBSITE_CONNECTION_SETUP?.trim();
  if (!connectionSetupPrice) return null;
  const options = normaliseCompanyServiceOptions(packageId, serviceOptions);
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
  const extraPrices = [
    connectionSetupPrice,
    options.searchVisibility && packageId === "growth"
      ? process.env.STRIPE_PRICE_SEARCH_VISIBILITY?.trim()
      : undefined,
    options.websitePublishing
      ? process.env.STRIPE_PRICE_WEBSITE_PUBLISHING?.trim()
      : undefined,
    options.hostedLandingPage
      ? process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE?.trim()
      : undefined,
    options.hostedLandingPage
      ? process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE_SETUP?.trim()
      : undefined,
  ].filter((id): id is string => Boolean(id));
  const expectedExtraCount =
    1 +
    (options.searchVisibility && packageId === "growth" ? 1 : 0) +
    (options.websitePublishing ? 1 : 0) +
    (options.hostedLandingPage ? 2 : 0);
  if (extraPrices.length !== expectedExtraCount) return null;
  extraPrices.forEach((extraPrice, offset) => {
    const index = offset + 1;
    params[`line_items[${index}][price]`] = extraPrice;
    params[`line_items[${index}][quantity]`] = "1";
  });
  for (const prefix of ["metadata", "subscription_data[metadata]"]) {
    params[`${prefix}[searchVisibility]`] = String(options.searchVisibility);
    params[`${prefix}[websitePublishing]`] = String(options.websitePublishing);
    params[`${prefix}[hostedLandingPage]`] = String(options.hostedLandingPage);
    params[`${prefix}[monthlyAdCapAud]`] = String(options.monthlyAdCapAud);
    if (pendingTransition?.pendingChangeKind) {
      params[`${prefix}[pendingChangeKind]`] =
        pendingTransition.pendingChangeKind;
    }
    if (pendingTransition?.pendingTransitionId) {
      params[`${prefix}[pendingTransitionId]`] =
        pendingTransition.pendingTransitionId;
    }
    if (pendingTransition?.pendingEffectiveAt) {
      params[`${prefix}[pendingEffectiveAt]`] =
        pendingTransition.pendingEffectiveAt;
    }
  }
  if (tenant.stripeCustomerId) params.customer = tenant.stripeCustomerId;
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

export type MarketingPackageSubscriptionChange =
  | {
      ok: true;
      mode:
        "upgrade_invoiced" | "downgrade_pending_renewal" | "downgrade_applied";
      subscriptionId: string;
      subscriptionItemId: string;
      priceId: string;
    }
  | { ok: false; reason: string };

/**
 * Change the one existing company subscription. Upgrades are invoiced
 * immediately; downgrades remain durable locally and are applied by the renewal
 * webhook. Correlation mismatches fail closed and never create a second sub.
 */
export async function changeMarketingPackageSubscription(input: {
  tenantId: string;
  companyId: string;
  packageId: MarketingPackageId;
  changeKind: NonNullable<CompanyServiceBillingState["pendingChangeKind"]>;
  billing: CompanyServiceBillingState;
  serviceOptions?: CompanyServiceOptions;
  applyDowngradeAtRenewal?: boolean;
}): Promise<MarketingPackageSubscriptionChange> {
  const subscriptionId = input.billing.stripeSubscriptionId;
  const expectedItemId = input.billing.stripeSubscriptionItemId;
  const expectedPriceId = input.billing.stripePriceId;
  const nextPriceId = stripeMarketingPackagePriceId(input.packageId);
  if (
    !stripeConfigured() ||
    !subscriptionId ||
    !expectedItemId ||
    !expectedPriceId ||
    !nextPriceId
  ) {
    return { ok: false, reason: "missing_subscription_correlation" };
  }
  const subscription = await stripeGet(
    `subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=items.data.price`,
  );
  if (!subscription || subscription.id !== subscriptionId) {
    return { ok: false, reason: "subscription_not_found" };
  }
  const metadata = subscription.metadata as Record<string, unknown> | undefined;
  if (
    metadata?.kind !== "marketing_package" ||
    metadata?.tenantId !== input.tenantId ||
    metadata?.companyId !== input.companyId
  ) {
    return { ok: false, reason: "subscription_scope_mismatch" };
  }
  const items = ((subscription.items as Record<string, unknown> | undefined)
    ?.data ?? []) as Array<Record<string, unknown>>;
  const matching = items.filter((item) => {
    const price = item.price as Record<string, unknown> | undefined;
    return item.id === expectedItemId && price?.id === expectedPriceId;
  });
  if (matching.length !== 1) {
    return { ok: false, reason: "subscription_item_mismatch" };
  }
  const deferred = ["downgrade", "options_downgrade", "mixed"].includes(
    input.changeKind,
  );
  if (deferred && !input.applyDowngradeAtRenewal) {
    return {
      ok: true,
      mode: "downgrade_pending_renewal",
      subscriptionId,
      subscriptionItemId: expectedItemId,
      priceId: nextPriceId,
    };
  }
  const options = normaliseCompanyServiceOptions(
    input.packageId,
    input.serviceOptions ??
      input.billing.pendingServiceOptions ??
      input.billing.serviceOptions,
  );
  const recurringOptionPrices = [
    [
      options.searchVisibility &&
        currentPackageId(input.packageId) === "growth",
      process.env.STRIPE_PRICE_SEARCH_VISIBILITY?.trim(),
    ],
    [
      options.websitePublishing,
      process.env.STRIPE_PRICE_WEBSITE_PUBLISHING?.trim(),
    ],
    [
      options.hostedLandingPage,
      process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE?.trim(),
    ],
  ] as const;
  if (recurringOptionPrices.some(([selected, price]) => selected && !price)) {
    return { ok: false, reason: "missing_recurring_price_configuration" };
  }
  const desiredRecurring = [
    nextPriceId,
    ...recurringOptionPrices
      .filter(([selected]) => selected)
      .map(([, price]) => price),
  ].filter((value): value is string => Boolean(value));
  const itemByPrice = new Map(
    items.map((item) => [
      (item.price as Record<string, unknown> | undefined)?.id,
      item.id,
    ]),
  );
  const updateParams: Record<string, string> = {
    proration_behavior: deferred ? "none" : "always_invoice",
    payment_behavior: deferred ? "allow_incomplete" : "pending_if_incomplete",
    "metadata[kind]": "marketing_package",
    "metadata[tenantId]": input.tenantId,
    "metadata[companyId]": input.companyId,
    "metadata[packageId]": input.packageId,
    "metadata[pendingTransitionId]": input.billing.pendingTransitionId ?? "",
    "metadata[pendingChangeKind]": input.changeKind,
    "metadata[pendingEffectiveAt]": input.billing.pendingEffectiveAt ?? "",
    "metadata[searchVisibility]": String(options.searchVisibility),
    "metadata[websitePublishing]": String(options.websitePublishing),
    "metadata[hostedLandingPage]": String(options.hostedLandingPage),
    "metadata[monthlyAdCapAud]": String(options.monthlyAdCapAud),
  };
  let itemIndex = 0;
  for (const priceId of desiredRecurring) {
    const existingId = itemByPrice.get(priceId);
    if (existingId)
      updateParams[`items[${itemIndex}][id]`] = String(existingId);
    updateParams[`items[${itemIndex}][price]`] = priceId;
    itemIndex += 1;
  }
  for (const item of items) {
    const priceId = (item.price as Record<string, unknown> | undefined)?.id;
    if (
      typeof item.id === "string" &&
      typeof priceId === "string" &&
      !desiredRecurring.includes(priceId)
    ) {
      updateParams[`items[${itemIndex}][id]`] = item.id;
      updateParams[`items[${itemIndex}][deleted]`] = "true";
      itemIndex += 1;
    }
  }
  if (
    !deferred &&
    options.hostedLandingPage &&
    !input.billing.serviceOptions.hostedLandingPage
  ) {
    const setupPrice =
      process.env.STRIPE_PRICE_HOSTED_LANDING_PAGE_SETUP?.trim();
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : (subscription.customer as Record<string, unknown> | undefined)?.id;
    if (!setupPrice || typeof customerId !== "string") {
      return { ok: false, reason: "hosted_setup_correlation_missing" };
    }
    const invoiceItem = await stripePost("invoiceitems", {
      customer: customerId,
      subscription: subscriptionId,
      price: setupPrice,
      "metadata[pendingTransitionId]": input.billing.pendingTransitionId ?? "",
    });
    if (!invoiceItem?.id)
      return { ok: false, reason: "hosted_setup_invoice_failed" };
  }
  const updated = await stripePost(
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    updateParams,
  );
  if (!updated || updated.id !== subscriptionId) {
    return { ok: false, reason: "stripe_subscription_update_failed" };
  }
  const updatedCorrelation = uniqueSubscriptionItemForPrice(
    updated,
    nextPriceId,
  );
  if (!updatedCorrelation) {
    return { ok: false, reason: "stripe_update_correlation_failed" };
  }
  return {
    ok: true,
    mode: deferred ? "downgrade_applied" : "upgrade_invoiced",
    subscriptionId,
    subscriptionItemId: updatedCorrelation.subscriptionItemId,
    priceId: updatedCorrelation.priceId,
  };
}

// Minimal DELETE call (subscription cancellation). Like stripePost, never
// surfaces Stripe's raw error text; logs server-side and returns null on failure.
async function stripeDelete(
  path: string,
): Promise<Record<string, unknown> | null> {
  if (!stripeConfigured()) return null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.trim()) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.error(
        `[billing] Stripe DELETE ${path} failed (${res.status}):`,
        body,
      );
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
export async function cancelStripeSubscription(
  subscriptionId: string,
): Promise<boolean> {
  if (!stripeConfigured() || !subscriptionId) return false;
  return !!(await stripeDelete(
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  ));
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
  opts?: {
    successPath?: string;
    cancelPath?: string;
    stripeCustomerId?: string;
  },
): Promise<string | null> {
  if (!stripeConfigured()) return null;
  const cents = Math.round(amountUsd * 100);
  if (!(cents > 0)) return null;
  const successPath = opts?.successPath ?? `/client/payments?topup=success`;
  const cancelPath = opts?.cancelPath ?? `/client/payments?topup=cancelled`;
  const amountStr = String(amountUsd);
  const params: Record<string, string> = {
    mode: "payment",
    client_reference_id: tenant.id,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `Account credit top-up ($${amountUsd.toFixed(2)})`,
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
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0 || separator === part.length - 1) return false;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) return false;
    if (key === "t") timestamps.push(value);
    if (key === "v1") signatures.push(value);
  }
  if (timestamps.length !== 1 || signatures.length === 0) return false;
  const t = timestamps[0]!;
  const timestamp = Number(t);
  if (!Number.isInteger(timestamp) || timestamp < 0) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  let matched = false;
  for (const signature of signatures) {
    const candidate = Buffer.from(signature, "utf8");
    if (
      candidate.length === expectedBuffer.length &&
      timingSafeEqual(expectedBuffer, candidate)
    ) {
      matched = true;
    }
  }
  return matched;
}
