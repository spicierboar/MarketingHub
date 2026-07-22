/**
 * ContentRecipe V1.1 — closed typed object for compose → cook.
 * @see docs/CONTENT-CREATE-TAXONOMY-DESIGN.md §§4–6, 10, 12
 */

/** V1 create-for axes (existing hub scopes). */
export const CREATE_FOR_IDS = ["client", "industry", "general"] as const;
export type CreateForId = (typeof CREATE_FOR_IDS)[number];

/**
 * V1 content types — subset of RequestType from design §10.
 * Excludes campaign / creative_request (not in cook map).
 */
export const CONTENT_TYPE_IDS = [
  "social_post",
  "blog_article",
  "email_newsletter",
  "website_copy",
  "landing_page",
  "ad_copy",
  "video_script",
  "brochure_copy",
  "faq",
  "seo_meta",
  "proposal",
] as const;
export type ContentTypeId = (typeof CONTENT_TYPE_IDS)[number];

/** Backlog-style category ids for V1 mapped types. */
export const CONTENT_CATEGORY_IDS = [
  "social",
  "editorial",
  "website",
  "landing",
  "email",
  "advertising",
  "video_audio",
  "sales",
  "support",
  "meta",
] as const;
export type ContentCategoryId = (typeof CONTENT_CATEGORY_IDS)[number];

/** Engine cook-module keys shipped in V1. */
export const COOK_FAMILY_IDS = [
  "short_social",
  "long_editorial",
  "web_page",
  "landing_conversion",
  "email",
  "ad",
  "script_av",
  "sales_doc",
  "support",
  "meta_seo",
] as const;
export type CookFamilyId = (typeof COOK_FAMILY_IDS)[number];

/**
 * Channel ids compatible with ManagedChannelKey / design §6.2.
 * V1 set = CONTENT_PLATFORM_OPTIONS ∩ family allow-lists (+ website_blog_cms, linkedin, youtube_shorts, aeo_geo).
 */
export const RECIPE_CHANNEL_IDS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube_shorts",
  "linkedin",
  "google_business_profile",
  "website_blog_cms",
  "email",
  "paid_media",
  "aeo_geo",
] as const;
export type RecipeChannelId = (typeof RECIPE_CHANNEL_IDS)[number];

/** V1 optimise-for (§10); aeo/geo/llmo are explicit; ai_discovery remains a bundle alias. */
export const OPTIMISE_FOR_IDS = [
  "engagement",
  "conversion",
  "seo",
  "trust",
  "ai_discovery",
  "aeo",
  "geo",
  "llmo",
] as const;
export type OptimiseForId = (typeof OPTIMISE_FOR_IDS)[number];

export const DISCOVERY_TARGET_IDS = [
  "organic_search",
  "ai_answers",
  "local_pack",
] as const;
export type DiscoveryTargetId = (typeof DISCOVERY_TARGET_IDS)[number];

export const AUDIENCE_TYPE_IDS = [
  "existing_customers",
  "prospective_customers",
  "local_public",
  "partners",
  "industry_professionals",
  "peers",
  "press",
  "practitioners",
  "marketers",
  "employees",
] as const;
export type AudienceTypeId = (typeof AUDIENCE_TYPE_IDS)[number];

export const AWARENESS_IDS = [
  "unaware",
  "problem_aware",
  "solution_aware",
  "product_aware",
  "most_aware",
] as const;
export type AwarenessId = (typeof AWARENESS_IDS)[number];

export const DECISION_ROLE_IDS = [
  "user",
  "influencer",
  "buyer",
  "approver",
] as const;
export type DecisionRoleId = (typeof DECISION_ROLE_IDS)[number];

export const FUNNEL_STAGE_IDS = [
  "awareness",
  "consideration",
  "purchase",
  "retention",
  "advocacy",
] as const;
export type FunnelStageId = (typeof FUNNEL_STAGE_IDS)[number];

export const OBJECTIVE_IDS = [
  "build_awareness",
  "educate",
  "generate_leads",
  "encourage_bookings",
  "drive_sales",
  "nurture",
  "retain",
  "referrals",
  "recruit_employees",
] as const;
export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

/** Aligns with DraftTone. */
export const TONE_IDS = [
  "brand_default",
  "friendly",
  "professional",
  "urgent",
  "short_punchy",
] as const;
export type ToneId = (typeof TONE_IDS)[number];

export const LENGTH_IDS = [
  "under_50",
  "words_50_100",
  "words_100_300",
  "words_300_600",
  "words_600_1000",
  "words_1000_1500",
  "words_1500_plus",
] as const;
export type LengthId = (typeof LENGTH_IDS)[number];

export const STRUCTURE_IDS = [
  "caption",
  "thread",
  "sections_hn",
  "hero_proof_cta",
  "subject_preview_body",
  "headline_desc_cta",
  "script_beats",
  "doc_sections",
  "qa_pairs",
  "meta_fields",
] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

export const COMPONENT_IDS = [
  "headline",
  "body",
  "cta",
  "hashtags",
  "subject_line",
  "preview_text",
  "meta_title",
  "meta_description",
  "proof_block",
  "disclaimer",
] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];

export const EVIDENCE_POLICY_IDS = [
  "no_sources",
  "brand_sources",
  "industry_sources",
  "citations_required",
] as const;
export type EvidencePolicyId = (typeof EVIDENCE_POLICY_IDS)[number];

export type RecipeSubject =
  | { kind: "client"; companyId: string }
  | { kind: "industry"; industryId: string }
  | { kind: "general" };

export interface BrandControlFlags {
  useBrandVoice: boolean;
  useApprovedClaimsOnly: boolean;
  useApprovedOffersOnly: boolean;
}

export interface ComplianceFlags {
  humanReviewRequired: boolean;
  performanceClaimsAllowed: boolean;
  customerNamedRequiresConsent: boolean;
}

export interface RestrictedFlags {
  noInventedStats: boolean;
  noMedicalAdvice: boolean;
  noGuaranteedResults: boolean;
}

export interface OutputOptions {
  mode: "single_draft" | "variants";
  variantCount?: number;
}

export interface RecipeAudience {
  type: AudienceTypeId;
  awareness?: AwarenessId;
  decisionRole?: DecisionRoleId;
}

/** Canonical V1.1 recipe — family is derived, never free-picked by UI. */
export interface ContentRecipe {
  schemaVersion: "1.1";
  createFor: CreateForId;
  subject: RecipeSubject;
  category: ContentCategoryId;
  contentType: ContentTypeId;
  family: CookFamilyId;
  channels: RecipeChannelId[];
  primaryChannel: RecipeChannelId;
  objective: ObjectiveId;
  audience: RecipeAudience;
  funnelStage: FunnelStageId;
  optimiseFor: OptimiseForId[];
  discoveryTargets?: DiscoveryTargetId[];
  tone: ToneId;
  length: LengthId;
  structure?: StructureId;
  requiredComponents: ComponentId[];
  evidence: EvidencePolicyId;
  brandControls: BrandControlFlags;
  compliance: ComplianceFlags;
  restricted: RestrictedFlags;
  output: OutputOptions;
  topic: string;
  notes?: string;
}

/** Partial input for progressive compose / derive. */
export type ContentRecipePartial = Partial<
  Omit<ContentRecipe, "schemaVersion" | "family">
> & {
  schemaVersion?: "1.1";
  family?: CookFamilyId;
};

/** Machine error codes (design §8.2). */
export type RecipeErrorCode =
  | "RECIPE_INCOMPATIBLE"
  | "CHANNEL_MISMATCH"
  | "FAMILY_UNSUPPORTED"
  | "COMPLIANCE_BLOCK"
  | "RECIPE_INVALID";

export interface RecipeIssue {
  code: RecipeErrorCode;
  path?: (string | number)[];
  message: string;
}

export interface RecipeValidationResult {
  ok: boolean;
  recipe?: ContentRecipe;
  issues: RecipeIssue[];
}
