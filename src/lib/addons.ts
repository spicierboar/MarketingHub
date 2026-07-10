// Add-on catalogue (Module 3 — payment-tier matrix redesign). PURE DATA (imports
// nothing but types) so the repo layer, the billing engine and the entitlement
// engine can all use it without an import cycle — the same shape as plans.ts.
//
// The tenant's base PLAN (plans.ts) is the subscription; ADD-ONS are per-client-
// company capabilities purchased on top of it. Each add-on maps to a Stripe
// Price (STRIPE_PRICE_ADDON_* env, resolved in billing.ts); the display prices
// here are what the demo shows without Stripe configured. Enabling an add-on for
// a company writes a CompanyEntitlement (src/lib/entitlements.ts); the deliverable
// modules gate on it with assertCompanyAddon().

import type { AddonId } from "@/lib/types";

export interface AddonDef {
  id: AddonId;
  name: string;
  priceAudMonthly: number;
  blurb: string;
  // Which client segment the add-on is aimed at (UI hint only — any company can
  // enable any add-on). Restaurants are the wedge for menus + Order-Now.
  segment?: "restaurant";
  // A human note about what the add-on includes (e.g. the free-menu allowance).
  // Enforcement of any allowance lands with the deliverable module that consumes
  // the entitlement (menus module counts the 2/year); this is the promise.
  includedNote?: string;
  icon: string; // emoji marker for the matrix UI
}

export const ADDONS: Record<AddonId, AddonDef> = {
  video: {
    id: "video",
    name: "AI video",
    priceAudMonthly: 79,
    blurb: "Short-form vertical video (Reels / TikTok / Shorts) auto-generated from photos, templates and a script.",
    icon: "🎬",
  },
  photo: {
    id: "photo",
    name: "Photo shoots",
    priceAudMonthly: 59,
    blurb: "Managed professional photo shoots — booking, upload to the asset library, rights-tagging and auto-scheduling.",
    icon: "📸",
  },
  menus: {
    id: "menus",
    name: "Designed menus",
    priceAudMonthly: 39,
    segment: "restaurant",
    includedNote: "Includes 2 professionally designed menus per year.",
    blurb: "Designed-menu deliverable for restaurants — two free redesigns a year, then per-menu.",
    icon: "📋",
  },
  order_button: {
    id: "order_button",
    name: "Order Now",
    priceAudMonthly: 99,
    segment: "restaurant",
    includedNote: "Direct online ordering — you keep the margin third-party apps take.",
    blurb: "Embeddable direct-ordering button (menu → cart → Stripe checkout paid to the restaurant), bypassing third-party commissions.",
    icon: "🛒",
  },
  bookings: {
    id: "bookings",
    name: "Bookings",
    priceAudMonthly: 79,
    segment: "restaurant",
    includedNote: "Table and room reservations — direct bookings without OTA commissions.",
    blurb: "Guest reservation requests for restaurant tables or hotel rooms with service periods, capacity limits, and a host queue.",
    icon: "📅",
  },
};

export const ADDON_ORDER: AddonId[] = ["video", "photo", "menus", "order_button", "bookings"];

// Total-safe lookup: an unknown/legacy add-on id returns undefined so callers
// fail closed (an entitlement for a retired add-on grants nothing).
export function addonFor(id: string | undefined): AddonDef | undefined {
  return id ? ADDONS[id as AddonId] : undefined;
}

// Is this id one of the currently-offered add-ons? (guards form input)
export function isAddonId(id: string | undefined): id is AddonId {
  return !!id && id in ADDONS;
}
