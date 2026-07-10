// Loyalty provider connectors (W4 M37) — simulated when LOYALTY_LIVE is off.

export function loyaltyLive(): boolean {
  return process.env.LOYALTY_LIVE === "true";
}

export function loyaltyApiKey(): string | undefined {
  return process.env.LOYALTY_API_KEY?.trim() || undefined;
}

export function loyaltyConfigured(): boolean {
  return loyaltyLive() && !!loyaltyApiKey();
}

export interface LoyaltyDispatchResult {
  ok: boolean;
  detail: string;
  mode: "simulated" | "live";
}

export async function dispatchLoyaltyEvent(input: {
  companyId: string;
  event: "referral_completed" | "tier_upgrade" | "redemption";
  memberId: string;
}): Promise<LoyaltyDispatchResult> {
  if (!loyaltyConfigured()) {
    return {
      ok: true,
      detail: `simulated ${input.event} for ${input.memberId}`,
      mode: "simulated",
    };
  }
  return {
    ok: false,
    detail: "Live loyalty dispatch adapter pending",
    mode: "live",
  };
}
