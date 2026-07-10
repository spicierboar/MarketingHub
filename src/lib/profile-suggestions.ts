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
}

function areaLabel(input: ProfileSuggestionInput): string {
  const fromAreas = (input.areas ?? []).map((a) => a.trim()).filter(Boolean);
  if (fromAreas.length) return fromAreas.slice(0, 2).join(" and ");
  if (input.postcode?.trim()) return `postcode ${input.postcode.trim()}`;
  return "the local area";
}

/** Plain-English defaults keyed by business type. */
export function suggestProfileFields(input: ProfileSuggestionInput): ProfileSuggestions {
  const area = areaLabel(input);
  const name = input.companyName?.trim() || "This business";
  const industry = input.industry?.trim();

  switch (input.businessType) {
    case "restaurant_cafe":
      return {
        natureOfBusiness: industry
          ? `${name} is a ${industry.toLowerCase()} serving locals and visitors in ${area}.`
          : `${name} is a restaurant / café serving food and drinks to locals and visitors in ${area}.`,
        targetCustomers: `Locals and visitors in ${area} looking for a meal out, takeaway, or a casual catch-up — families, couples, and weekday workers.`,
        brandVoice:
          "Warm, welcoming, and appetising — like a friendly host. Short sentences, sensory words (fresh, seasonal, local), never pushy or corporate.",
        localMarketNotes: `Focus on ${area}: weekday lunch, weekend brunch, and evening dining. Mention nearby landmarks only when accurate.`,
        callsToAction: ["Book a table", "Order online", "See the menu"],
        services: ["Dine-in", "Takeaway", "Catering enquiries"],
      };
    case "retail":
      return {
        natureOfBusiness: industry
          ? `${name} is a ${industry.toLowerCase()} retailer serving shoppers in ${area}.`
          : `${name} is a local retail store serving shoppers in ${area} with everyday and seasonal products.`,
        targetCustomers: `Households and busy locals in ${area} who want convenient shopping, weekly specials, and click & collect.`,
        brandVoice:
          "Helpful, clear, and neighbourly — like a trusted local shop. Lead with value and convenience; avoid hype and fake urgency.",
        localMarketNotes: `Trade area is ${area}. Highlight weekly specials, seasonal ranges, and easy pickup.`,
        callsToAction: ["Shop in store", "Click & collect", "See this week's specials"],
        services: ["In-store shopping", "Click & collect", "Local delivery"],
      };
    case "hotel":
      return {
        natureOfBusiness: industry
          ? `${name} is ${industry.toLowerCase()} accommodation in ${area}.`
          : `${name} offers accommodation and guest stays in ${area}.`,
        targetCustomers: `Leisure travellers, couples, and families visiting ${area}, plus midweek business and tradie stays.`,
        brandVoice:
          "Calm, hospitable, and reassuring — like a good concierge. Emphasise comfort and location; never invent star ratings or amenities.",
        localMarketNotes: `Guests choose ${area} for location and convenience. Promote direct booking benefits over OTAs when approved.`,
        callsToAction: ["Book direct", "Check availability", "View packages"],
        services: ["Rooms", "Packages", "Guest parking"],
      };
    case "professional":
      return {
        natureOfBusiness: industry
          ? `${name} provides ${industry.toLowerCase()} services to clients in ${area}.`
          : `${name} provides professional services to clients in ${area}.`,
        targetCustomers: `Local residents and families in ${area} who need trusted advice or care — including first-time and returning clients.`,
        brandVoice:
          "Calm, professional, and reassuring — never salesy about health, legal, or financial outcomes. Plain language; no unverified claims.",
        localMarketNotes: `Catchment is ${area}. Education content and reviews build trust more than hard sells.`,
        callsToAction: ["Book an appointment", "Enquire today", "Meet the team"],
        services: ["Consultations", "Follow-up care", "New client enquiries"],
      };
    default:
      return {
        natureOfBusiness: industry
          ? `${name} is a ${industry.toLowerCase()} business serving customers in ${area}.`
          : `${name} serves customers in ${area} with local products and services.`,
        targetCustomers: `People who live, work, or visit ${area} and need what ${name} offers.`,
        brandVoice:
          "Clear, friendly, and professional — sound like a real local business, not a corporate brochure.",
        localMarketNotes: `Primary market is ${area}. Keep claims factual and locally relevant.`,
        callsToAction: ["Get in touch", "Learn more", "Visit us"],
        services: ["Core services", "Enquiries"],
      };
  }
}

/** Field help copy shown under labels — answers “what is this?” */
export const PROFILE_FIELD_HELP = {
  natureOfBusiness:
    "One or two sentences: what you do, for whom, and where. Example: “A family café in Bondi serving breakfast and lunch.”",
  targetCustomers:
    "Who you want to attract — not everyone. Example: “Local families and weekday office workers within 10 minutes.”",
  brandVoice:
    "How posts and ads should sound. Describe tone in plain words (warm, calm, playful…) and what to avoid. Example: “Warm and neighbourly — never pushy or full of jargon.”",
  localMarketNotes:
    "Anything local that marketing should know — suburbs, seasons, events, competitors. Optional if service areas are filled.",
  serviceAreas:
    "Suburbs, towns, or postcodes you serve — one per line. Used to localise AI copy.",
  callsToAction:
    "Approved buttons/links for posts — one per line. Example: “Book a table”.",
} as const;

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
