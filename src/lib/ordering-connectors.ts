// Order Now connectors (Module 5 / Phase 6). Live guest checkout + Stripe Connect
// payouts sit behind ORDERING_LIVE and Stripe keys. Until then, checkout is
// simulated (orders mark paid immediately) so the full menu → cart → kitchen
// queue is testable with zero external accounts. Mirrors visualsLive() / adsLive().

import {
  liveIntegrationsAllowed,
  providerLiveFlagEnabled,
} from "@/lib/env";

export function orderingLive(): boolean {
  return providerLiveFlagEnabled(process.env.ORDERING_LIVE);
}

export function orderingStripeReady(): boolean {
  return (
    orderingLive() &&
    liveIntegrationsAllowed() &&
    Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  );
}
