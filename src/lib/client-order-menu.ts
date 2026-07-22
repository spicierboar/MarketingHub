/**
 * Client Extras catalogue — curated add-ons outside subscription packages.
 * Maps to recipe content types for agency + AI fulfilment.
 * @see docs/CONTENT-CREATE-TAXONOMY-DESIGN.md §15
 */

import type { ContentTypeId, RecipeChannelId } from "@/lib/content-recipe";
import type { RequestType } from "@/lib/types";

export type ClientMenuSkuId =
  | "press_release"
  | "launch_landing_page"
  | "instagram_reel_script"
  | "email_campaign_pack"
  | "local_seo_page";

export type ClientMenuSku = {
  id: ClientMenuSkuId;
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

/** Catalogue as shown on /client/order. */
export const CLIENT_ORDER_MENU: readonly ClientMenuSku[] = [
  {
    id: "press_release",
    title: "Press release",
    blurb: "Announce news to media.",
    priceFromAud: 249,
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:press_release",
  },
  {
    id: "launch_landing_page",
    title: "Launch landing page",
    blurb: "Campaign landing copy.",
    priceFromAud: 399,
    contentType: "landing_page",
    requestType: "landing_page",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:launch_landing_page",
  },
  {
    id: "instagram_reel_script",
    title: "Instagram Reel script",
    blurb: "Short-form video script.",
    priceFromAud: 129,
    contentType: "video_script",
    requestType: "video_script",
    primaryChannel: "instagram",
    marker: "menu_order:instagram_reel_script",
  },
  {
    id: "email_campaign_pack",
    title: "Email campaign pack",
    blurb: "Subject + body sequence.",
    priceFromAud: 199,
    contentType: "email_newsletter",
    requestType: "email_newsletter",
    primaryChannel: "email",
    marker: "menu_order:email_campaign_pack",
  },
  {
    id: "local_seo_page",
    title: "Local SEO page",
    blurb: "Location page copy.",
    priceFromAud: 179,
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    marker: "menu_order:local_seo_page",
  },
] as const;

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
