// Stripe Connect checkout for photographer marketplace bookings (Module 14).
// Mirrors ordering-stripe.ts — destination charge to photographer Connect account
// with application_fee_amount for the platform marketplace fee.

import { stripeConfigured } from "@/lib/billing";
import { photoMarketplaceStripeReady } from "@/lib/photo-marketplace";
import type { PhotoMarketplaceBooking, PhotographerProfile } from "@/lib/types";

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
      console.error(`[photo-marketplace] Stripe ${path} failed (${res.status}):`, body);
      return null;
    }
    return body;
  } catch (err) {
    console.error(`[photo-marketplace] Stripe ${path} request error:`, err);
    return null;
  }
}

export function stripePhotoMarketplaceConfigured(): boolean {
  return stripeConfigured();
}

export async function createMarketplaceCheckoutSession(
  booking: PhotoMarketplaceBooking,
  profile: PhotographerProfile,
  packageTitle: string,
  origin: string,
  tenantId: string,
): Promise<string | null> {
  if (!photoMarketplaceStripeReady() || !profile.stripeConnectAccountId) return null;

  const params: Record<string, string> = {
    mode: "payment",
    success_url: `${origin}/photographers?company=${booking.companyId}&booking=${booking.id}&paid=1`,
    cancel_url: `${origin}/photographers?company=${booking.companyId}&cancelled=1`,
    "metadata[kind]": "photo_marketplace",
    "metadata[bookingId]": booking.id,
    "metadata[companyId]": booking.companyId,
    "metadata[tenantId]": tenantId,
    "metadata[photographerId]": booking.photographerId,
    "payment_intent_data[metadata][kind]": "photo_marketplace",
    "payment_intent_data[metadata][bookingId]": booking.id,
    "payment_intent_data[transfer_data][destination]": profile.stripeConnectAccountId,
    "payment_intent_data[application_fee_amount]": String(booking.marketplaceFeeCents),
    "line_items[0][price_data][currency]": "aud",
    "line_items[0][price_data][unit_amount]": String(booking.totalCents),
    "line_items[0][price_data][product_data][name]": packageTitle.slice(0, 200),
    "line_items[0][quantity]": "1",
  };

  const session = await stripePost("checkout/sessions", params);
  return typeof session?.url === "string" ? session.url : null;
}
