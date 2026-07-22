/**
 * Client Extras catalogue — curated add-ons outside subscription packages.
 * Organised by broad category for cascading pickers on /client/order.
 * Maps to recipe content types for agency + AI fulfilment.
 * @see docs/CONTENT-CREATE-TAXONOMY-DESIGN.md §15
 */

import type { ContentTypeId, RecipeChannelId } from "@/lib/content-recipe";
import type { RequestType } from "@/lib/types";

export type ClientMenuCategoryId =
  | "social"
  | "website_seo"
  | "email"
  | "advertising"
  | "video"
  | "editorial_pr"
  | "sales_print"
  | "support";

export type ClientMenuSkuId = string;

export type ClientMenuSku = {
  id: ClientMenuSkuId;
  categoryId: ClientMenuCategoryId;
  /** Plain-language name on Extras */
  title: string;
  /** One-line description */
  blurb: string;
  /** Display price floor in major units (AUD) */
  priceFromAud: number;
  /** Recipe / request mapping for fulfilment */
  contentType: ContentTypeId;
  requestType: RequestType;
  primaryChannel: RecipeChannelId;
  /** Stable marker embedded in MarketingRequest for agency detection */
  marker: string;
};

export const CLIENT_ORDER_CATEGORIES: readonly {
  id: ClientMenuCategoryId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "social",
    label: "Social media",
    blurb: "Posts and short-form copy for social channels",
  },
  {
    id: "website_seo",
    label: "Website & SEO",
    blurb: "Pages, meta, and location content for search",
  },
  {
    id: "email",
    label: "Email",
    blurb: "Newsletters and campaign sequences",
  },
  {
    id: "advertising",
    label: "Advertising",
    blurb: "Paid media copy for ads and promotions",
  },
  {
    id: "video",
    label: "Video & scripts",
    blurb: "Scripts for reels, shorts, and video ads",
  },
  {
    id: "editorial_pr",
    label: "PR & editorial",
    blurb: "Articles and announcements for press and blog",
  },
  {
    id: "sales_print",
    label: "Sales & print",
    blurb: "Brochures, proposals, and leave-behinds",
  },
  {
    id: "support",
    label: "Support content",
    blurb: "FAQs and help-centre style answers",
  },
] as const;

/** Full capability catalogue shown on /client/order. */
export const CLIENT_ORDER_MENU: readonly ClientMenuSku[] = [
  // Social
  {
    id: "social_post_pack",
    categoryId: "social",
    title: "Social post pack",
    blurb: "A set of channel-ready posts for your audience.",
    priceFromAud: 149,
    contentType: "social_post",
    requestType: "social_post",
    primaryChannel: "instagram",
    marker: "menu_order:social_post_pack",
  },
  {
    id: "linkedin_thought_leadership",
    categoryId: "social",
    title: "LinkedIn thought leadership",
    blurb: "Professional post for LinkedIn reach.",
    priceFromAud: 129,
    contentType: "social_post",
    requestType: "social_post",
    primaryChannel: "linkedin",
    marker: "menu_order:linkedin_thought_leadership",
  },
  {
    id: "google_business_update",
    categoryId: "social",
    title: "Google Business update",
    blurb: "Offer or news update for Google Business Profile.",
    priceFromAud: 99,
    contentType: "social_post",
    requestType: "social_post",
    primaryChannel: "google_business_profile",
    marker: "menu_order:google_business_update",
  },
  // Website & SEO
  {
    id: "launch_landing_page",
    categoryId: "website_seo",
    title: "Launch landing page",
    blurb: "Campaign landing copy built to convert.",
    priceFromAud: 399,
    contentType: "landing_page",
    requestType: "landing_page",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:launch_landing_page",
  },
  {
    id: "local_seo_page",
    categoryId: "website_seo",
    title: "Local SEO page",
    blurb: "Location or service-area page copy.",
    priceFromAud: 179,
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:local_seo_page",
  },
  {
    id: "website_page_refresh",
    categoryId: "website_seo",
    title: "Website page refresh",
    blurb: "Rewrite an existing page for clarity and conversion.",
    priceFromAud: 229,
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:website_page_refresh",
  },
  {
    id: "seo_meta_pack",
    categoryId: "website_seo",
    title: "SEO title & meta pack",
    blurb: "Titles, descriptions, and snippet-ready meta.",
    priceFromAud: 119,
    contentType: "seo_meta",
    requestType: "seo_meta",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:seo_meta_pack",
  },
  // Email
  {
    id: "email_campaign_pack",
    categoryId: "email",
    title: "Email campaign pack",
    blurb: "Subject lines and body sequence for a campaign.",
    priceFromAud: 199,
    contentType: "email_newsletter",
    requestType: "email_newsletter",
    primaryChannel: "email",
    marker: "menu_order:email_campaign_pack",
  },
  {
    id: "email_newsletter",
    categoryId: "email",
    title: "Newsletter edition",
    blurb: "One full newsletter with subject and body.",
    priceFromAud: 149,
    contentType: "email_newsletter",
    requestType: "email_newsletter",
    primaryChannel: "email",
    marker: "menu_order:email_newsletter",
  },
  // Advertising
  {
    id: "paid_social_ad_set",
    categoryId: "advertising",
    title: "Paid social ad set",
    blurb: "Primary text, headlines, and CTAs for ads.",
    priceFromAud: 179,
    contentType: "ad_copy",
    requestType: "ad_copy",
    primaryChannel: "paid_media",
    marker: "menu_order:paid_social_ad_set",
  },
  {
    id: "search_ad_copy",
    categoryId: "advertising",
    title: "Search ad copy",
    blurb: "Headlines and descriptions for search ads.",
    priceFromAud: 159,
    contentType: "ad_copy",
    requestType: "ad_copy",
    primaryChannel: "paid_media",
    marker: "menu_order:search_ad_copy",
  },
  // Video
  {
    id: "instagram_reel_script",
    categoryId: "video",
    title: "Instagram Reel script",
    blurb: "Short-form video script with hook and CTA.",
    priceFromAud: 129,
    contentType: "video_script",
    requestType: "video_script",
    primaryChannel: "instagram",
    marker: "menu_order:instagram_reel_script",
  },
  {
    id: "tiktok_script",
    categoryId: "video",
    title: "TikTok / Shorts script",
    blurb: "Script tailored for short-form video platforms.",
    priceFromAud: 129,
    contentType: "video_script",
    requestType: "video_script",
    primaryChannel: "tiktok",
    marker: "menu_order:tiktok_script",
  },
  {
    id: "youtube_shorts_script",
    categoryId: "video",
    title: "YouTube Shorts script",
    blurb: "Script for a YouTube Short with clear CTA.",
    priceFromAud: 139,
    contentType: "video_script",
    requestType: "video_script",
    primaryChannel: "youtube_shorts",
    marker: "menu_order:youtube_shorts_script",
  },
  // PR & editorial
  {
    id: "press_release",
    categoryId: "editorial_pr",
    title: "Press release",
    blurb: "Announce news to media and partners.",
    priceFromAud: 249,
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:press_release",
  },
  {
    id: "blog_article",
    categoryId: "editorial_pr",
    title: "Blog article",
    blurb: "Long-form article for your site or newsletter.",
    priceFromAud: 279,
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:blog_article",
  },
  // Sales & print
  {
    id: "brochure_copy",
    categoryId: "sales_print",
    title: "Brochure copy",
    blurb: "Print or PDF brochure wording.",
    priceFromAud: 249,
    contentType: "brochure_copy",
    requestType: "brochure_copy",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:brochure_copy",
  },
  {
    id: "proposal_document",
    categoryId: "sales_print",
    title: "Proposal document",
    blurb: "Client-facing proposal or pitch narrative.",
    priceFromAud: 349,
    contentType: "proposal",
    requestType: "proposal",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:proposal_document",
  },
  // Support
  {
    id: "faq_pack",
    categoryId: "support",
    title: "FAQ pack",
    blurb: "Answers to common customer questions.",
    priceFromAud: 149,
    contentType: "faq",
    requestType: "faq",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:faq_pack",
  },
] as const;

export function getClientMenuCategory(
  id: string,
): (typeof CLIENT_ORDER_CATEGORIES)[number] | undefined {
  return CLIENT_ORDER_CATEGORIES.find((c) => c.id === id);
}

export function skusForCategory(categoryId: string): ClientMenuSku[] {
  return CLIENT_ORDER_MENU.filter((s) => s.categoryId === categoryId);
}

export function getClientMenuSku(id: string): ClientMenuSku | undefined {
  return CLIENT_ORDER_MENU.find((s) => s.id === id);
}

export function formatMenuPriceFrom(aud: number): string {
  return `From $${aud}`;
}

/** Detect menu orders in Client asks / portal request lists. */
export function isMenuOrderRequest(notes?: string | null, offer?: string | null): boolean {
  const hay = `${notes ?? ""}\n${offer ?? ""}`;
  return /menu_order:[a-z0-9_]+/i.test(hay) || /extras order/i.test(hay) || /à la carte/i.test(hay);
}

export function parseMenuOrderSkuId(notes?: string | null): ClientMenuSkuId | undefined {
  const m = notes?.match(/menu_order:([a-z0-9_]+)/i);
  if (!m) return undefined;
  return getClientMenuSku(m[1])?.id;
}

export function buildMenuOrderNotes(input: {
  sku: ClientMenuSku;
  clientNotes?: string;
}): string {
  const parts = [
    input.clientNotes?.trim(),
    "",
    "---",
    `Extras order (${formatMenuPriceFrom(input.sku.priceFromAud)} AUD).`,
    `Charge outside subscription package — Stripe checkout TBD; treat as special job.`,
    input.sku.marker,
    `recipe_hint: type=${input.sku.contentType} channel=${input.sku.primaryChannel}`,
  ].filter((p) => p !== undefined);
  return parts.join("\n").trim();
}
