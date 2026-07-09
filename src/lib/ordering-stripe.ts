// Stripe Connect + guest checkout for Order Now (Module 5). Env-gated via
// orderingStripeReady(); demo mode simulates Connect + payment locally.

import { stripeConfigured } from "@/lib/billing";
import { orderingStripeReady } from "@/lib/ordering-connectors";
import type { OrderingSettings, RestaurantOrder } from "@/lib/types";

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
      console.error(`[ordering] Stripe ${path} failed (${res.status}):`, body);
      return null;
    }
    return body;
  } catch (err) {
    console.error(`[ordering] Stripe ${path} request error:`, err);
    return null;
  }
}

// Express Connect account + onboarding link for a restaurant company.
export async function createConnectOnboarding(
  companyId: string,
  companyName: string,
  origin: string,
  existingAccountId?: string,
): Promise<{ accountId: string; url: string } | null> {
  if (!orderingStripeReady()) return null;
  let accountId = existingAccountId;
  if (!accountId) {
    const account = await stripePost("accounts", {
      type: "express",
      country: "AU",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "metadata[companyId]": companyId,
      "business_profile[name]": companyName.slice(0, 200),
    });
    accountId = typeof account?.id === "string" ? account.id : undefined;
    if (!accountId) return null;
  }
  const link = await stripePost("account_links", {
    account: accountId,
    refresh_url: `${origin}/ordering?company=${companyId}&connect=refresh`,
    return_url: `${origin}/ordering?company=${companyId}&connect=done`,
    type: "account_onboarding",
  });
  const url = typeof link?.url === "string" ? link.url : null;
  return url ? { accountId, url } : null;
}

// Guest Checkout — payment routes to the restaurant's Connect account.
export async function createOrderCheckoutSession(
  order: RestaurantOrder,
  settings: OrderingSettings,
  origin: string,
  tenantId: string,
): Promise<string | null> {
  if (!orderingStripeReady() || !settings.stripeConnectAccountId) return null;
  const params: Record<string, string> = {
    mode: "payment",
    success_url: `${origin}/order/${order.companyId}?confirmed=${order.id}`,
    cancel_url: `${origin}/order/${order.companyId}?cancelled=1`,
    customer_email: order.customerEmail,
    "metadata[kind]": "order",
    "metadata[orderId]": order.id,
    "metadata[companyId]": order.companyId,
    "metadata[tenantId]": tenantId,
    "payment_intent_data[metadata][kind]": "order",
    "payment_intent_data[metadata][orderId]": order.id,
    "payment_intent_data[metadata][companyId]": order.companyId,
    "payment_intent_data[metadata][tenantId]": tenantId,
    "payment_intent_data[transfer_data][destination]": settings.stripeConnectAccountId,
  };
  order.lines.forEach((line, i) => {
    params[`line_items[${i}][price_data][currency]`] = "aud";
    params[`line_items[${i}][price_data][unit_amount]`] = String(line.priceCents);
    params[`line_items[${i}][price_data][product_data][name]`] = line.name.slice(0, 200);
    params[`line_items[${i}][quantity]`] = String(line.quantity);
  });
  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}

export function canUseLiveOrderingCheckout(settings: OrderingSettings): boolean {
  return orderingStripeReady() && !!settings.stripeConnectAccountId && settings.connectStatus === "active";
}

export function stripeOrderingConfigured(): boolean {
  return stripeConfigured();
}
