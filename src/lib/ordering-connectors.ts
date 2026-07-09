// Order Now connectors (Module 5 / Phase 6). Live guest checkout + Stripe Connect
// payouts sit behind ORDERING_LIVE and Stripe keys. Until then, checkout is
// simulated (orders mark paid immediately) so the full menu → cart → kitchen
// queue is testable with zero external accounts. Mirrors visualsLive() / adsLive().

import { stripeConfigured } from "@/lib/billing";

export function orderingLive(): boolean {
  return process.env.ORDERING_LIVE === "true";
}

export function orderingStripeReady(): boolean {
  return orderingLive() && stripeConfigured();
}
