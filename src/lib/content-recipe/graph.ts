/**
 * Compatibility graph — hard allow maps (design §6, V1 §10).
 */

import type {
  AudienceTypeId,
  ComponentId,
  ContentCategoryId,
  ContentTypeId,
  CookFamilyId,
  CreateForId,
  FunnelStageId,
  LengthId,
  ObjectiveId,
  OptimiseForId,
  RecipeChannelId,
  StructureId,
} from "./types";
import {
  CONTENT_TYPE_IDS,
  COOK_FAMILY_IDS,
  CREATE_FOR_IDS,
  FUNNEL_STAGE_IDS,
  OBJECTIVE_IDS,
  OPTIMISE_FOR_IDS,
  RECIPE_CHANNEL_IDS,
} from "./types";

export const TYPE_TO_CATEGORY: Record<ContentTypeId, ContentCategoryId> = {
  social_post: "social",
  blog_article: "editorial",
  email_newsletter: "email",
  website_copy: "website",
  landing_page: "landing",
  ad_copy: "advertising",
  video_script: "video_audio",
  brochure_copy: "sales",
  faq: "support",
  seo_meta: "meta",
  proposal: "sales",
};

export const TYPE_TO_FAMILY: Record<ContentTypeId, CookFamilyId> = {
  social_post: "short_social",
  blog_article: "long_editorial",
  email_newsletter: "email",
  website_copy: "web_page",
  landing_page: "landing_conversion",
  ad_copy: "ad",
  video_script: "script_av",
  brochure_copy: "sales_doc",
  faq: "support",
  seo_meta: "meta_seo",
  proposal: "sales_doc",
};

/** Create for → allowed content types (§6.1 × V1 map). */
export const CREATE_FOR_TO_TYPES: Record<CreateForId, readonly ContentTypeId[]> =
  {
    client: [...CONTENT_TYPE_IDS],
    industry: [
      "social_post",
      "blog_article",
      "website_copy",
      "email_newsletter",
      "ad_copy",
      "video_script",
      "seo_meta",
      "faq",
    ],
    general: ["blog_article", "seo_meta", "faq", "website_copy"],
  };

/** Family → primary channels (§6.2), clipped to V1 RECIPE_CHANNEL_IDS. */
export const FAMILY_TO_CHANNELS: Record<
  CookFamilyId,
  readonly RecipeChannelId[]
> = {
  short_social: [
    "facebook",
    "instagram",
    "tiktok",
    "youtube_shorts",
    "linkedin",
    "google_business_profile",
  ],
  long_editorial: ["website_blog_cms", "linkedin", "email", "aeo_geo"],
  web_page: ["website_blog_cms", "aeo_geo", "google_business_profile"],
  landing_conversion: ["website_blog_cms", "paid_media", "aeo_geo"],
  email: ["email"],
  ad: [
    "paid_media",
    "facebook",
    "instagram",
    "linkedin",
    "tiktok",
    "youtube_shorts",
  ],
  script_av: ["tiktok", "instagram", "youtube_shorts"],
  sales_doc: ["website_blog_cms", "email", "linkedin"],
  support: ["website_blog_cms", "email", "aeo_geo"],
  meta_seo: ["website_blog_cms", "aeo_geo"],
};

/** Type → channels = family channels (V1: 1:1 type→family). */
export function channelsForType(type: ContentTypeId): readonly RecipeChannelId[] {
  return FAMILY_TO_CHANNELS[TYPE_TO_FAMILY[type]];
}

/** Families that may take SEO as optimise-for (§6.3). */
const SEO_FAMILIES: ReadonlySet<CookFamilyId> = new Set([
  "long_editorial",
  "web_page",
  "landing_conversion",
  "support",
  "meta_seo",
]);

const SEO_CHANNELS: ReadonlySet<RecipeChannelId> = new Set([
  "website_blog_cms",
  "aeo_geo",
]);

const CONVERSION_FAMILIES: ReadonlySet<CookFamilyId> = new Set([
  "landing_conversion",
  "ad",
  "email",
  "sales_doc",
]);

const TRUST_FAMILIES: ReadonlySet<CookFamilyId> = new Set([
  "long_editorial",
  "support",
  "web_page",
  "sales_doc",
]);

const ENGAGEMENT_FAMILIES: ReadonlySet<CookFamilyId> = new Set([
  "short_social",
  "script_av",
]);

const AI_DISCOVERY_FAMILIES: ReadonlySet<CookFamilyId> = new Set([
  "long_editorial",
  "web_page",
  "support",
  "meta_seo",
  "landing_conversion",
]);

/**
 * Type (+ optional channels) → allowed optimise-for values.
 * When channels omitted, returns the union allowed for the type's family.
 */
export function optimiseForForType(
  type: ContentTypeId,
  channels?: readonly RecipeChannelId[],
): OptimiseForId[] {
  const family = TYPE_TO_FAMILY[type];
  const out: OptimiseForId[] = [];

  if (ENGAGEMENT_FAMILIES.has(family)) out.push("engagement");
  if (CONVERSION_FAMILIES.has(family)) out.push("conversion");
  if (TRUST_FAMILIES.has(family)) out.push("trust");

  const channelOk =
    !channels ||
    channels.length === 0 ||
    channels.some((c) => SEO_CHANNELS.has(c));
  if (SEO_FAMILIES.has(family) && channelOk) out.push("seo");

  if (AI_DISCOVERY_FAMILIES.has(family) && channelOk) {
    out.push("ai_discovery", "aeo", "geo", "llmo");
  }

  // FAQ / answer-shaped: prefer discovery optimisers even without web channel listed yet
  if (type === "faq") {
    for (const o of ["ai_discovery", "aeo", "geo", "llmo"] as const) {
      if (!out.includes(o)) out.push(o);
    }
  }

  return [...new Set(out)];
}

export const CREATE_FOR_TO_AUDIENCES: Record<
  CreateForId,
  readonly AudienceTypeId[]
> = {
  client: [
    "existing_customers",
    "prospective_customers",
    "local_public",
    "partners",
  ],
  industry: ["industry_professionals", "peers", "press"],
  general: ["practitioners", "marketers", "peers"],
};

/** Soft lock: funnel → objectives (§6.5). */
export const FUNNEL_TO_OBJECTIVES: Record<
  FunnelStageId,
  readonly ObjectiveId[]
> = {
  awareness: ["build_awareness", "educate"],
  consideration: ["educate", "generate_leads", "encourage_bookings", "nurture"],
  purchase: ["drive_sales", "encourage_bookings", "generate_leads"],
  retention: ["retain", "nurture"],
  advocacy: ["referrals", "retain"],
};

export const FAMILY_DEFAULT_LENGTH: Record<CookFamilyId, LengthId> = {
  short_social: "under_50",
  long_editorial: "words_1000_1500",
  web_page: "words_600_1000",
  landing_conversion: "words_300_600",
  email: "words_100_300",
  ad: "under_50",
  script_av: "words_100_300",
  sales_doc: "words_600_1000",
  support: "words_100_300",
  meta_seo: "under_50",
};

/** Length band: default ± one notch (indices into LENGTH order). */
export const LENGTH_BAND: Record<CookFamilyId, readonly LengthId[]> = {
  short_social: ["under_50", "words_50_100", "words_100_300"],
  long_editorial: [
    "words_600_1000",
    "words_1000_1500",
    "words_1500_plus",
  ],
  web_page: ["words_300_600", "words_600_1000", "words_1000_1500"],
  landing_conversion: ["words_100_300", "words_300_600", "words_600_1000"],
  email: ["words_50_100", "words_100_300", "words_300_600"],
  ad: ["under_50", "words_50_100"],
  script_av: ["words_50_100", "words_100_300", "words_300_600"],
  sales_doc: ["words_300_600", "words_600_1000", "words_1000_1500"],
  support: ["words_50_100", "words_100_300", "words_300_600"],
  meta_seo: ["under_50", "words_50_100"],
};

export const FAMILY_DEFAULT_STRUCTURE: Partial<
  Record<CookFamilyId, StructureId>
> = {
  short_social: "caption",
  long_editorial: "sections_hn",
  web_page: "sections_hn",
  landing_conversion: "hero_proof_cta",
  email: "subject_preview_body",
  ad: "headline_desc_cta",
  script_av: "script_beats",
  sales_doc: "doc_sections",
  support: "qa_pairs",
  meta_seo: "meta_fields",
};

export const FAMILY_DEFAULT_COMPONENTS: Record<
  CookFamilyId,
  readonly ComponentId[]
> = {
  short_social: ["body", "cta", "hashtags"],
  long_editorial: ["headline", "body", "cta"],
  web_page: ["headline", "body", "cta"],
  landing_conversion: ["headline", "body", "proof_block", "cta"],
  email: ["subject_line", "preview_text", "body", "cta"],
  ad: ["headline", "body", "cta"],
  script_av: ["body", "cta"],
  sales_doc: ["headline", "body", "proof_block", "cta"],
  support: ["headline", "body"],
  meta_seo: ["meta_title", "meta_description"],
};

/** Primary-channel overrides for short social length defaults. */
export const CHANNEL_LENGTH_HINT: Partial<Record<RecipeChannelId, LengthId>> = {
  instagram: "under_50",
  tiktok: "under_50",
  youtube_shorts: "under_50",
  facebook: "words_50_100",
  linkedin: "words_100_300",
  google_business_profile: "words_50_100",
  email: "words_100_300",
  website_blog_cms: "words_1000_1500",
};

export function isKnownCreateFor(v: string): v is CreateForId {
  return (CREATE_FOR_IDS as readonly string[]).includes(v);
}

export function isKnownContentType(v: string): v is ContentTypeId {
  return (CONTENT_TYPE_IDS as readonly string[]).includes(v);
}

export function isKnownChannel(v: string): v is RecipeChannelId {
  return (RECIPE_CHANNEL_IDS as readonly string[]).includes(v);
}

export function isKnownFamily(v: string): v is CookFamilyId {
  return (COOK_FAMILY_IDS as readonly string[]).includes(v);
}

export function isKnownOptimise(v: string): v is OptimiseForId {
  return (OPTIMISE_FOR_IDS as readonly string[]).includes(v);
}

export function isKnownFunnel(v: string): v is FunnelStageId {
  return (FUNNEL_STAGE_IDS as readonly string[]).includes(v);
}

export function isKnownObjective(v: string): v is ObjectiveId {
  return (OBJECTIVE_IDS as readonly string[]).includes(v);
}

/** Type allowed for createFor? */
export function typeAllowedForCreateFor(
  createFor: CreateForId,
  type: ContentTypeId,
): boolean {
  return CREATE_FOR_TO_TYPES[createFor].includes(type);
}

/** Channel allowed for type? */
export function channelAllowedForType(
  type: ContentTypeId,
  channel: RecipeChannelId,
): boolean {
  return channelsForType(type).includes(channel);
}

/** Optimise allowed given type + channels? */
export function optimiseAllowed(
  type: ContentTypeId,
  optimise: OptimiseForId,
  channels?: readonly RecipeChannelId[],
): boolean {
  return optimiseForForType(type, channels).includes(optimise);
}
