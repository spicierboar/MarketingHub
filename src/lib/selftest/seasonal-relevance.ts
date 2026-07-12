// Self-tests: cultural / demographic seasonal prompt relevance.

import {
  companyRelevanceContext,
  isPromptRelevantToCompany,
  seasonalPromptsForMonth,
  type SeasonalPrompt,
} from "@/lib/calendar-intelligence";
import type { Company, CompanyProfile } from "@/lib/types";

function stubCompany(opts: {
  name: string;
  profile: Partial<CompanyProfile>;
}): Company {
  return {
    id: "co_seasonal_stub",
    tenantId: "tn_seasonal_stub",
    name: opts.name,
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "General",
      serviceAreas: ["Sydney"],
      services: [],
      callsToAction: ["Enquire"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      ...opts.profile,
    },
    documents: [],
  } as Company;
}

function hasDiwali(prompts: SeasonalPrompt[]): boolean {
  return prompts.some((p) => /diwali/i.test(p.title));
}

/** Restaurant / cafe should see Diwali in the Oct–Nov window. */
export function checkRestaurantSeesDiwali(): { ok: boolean; detail: string } {
  const restaurant = stubCompany({
    name: "Spice Kitchen",
    profile: {
      businessType: "restaurant_cafe",
      industry: "Indian restaurant",
      natureOfBusiness: "Casual dining restaurant",
      services: ["Dine-in", "Takeaway"],
      targetCustomers: "Local families and South Asian community",
    },
  });
  const ctx = companyRelevanceContext(restaurant);
  const nov = seasonalPromptsForMonth("2026-11", ctx, { relevantOnly: true });
  const oct = seasonalPromptsForMonth("2026-10", ctx, { relevantOnly: true });
  const sees = hasDiwali(nov) || hasDiwali(oct);
  const diwaliPrompt = [...nov, ...oct].find((p) => /diwali/i.test(p.title));
  const directOk = diwaliPrompt ? isPromptRelevantToCompany(diwaliPrompt, ctx) : false;
  return {
    ok: sees && directOk,
    detail: `seesDiwali=${sees} isRelevant=${directOk} industries=${ctx.industries.join("|")}`,
  };
}

/** Plumbing / trade professional must NOT get Diwali hard-sell prompts. */
export function checkTradieDoesNotSeeDiwali(): { ok: boolean; detail: string } {
  const tradie = stubCompany({
    name: "Reliable Plumbing Co",
    profile: {
      businessType: "professional",
      industry: "Plumbing",
      natureOfBusiness: "Residential and commercial plumbing trade",
      services: ["Blocked drains", "Hot water", "Emergency plumber call-outs"],
      targetCustomers: "Homeowners and property managers",
    },
  });
  const ctx = companyRelevanceContext(tradie);
  const nov = seasonalPromptsForMonth("2026-11", ctx, { relevantOnly: true });
  const oct = seasonalPromptsForMonth("2026-10", ctx, { relevantOnly: true });
  const sees = hasDiwali(nov) || hasDiwali(oct);

  // Even if present unfiltered, isPromptRelevantToCompany must reject.
  const raw = seasonalPromptsForMonth("2026-11", undefined);
  const diwali = raw.find((p) => /diwali/i.test(p.title));
  const relevant = diwali ? isPromptRelevantToCompany(diwali, ctx) : true;

  const storm = [...oct, ...nov].some((p) => /storm|wet season/i.test(p.title));
  return {
    ok: !sees && !relevant,
    detail: `seesDiwali=${sees} isRelevant=${relevant} stormPrep=${storm} industries=${ctx.industries.join("|")}`,
  };
}

export function checkSeasonalRelevanceSuite(): { ok: boolean; detail: string } {
  const a = checkRestaurantSeesDiwali();
  const b = checkTradieDoesNotSeeDiwali();
  return {
    ok: a.ok && b.ok,
    detail: `restaurant=[${a.detail}] tradie=[${b.detail}]`,
  };
}
