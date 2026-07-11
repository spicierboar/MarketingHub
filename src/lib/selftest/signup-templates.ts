// Self-tests for signup pre-fill templates (industry → business type bridge).

import {
  BUSINESS_TYPES,
  inferBusinessTypeFromIndustry,
  suggestSignupDefaults,
} from "@/lib/business-profiles";
import {
  enrichExtractedWithBusinessType,
  signupPrefillFromExtract,
} from "@/lib/signup-prefill-templates";
import type { BusinessType } from "@/lib/types";

export function checkInferBusinessTypeFromIndustry(): {
  ok: boolean;
  detail: string;
} {
  const cases: [string | undefined, BusinessType][] = [
    ["Cafe & restaurant", "restaurant_cafe"],
    ["Bakery and bistro", "restaurant_cafe"],
    ["IGA supermarket", "retail"],
    ["Health & dental clinic", "professional"],
    ["Boutique hotel resort", "hotel"],
    ["General contractor", "other"],
    [undefined, "other"],
    ["", "other"],
  ];
  const failed = cases.filter(
    ([industry, want]) => inferBusinessTypeFromIndustry(industry) !== want,
  );
  const ok = failed.length === 0;
  return {
    ok,
    detail: ok
      ? `mapped=${cases.length}`
      : `failed=${failed.map(([i, w]) => `${JSON.stringify(i)}→${w}`).join(", ")}`,
  };
}

export function checkSignupDefaultsCoverage(): { ok: boolean; detail: string } {
  const types = BUSINESS_TYPES.map((b) => b.value);
  const missing: string[] = [];
  for (const type of types) {
    const d = suggestSignupDefaults(type);
    if (
      d.contentPillars.length < 3 ||
      !d.postingCadence.trim() ||
      !d.audienceBlurb.trim() ||
      d.platformLabels.length < 2 ||
      d.defaultChannels.length < 2 ||
      d.seasonalHints.length < 2
    ) {
      missing.push(type);
    }
  }
  const restaurant = suggestSignupDefaults("restaurant_cafe");
  const hasRegulatory =
    !!restaurant.regulatoryCaution?.trim() &&
    /alcohol|food/i.test(restaurant.regulatoryCaution);
  const ok = missing.length === 0 && hasRegulatory;
  return {
    ok,
    detail: `types=${types.length} missing=${missing.length} restaurantRegulatory=${hasRegulatory}`,
  };
}

export function checkSignupPrefillFromExtract(): { ok: boolean; detail: string } {
  const withIndustry = signupPrefillFromExtract({
    industry: "Dental practice",
  });
  const withExplicit = signupPrefillFromExtract({
    industry: "Cafe",
    businessType: "hotel",
  });
  const withAudience = signupPrefillFromExtract({
    industry: "Retail shop",
    targetCustomers: "Busy parents in the CBD",
  });
  const enriched = enrichExtractedWithBusinessType({ industry: "Florist boutique" });

  const ok =
    withIndustry.businessType === "professional" &&
    withIndustry.contentTemplates.length >= 3 &&
    withIndustry.campaignGoals.length >= 3 &&
    withIndustry.defaults.contentPillars.length >= 3 &&
    withExplicit.businessType === "hotel" &&
    withAudience.suggestedAudienceBlurb === "Busy parents in the CBD" &&
    enriched.businessType === "retail";
  return {
    ok,
    detail: `industry=${withIndustry.businessType} explicit=${withExplicit.businessType} audience=${withAudience.suggestedAudienceBlurb.slice(0, 20)} enriched=${enriched.businessType}`,
  };
}
