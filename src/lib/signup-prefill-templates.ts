// Signup pre-fill bridge (V1 module 2) — suggestion-only defaults after scrape
// extract. Imports business-profiles only; never writes to DB or schedules posts.

import type { BusinessType } from "@/lib/types";
import {
  CAMPAIGN_GOALS,
  CONTENT_TEMPLATES,
  inferBusinessTypeFromIndustry,
  suggestSignupDefaults,
  type ContentTemplate,
  type SignupDefaults,
} from "@/lib/business-profiles";

export type { SignupDefaults };

/** Fields available from auto-onboarding scrape extract (subset). */
export interface ExtractedSignupFields {
  industry?: string;
  businessType?: BusinessType;
  targetCustomers?: string;
}

export interface SignupPrefillSuggestions {
  businessType: BusinessType;
  defaults: SignupDefaults;
  contentTemplates: ContentTemplate[];
  campaignGoals: string[];
  /** Scraped targetCustomers when present, otherwise the vertical audience blurb. */
  suggestedAudienceBlurb: string;
}

/** Resolve business type: explicit field wins, else deterministic industry inference. */
export function resolveSignupBusinessType(
  industry?: string,
  explicitBusinessType?: BusinessType,
): BusinessType {
  if (explicitBusinessType) return explicitBusinessType;
  return inferBusinessTypeFromIndustry(industry);
}

/**
 * Return template suggestions from extracted scrape fields — pure, no DB writes.
 * Call after scrape extract preview; UI/actions decide what to persist.
 */
export function signupPrefillFromExtract(
  fields: ExtractedSignupFields,
): SignupPrefillSuggestions {
  const businessType = resolveSignupBusinessType(
    fields.industry,
    fields.businessType,
  );
  const defaults = suggestSignupDefaults(businessType);
  return {
    businessType,
    defaults,
    contentTemplates: CONTENT_TEMPLATES[businessType],
    campaignGoals: CAMPAIGN_GOALS[businessType],
    suggestedAudienceBlurb:
      fields.targetCustomers?.trim() || defaults.audienceBlurb,
  };
}

/** Minimal shape for enriching extracted fields with inferred businessType. */
export interface EnrichableExtractedFields {
  industry?: string;
  businessType?: BusinessType;
}

/**
 * Infer businessType from industry when missing on extracted fields.
 * Safe one-liner for applyExtractedFields or UI actions — pure, no side effects.
 */
export function enrichExtractedWithBusinessType<
  T extends EnrichableExtractedFields,
>(fields: T): T & { businessType: BusinessType } {
  const businessType = resolveSignupBusinessType(
    fields.industry,
    fields.businessType,
  );
  if (fields.businessType === businessType) {
    return fields as T & { businessType: BusinessType };
  }
  return { ...fields, businessType };
}
