/**
 * Client Extras catalogue — full taxonomy content types + discovery packs.
 * Data: client-order-catalogue-data.ts (generated from backlog).
 * Fulfilment: fulfil-menu-order.ts (recipe → draft → approvals).
 * @see docs/CONTENT-CREATE-TAXONOMY-DESIGN.md §15
 */

export {
  CLIENT_ORDER_CATEGORIES,
  CLIENT_ORDER_MENU,
  type ClientMenuCategoryId,
  type ClientMenuSku,
  type ClientMenuSkuId,
} from "@/lib/client-order-catalogue-data";

import {
  CLIENT_ORDER_CATEGORIES,
  CLIENT_ORDER_MENU,
  type ClientMenuSku,
  type ClientMenuSkuId,
} from "@/lib/client-order-catalogue-data";

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
  const opt =
    input.sku.optimiseFor?.length
      ? `optimise=${input.sku.optimiseFor.join(",")}`
      : undefined;
  const parts = [
    input.clientNotes?.trim(),
    "",
    "---",
    `Extras order (${formatMenuPriceFrom(input.sku.priceFromAud)} AUD).`,
    `Dish: ${input.sku.dishLabel}`,
    `Charge outside subscription package — Stripe checkout TBD; treat as special job.`,
    input.sku.marker,
    `recipe_hint: type=${input.sku.contentType} channel=${input.sku.primaryChannel} family=${input.sku.cookFamily}`,
    opt,
  ].filter((p) => p !== undefined && p !== "");
  return parts.join("\n").trim();
}
