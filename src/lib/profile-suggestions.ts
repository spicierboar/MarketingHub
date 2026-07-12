// Deterministic profile suggestions from business type + local area.
// Used when fields are blank so owners aren't staring at jargon with no help.
// Claude can refine later; this is the always-on fallback (no API key required).

import type { BusinessType } from "@/lib/types";

export interface ProfileSuggestionInput {
  businessType: BusinessType;
  companyName?: string;
  industry?: string;
  /** Service areas or suburbs — first entry used as the local anchor */
  areas?: string[];
  postcode?: string;
}

export interface ProfileSuggestions {
  natureOfBusiness: string;
  targetCustomers: string;
  brandVoice: string;
  localMarketNotes: string;
  callsToAction: string[];
  services: string[];
  /** Retail / grocery catalogue categories — not services. */
  productCategories?: string[];
  /** Compliance starters — one line each; seed when fields are empty. */
  approvedClaims: string[];
  prohibitedClaims: string[];
  requiredDisclaimers: string[];
}

/** Industry-aware Brand Brain compliance starters (not scraped product claims). */
export function suggestComplianceFields(input: ProfileSuggestionInput): {
  approvedClaims: string[];
  prohibitedClaims: string[];
  requiredDisclaimers: string[];
} {
  const area = areaLabel(input);
  const industry = input.industry?.trim() ?? "";
  const grocery =
    /\b(grocery|supermarket|pantry|food\s*store)\b/i.test(industry) ||
    (/\bindian\b/i.test(industry) && /\b(grocery|supermarket|food|pantry)\b/i.test(industry));
  const indianGrocery =
    /\bindian\b/i.test(industry) &&
    /\b(grocery|supermarket|food|pantry)\b/i.test(industry);

  switch (input.businessType) {
    case "retail":
      return {
        approvedClaims: indianGrocery
          ? [
              "Authentic Indian grocery range for home cooks",
              "Delivery available across Australia (check coverage at checkout)",
              "Locally operated specialty retailer",
            ]
          : grocery
            ? [
                "Locally owned & operated",
                "Everyday groceries with specialty ranges",
                `Serving shoppers across ${area}`,
              ]
            : [
                "Quality products for local shoppers",
                `Serving customers in ${area}`,
                "Locally owned & operated",
              ],
        prohibitedClaims: grocery
          ? [
              "Unverified health or medical claims",
              "Cures / treats disease",
              "Cheapest in Australia (unless catalogue-proven)",
              "100% organic / chemical-free (unless certified on pack)",
              "Inaccurate country-of-origin claims",
            ]
          : [
              "Cheapest in Australia (unless proven)",
              "Guaranteed savings vs competitors",
              "Unverified quality or origin claims",
            ],
        requiredDisclaimers: grocery
          ? [
              "Prices and stock subject to change. Specials while stocks last.",
              "Product origin, ingredients, and allergen information as labelled on pack.",
              "Images are indicative; packaging may vary.",
            ]
          : [
              "Prices and availability subject to change. Specials while stocks last.",
              "Product details as described at point of sale.",
            ],
      };
    case "restaurant_cafe":
      return {
        approvedClaims: [
          "Freshly prepared food and drinks",
          `Welcoming locals and visitors in ${area}`,
          "Family-friendly dining",
        ],
        prohibitedClaims: [
          "#1 café / restaurant in town (unless independently verified)",
          "Best in Australia",
          "Guaranteed table without a booking",
        ],
        requiredDisclaimers: [
          "Menu items and prices subject to change.",
          "Please advise staff of allergies — traces may be present.",
        ],
      };
    case "hotel":
      return {
        approvedClaims: [
          "Book direct for flexible stays",
          `Convenient base for exploring ${area}`,
          "Comfortable rooms for leisure and midweek stays",
        ],
        prohibitedClaims: [
          "Guaranteed room view or floor (unless confirmed at booking)",
          "5-star / luxury (unless officially rated)",
          "Always available / never sold out",
        ],
        requiredDisclaimers: [
          "Rates subject to availability. Terms and conditions apply.",
          "Amenities and inclusions may vary by room type and date.",
        ],
      };
    case "professional":
      return {
        approvedClaims: [
          "Qualified, registered practitioners",
          "Appointments available where capacity allows",
          `Serving clients in ${area}`,
        ],
        prohibitedClaims: [
          "Guaranteed results / outcomes",
          "Painless / risk-free",
          "Cures [condition]",
          "Cheapest [profession] in town",
        ],
        requiredDisclaimers: [
          "General information only — not personal medical, legal, or financial advice.",
          "Individual results vary. Any procedure carries risks — discuss with your practitioner.",
        ],
      };
    default:
      return {
        approvedClaims: [
          `Serving customers in ${area}`,
          "Reliable local service",
          "Clear, factual marketing only",
        ],
        prohibitedClaims: [
          "Best in Australia",
          "Guaranteed outcomes",
          "No risk / risk-free",
          "Unverified testimonials or awards",
        ],
        requiredDisclaimers: [
          "Offers and claims subject to verification. Terms apply.",
          "Details correct at time of publication; may change without notice.",
        ],
      };
  }
}

function areaLabel(input: ProfileSuggestionInput): string {
  const fromAreas = (input.areas ?? []).map((a) => a.trim()).filter(Boolean);
  if (fromAreas.length) return fromAreas.slice(0, 2).join(" and ");
  if (input.postcode?.trim()) return `postcode ${input.postcode.trim()}`;
  return "the local area";
}

/** Avoid "retail retailer" / "cafe café" when industry already names the vertical. */
function industryNaturePhrase(
  industry: string | undefined,
  fallbackNoun: string,
): string {
  if (!industry?.trim()) return fallbackNoun;
  const ind = industry.trim().toLowerCase();
  if (/\b(retailer|store|shop|business|services?|practice|hotel|motel|cafe|café|restaurant|accommodation|import|distributor)\b/.test(ind)) {
    return ind;
  }
  if (ind === "retail" || ind === "retail and wholesale") {
    return "local retail or wholesale business";
  }
  if (/\bwholesale\b/.test(ind)) return ind;
  return `${ind} ${fallbackNoun}`;
}

/** Plain-English defaults keyed by business type. */
export function suggestProfileFields(input: ProfileSuggestionInput): ProfileSuggestions {
  const area = areaLabel(input);
  const name = input.companyName?.trim() || "This business";
  const industry = input.industry?.trim();
  const compliance = suggestComplianceFields(input);

  switch (input.businessType) {
    case "restaurant_cafe":
      return {
        natureOfBusiness: industry
          ? `${name} is a ${industryNaturePhrase(industry, "restaurant / café")} serving locals and visitors in ${area}.`
          : `${name} is a restaurant / café serving food and drinks to locals and visitors in ${area}.`,
        targetCustomers: `Locals and visitors in ${area} looking for a meal out, takeaway, or a casual catch-up — families, couples, and weekday workers.`,
        brandVoice:
          "Warm, welcoming, and appetising — like a friendly host. Short sentences, sensory words (fresh, seasonal, local), never pushy or corporate.",
        localMarketNotes: `Focus on ${area}: weekday lunch, weekend brunch, and evening dining. Mention nearby landmarks only when accurate.`,
        callsToAction: ["Book a table", "Order online", "See the menu"],
        services: ["Dine-in", "Takeaway", "Catering enquiries"],
        ...compliance,
      };
    case "retail": {
      const indianGrocery =
        /\bindian\b/i.test(industry ?? "") &&
        /\b(grocery|supermarket|food|pantry)\b/i.test(industry ?? "");
      const grocery =
        indianGrocery || /\b(grocery|supermarket)\b/i.test(industry ?? "");
      return {
        natureOfBusiness: indianGrocery
          ? `${name} is an online Indian grocery store delivering across ${area}.`
          : grocery
            ? `${name} is a grocery retailer serving shoppers across ${area}.`
            : industry
              ? `${name} is a ${industryNaturePhrase(industry, "retail or wholesale business")} serving customers in ${area}.`
              : `${name} is a local retail or wholesale business serving customers in ${area} with everyday and seasonal products.`,
        targetCustomers: indianGrocery
          ? `Indian diaspora households and shoppers seeking Indian groceries across ${area}.`
          : grocery
            ? `Households and busy locals across ${area} who want convenient grocery shopping and delivery.`
            : `Households, busy locals, and trade buyers in ${area} who want convenient shopping, weekly specials, or wholesale supply.`,
        brandVoice:
          "Helpful, clear, and neighbourly — like a trusted local shop. Lead with value and convenience; avoid hype and fake urgency.",
        localMarketNotes: grocery
          ? `Trade area is ${area}. Highlight specialty ranges, delivery coverage, and easy reorder.`
          : `Trade area is ${area}. Highlight weekly specials, seasonal ranges, easy pickup, and wholesale where relevant.`,
        callsToAction: grocery
          ? ["Shop online", "Order delivery", "Browse categories"]
          : ["Shop in store", "Click & collect", "See this week's specials"],
        services: grocery
          ? ["Online grocery", "National delivery", "Click & collect"]
          : ["In-store shopping", "Click & collect", "Local delivery"],
        productCategories: indianGrocery
          ? ["Rice", "Lentils & pulses", "Indian snacks", "Oils & ghee", "Ready-to-use gravies"]
          : grocery
            ? ["Fresh produce", "Pantry", "Dairy", "Frozen", "Household"]
            : ["Core range", "Seasonal", "Specialty"],
        ...compliance,
      };
    }
    case "hotel":
      return {
        natureOfBusiness: industry
          ? `${name} is ${industryNaturePhrase(industry, "accommodation")} in ${area}.`
          : `${name} offers accommodation and guest stays in ${area}.`,
        targetCustomers: `Leisure travellers, couples, and families visiting ${area}, plus midweek business and tradie stays.`,
        brandVoice:
          "Calm, hospitable, and reassuring — like a good concierge. Emphasise comfort and location; never invent star ratings or amenities.",
        localMarketNotes: `Guests choose ${area} for location and convenience. Promote direct booking benefits over OTAs when approved.`,
        callsToAction: ["Book direct", "Check availability", "View packages"],
        services: ["Rooms", "Packages", "Guest parking"],
        ...compliance,
      };
    case "professional":
      return {
        natureOfBusiness: industry
          ? `${name} provides ${industryNaturePhrase(industry, "services")} to clients in ${area}.`
          : `${name} provides professional services to clients in ${area}.`,
        targetCustomers: `Local residents and families in ${area} who need trusted advice or care — including first-time and returning clients.`,
        brandVoice:
          "Calm, professional, and reassuring — never salesy about health, legal, or financial outcomes. Plain language; no unverified claims.",
        localMarketNotes: `Catchment is ${area}. Education content and reviews build trust more than hard sells.`,
        callsToAction: ["Book an appointment", "Enquire today", "Meet the team"],
        services: ["Consultations", "Follow-up care", "New client enquiries"],
        ...compliance,
      };
    default: {
      const isTrade = /\b(import|wholesale|distributor|trade)\b/i.test(industry ?? "");
      return {
        natureOfBusiness: industry
          ? `${name} is a ${industryNaturePhrase(industry, "business")} serving customers in ${area}.`
          : `${name} serves customers in ${area} with local products and services.`,
        targetCustomers: isTrade
          ? `Independent retailers, hospitality buyers, and distributors in ${area}.`
          : `Local customers and businesses in ${area} looking for reliable products and service.`,
        brandVoice: isTrade
          ? "Clear, reliable, and trade-focused — never hype or consumer retail fluff."
          : "Clear, friendly, and professional — sound like a real local business, not a corporate brochure.",
        localMarketNotes: `Primary market is ${area}. Keep claims factual and locally relevant.`,
        callsToAction: isTrade
          ? ["Request a catalogue", "Enquire today", "Visit us"]
          : ["Get in touch", "Learn more", "Visit us"],
        services: isTrade
          ? ["Import sourcing", "Wholesale supply", "Trade enquiries"]
          : ["Core services", "Enquiries"],
        ...compliance,
      };
    }
  }
}

/** Field help copy shown under labels — answers “what is this?” (industry-neutral examples). */
export const PROFILE_FIELD_HELP = {
  natureOfBusiness:
    "One or two sentences: what they do, for whom, and where. Example: “Wholesale importer of specialty goods for retailers across Sydney.”",
  targetCustomers:
    "Who they want to attract — not everyone. Example: “Independent retailers and hospitality buyers in metro areas.”",
  brandVoice:
    "How posts and ads should sound. Describe tone in plain words (warm, calm, professional…) and what to avoid. Example: “Clear and reliable — never hype or jargon.”",
  localMarketNotes:
    "Anything local that marketing should know — suburbs, seasons, events, competitors. Optional if service areas are filled.",
  serviceAreas:
    "Suburbs, towns, or postcodes they serve — one per line. Used to localise AI copy.",
  services:
    "What they offer as services — delivery, click & collect, wholesale supply — one per line. Not product category lists (Rice, Snacks…); those belong under product categories for retail.",
  productCategories:
    "Store or catalogue categories — one per line. Example: Rice, Indian Snacks, Oils. Not the same as Services.",
  callsToAction:
    "Approved buttons/links for posts — one per line. Example: “Enquire today” or “Request a catalogue”.",
  approvedClaims:
    "Phrases marketing may use — one per line. Seed gives industry starters; replace with legal-cleared wording. Example: “Locally owned & operated”.",
  prohibitedClaims:
    "Phrases never to use — one per line. Example: “Cheapest in Australia” or “Cures disease”.",
  requiredDisclaimers:
    "Lines to append when offers or sensitive claims appear — one per line. Example: “Specials while stocks last. Terms apply.”",
} as const;

/** Placeholders keyed by business type — avoid café-only samples when type is unknown. */
export const PROFILE_FIELD_PLACEHOLDERS: Record<
  BusinessType,
  {
    natureOfBusiness: string;
    targetCustomers: string;
    brandVoice: string;
    services: string;
    callsToAction: string;
    productCategories?: string;
    approvedClaims: string;
    prohibitedClaims: string;
    requiredDisclaimers: string;
  }
> = {
  restaurant_cafe: {
    natureOfBusiness: "e.g. A family café in Bondi serving breakfast and lunch.",
    targetCustomers: "Local families and weekday workers",
    brandVoice: "Warm and neighbourly — never pushy",
    services: "Dine-in\nTakeaway\nCatering enquiries",
    callsToAction: "Book a table\nOrder online\nSee the menu",
    approvedClaims:
      "Freshly prepared food and drinks\nWelcoming locals and visitors\nFamily-friendly dining",
    prohibitedClaims:
      "#1 café in town (unless verified)\nBest in Australia\nGuaranteed table without booking",
    requiredDisclaimers:
      "Menu items and prices subject to change.\nPlease advise staff of allergies — traces may be present.",
  },
  retail: {
    natureOfBusiness:
      "e.g. Independent specialty retail or wholesale business serving customers in the inner west.",
    targetCustomers: "Households, busy locals, and trade buyers who want convenient shopping or supply",
    brandVoice: "Helpful and neighbourly — lead with value, avoid fake urgency",
    services: "In-store shopping\nClick & collect\nLocal delivery",
    productCategories: "Rice\nSnacks\nOils & ghee",
    callsToAction: "Shop in store\nClick & collect\nSee this week's specials",
    approvedClaims:
      "Locally owned & operated\nEveryday groceries with specialty ranges\nDelivery available (check coverage)",
    prohibitedClaims:
      "Unverified health or medical claims\nCures / treats disease\nCheapest in Australia\nInaccurate country-of-origin claims",
    requiredDisclaimers:
      "Prices and stock subject to change. Specials while stocks last.\nProduct origin and allergens as labelled on pack.",
  },
  hotel: {
    natureOfBusiness: "e.g. Boutique accommodation for leisure and midweek stays.",
    targetCustomers: "Leisure travellers, couples, and midweek business guests",
    brandVoice: "Calm and hospitable — never invent star ratings or amenities",
    services: "Rooms\nPackages\nGuest parking",
    callsToAction: "Book direct\nCheck availability\nView packages",
    approvedClaims:
      "Book direct for flexible stays\nConvenient location for visitors\nComfortable rooms for leisure and midweek stays",
    prohibitedClaims:
      "Guaranteed ocean view\n5-star (unless officially rated)\nAlways available",
    requiredDisclaimers:
      "Rates subject to availability. Terms and conditions apply.\nAmenities may vary by room type and date.",
  },
  professional: {
    natureOfBusiness: "e.g. Local professional practice serving families in the area.",
    targetCustomers: "Residents and families who need trusted advice or care",
    brandVoice: "Calm and professional — no unverified outcome claims",
    services: "Consultations\nFollow-up care\nNew client enquiries",
    callsToAction: "Book an appointment\nEnquire today\nMeet the team",
    approvedClaims:
      "Qualified, registered practitioners\nAppointments available where capacity allows",
    prohibitedClaims:
      "Guaranteed results\nPainless / risk-free\nCures [condition]\nCheapest in town",
    requiredDisclaimers:
      "General information only — not personal medical, legal, or financial advice.\nIndividual results vary.",
  },
  other: {
    natureOfBusiness:
      "e.g. Wholesale importer of specialty goods for retailers and hospitality.",
    targetCustomers: "Trade buyers, retailers, and distributors in metro areas",
    brandVoice: "Clear, reliable, and trade-focused — never hype",
    services: "Import sourcing\nWholesale supply\nTrade enquiries",
    callsToAction: "Request a catalogue\nEnquire today\nVisit us",
    approvedClaims:
      "Reliable local service\nServing customers in the local area\nClear, factual marketing only",
    prohibitedClaims:
      "Best in Australia\nGuaranteed outcomes\nNo risk / risk-free\nUnverified testimonials",
    requiredDisclaimers:
      "Offers and claims subject to verification. Terms apply.\nDetails correct at time of publication.",
  },
};

/** Shared help for request / campaign forms — plain English, not jargon. */
export const MARKETING_FIELD_HELP = {
  topic:
    "The one thing this piece is about — offer, event, or message. Example: “Winter lunch special for locals.”",
  objective:
    "What success looks like in one sentence. Example: “Fill weekday lunch tables” or “Get more Google reviews.”",
  targetAudience:
    "Who should see this — be specific. Example: “Office workers within 10 minutes at lunch.”",
  platform:
    "Where it will run (Facebook, Instagram, GBP, Email…). Leave blank if unsure — we’ll recommend.",
  offer:
    "Any discount or promo to mention. Leave blank if none — don’t invent one.",
  callToAction:
    "The button or next step. Example: “Book a table” or “Order online.”",
  campaignGoal:
    "Plain language goal — the AI turns this into a channel plan. Example: “More weekday customers.”",
  keyMessage:
    "The single idea every post should reinforce. Example: “Fresh local produce, no fuss.”",
} as const;
