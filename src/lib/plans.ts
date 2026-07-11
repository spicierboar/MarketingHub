// Plan definitions (SaaS T4). Pricing is PER CLIENT COMPANY (owner decision
// #4): a plan gates how many companies (agency clients ≙ owner's businesses) a
// tenant may manage. Seats are fair-use — no seat limits. AI is platform-billed
// and metered per tenant (decision #3): each plan includes a monthly AI
// allowance enforced as a hard cap on top of the tenant's own admin-set cap.
//
// This module is PURE DATA (imports nothing but types) so both the repo layer
// and the billing engine can use it without an import cycle. Display prices
// are placeholders — the live source of truth is the Stripe Price object
// (STRIPE_PRICE_* env); these figures are what the demo shows without keys.

import type { PlanId } from "@/lib/types";

// Per-plan rate limits (T7 hardening). These bound BURST usage — a complement
// to the monthly AI cost cap (aiIncludedUsd), which bounds TOTAL spend. Both are
// per tenant, so one customer can never exhaust another's allowance. Higher
// plans get roomier limits. Enforced in src/lib/ratelimit.ts.
export interface PlanLimits {
  aiPerMinute: number; // AI generations (draft/campaign/summary/…) per minute
  aiTokensPerMonth: number; // monthly token budget (input+output) — hard cap
}

export interface PlanDef {
  id: PlanId;
  name: string;
  priceAudMonthly: number;
  companyLimit: number | null; // null = unlimited
  aiIncludedUsd: number; // monthly AI allowance — hard cap for the plan
  automations: boolean; // Enterprise Automation engine (Phase 12)
  whiteLabel: boolean; // white-label branding + client approval links (T6)
  limits: PlanLimits; // T7 per-tenant burst limits
  blurb: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceAudMonthly: 49,
    companyLimit: 2,
    aiIncludedUsd: 25,
    automations: false,
    whiteLabel: false,
    limits: { aiPerMinute: 8, aiTokensPerMonth: 200_000 },
    blurb: "For a single business or a first client. Full governed pipeline.",
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceAudMonthly: 199,
    companyLimit: 10,
    aiIncludedUsd: 100,
    automations: true,
    whiteLabel: true,
    limits: { aiPerMinute: 20, aiTokensPerMonth: 800_000 },
    blurb: "For agencies and multi-business owners. Automation + white-label.",
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceAudMonthly: 499,
    companyLimit: null,
    aiIncludedUsd: 250,
    automations: true,
    whiteLabel: true,
    limits: { aiPerMinute: 40, aiTokensPerMonth: 2_000_000 },
    blurb: "Unlimited clients, highest AI allowance, priority support.",
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "agency", "scale"];

// Total-safe lookup: an unknown/legacy plan id behaves as the smallest plan
// (fail-closed on limits rather than fail-open).
export function planFor(plan: string | undefined): PlanDef {
  return PLANS[plan as PlanId] ?? PLANS.starter;
}
