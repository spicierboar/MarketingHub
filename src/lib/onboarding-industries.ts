// Industry + nature-of-business options for workspace onboarding ("Your details").
// Industry ids align with platform promo catalog; natures are signup-friendly subcategories.

import { PROMO_INDUSTRY_OPTIONS } from "@/lib/promo-catalog";
import type { BusinessType, PromoIndustry } from "@/lib/types";

export type OnboardingIndustryId = PromoIndustry;

/** Industry dropdown — same catalog as ready-made promos. */
export const ONBOARDING_INDUSTRIES: { id: OnboardingIndustryId; label: string }[] =
  PROMO_INDUSTRY_OPTIONS.map((o) => ({ id: o.id, label: o.label }));

/**
 * Nature-of-business subcategories keyed by industry id.
 * Stored as the human-readable label on `TenantOnboarding.natureOfBusiness`
 * / company `profile.natureOfBusiness`.
 */
export const NATURE_BY_INDUSTRY: Record<string, { id: string; label: string }[]> = {
  restaurant_cafe: [
    { id: "cafe", label: "Café / coffee shop" },
    { id: "restaurant", label: "Restaurant / dining" },
    { id: "bakery", label: "Bakery / patisserie" },
    { id: "bar_pub", label: "Bar / pub" },
    { id: "catering", label: "Catering" },
    { id: "other_food", label: "Other food & beverage" },
  ],
  retail: [
    { id: "grocery", label: "Grocery / supermarket" },
    { id: "specialty_retail", label: "Specialty retail store" },
    { id: "ecommerce", label: "Online / e-commerce" },
    { id: "wholesale", label: "Wholesale / trade supply" },
    { id: "import_export", label: "Import / export" },
    { id: "other_retail", label: "Other retail" },
  ],
  fast_food: [
    { id: "qsr", label: "Quick service / takeaway" },
    { id: "burger_chicken", label: "Burgers / fried chicken / pizza" },
    { id: "food_truck", label: "Food truck / pop-up" },
    { id: "other_qsr", label: "Other fast food" },
  ],
  hotel: [
    { id: "hotel", label: "Hotel / motel" },
    { id: "bnb", label: "B&B / guesthouse" },
    { id: "serviced_apartments", label: "Serviced apartments" },
    { id: "resort", label: "Resort / lodge" },
    { id: "other_accommodation", label: "Other accommodation" },
  ],
  fitness: [
    { id: "gym", label: "Gym / fitness centre" },
    { id: "personal_training", label: "Personal training" },
    { id: "yoga_pilates", label: "Yoga / pilates / wellness studio" },
    { id: "sports_club", label: "Sports club / recreation" },
    { id: "other_fitness", label: "Other fitness" },
  ],
  beauty_salon: [
    { id: "hair", label: "Hair salon / barber" },
    { id: "beauty", label: "Beauty / aesthetics" },
    { id: "nails", label: "Nails / spa" },
    { id: "other_beauty", label: "Other beauty & personal care" },
  ],
  professional: [
    { id: "health", label: "Health / allied health" },
    { id: "legal_accounting", label: "Legal / accounting" },
    { id: "consulting", label: "Consulting / advisory" },
    { id: "trades", label: "Trades / home services" },
    { id: "education", label: "Education / training" },
    { id: "other_professional", label: "Other professional services" },
  ],
  other: [
    { id: "nonprofit", label: "Not-for-profit / community" },
    { id: "manufacturing", label: "Manufacturing" },
    { id: "agriculture", label: "Agriculture / primary industry" },
    { id: "tech", label: "Technology / software" },
    { id: "general", label: "General business" },
  ],
};

export function naturesForIndustry(industryId: string | undefined | null): {
  id: string;
  label: string;
}[] {
  if (!industryId) return [];
  return NATURE_BY_INDUSTRY[industryId] ?? NATURE_BY_INDUSTRY.other ?? [];
}

export function isValidOnboardingIndustry(id: string): boolean {
  return ONBOARDING_INDUSTRIES.some((o) => o.id === id);
}

/** Resolve nature label from industry + nature id (or accept a free-form label). */
export function resolveNatureLabel(
  industryId: string,
  natureIdOrLabel: string,
): string | undefined {
  const trimmed = natureIdOrLabel.trim();
  if (!trimmed) return undefined;
  const list = naturesForIndustry(industryId);
  const byId = list.find((n) => n.id === trimmed);
  if (byId) return byId.label;
  const byLabel = list.find((n) => n.label === trimmed);
  if (byLabel) return byLabel.label;
  return trimmed;
}

/** Map onboarding industry → company `businessType` for templates. */
export function businessTypeFromOnboardingIndustry(
  industryId: string | undefined,
): BusinessType {
  switch (industryId) {
    case "restaurant_cafe":
    case "fast_food":
      return "restaurant_cafe";
    case "retail":
      return "retail";
    case "hotel":
      return "hotel";
    case "professional":
    case "fitness":
    case "beauty_salon":
      return "professional";
    default:
      return "other";
  }
}

export function industryLabel(industryId: string | undefined): string | undefined {
  if (!industryId) return undefined;
  return ONBOARDING_INDUSTRIES.find((o) => o.id === industryId)?.label ?? industryId;
}

/**
 * Best-effort map free-text industry / Places category → onboarding industry id.
 * Used after website scrape + Places enrichment.
 */
export function mapIndustryFromText(
  ...signals: Array<string | undefined | null>
): OnboardingIndustryId | undefined {
  const blob = signals
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob.trim()) return undefined;

  const rules: { id: OnboardingIndustryId; keys: string[] }[] = [
    {
      id: "restaurant_cafe",
      keys: ["cafe", "café", "coffee", "restaurant", "dining", "bistro", "bakery"],
    },
    {
      id: "fast_food",
      keys: ["fast food", "takeaway", "take-away", "qsr", "burger", "pizza", "fried chicken"],
    },
    {
      id: "hotel",
      keys: ["hotel", "motel", "accommodation", "lodging", "resort", "guesthouse", "b&b"],
    },
    {
      id: "retail",
      keys: ["retail", "shop", "store", "grocery", "supermarket", "ecommerce", "e-commerce"],
    },
    {
      id: "fitness",
      keys: ["gym", "fitness", "yoga", "pilates", "personal train"],
    },
    {
      id: "beauty_salon",
      keys: ["salon", "barber", "beauty", "spa", "nails", "hairdress"],
    },
    {
      id: "professional",
      keys: [
        "dentist",
        "lawyer",
        "solicitor",
        "accountant",
        "plumber",
        "electrician",
        "consult",
        "clinic",
        "physiotherap",
        "professional",
        "trade",
      ],
    },
  ];

  for (const rule of rules) {
    if (rule.keys.some((k) => blob.includes(k))) return rule.id;
  }
  return "other";
}

/** Pick closest nature id for an industry from free-text nature / category. */
export function mapNatureIdFromText(
  industryId: string,
  ...signals: Array<string | undefined | null>
): string | undefined {
  const list = naturesForIndustry(industryId);
  if (!list.length) return undefined;
  const blob = signals
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!blob.trim()) return list[list.length - 1]?.id;

  for (const n of list) {
    const labelBits = n.label.toLowerCase().split(/[^a-z0-9]+/);
    if (labelBits.some((b) => b.length > 3 && blob.includes(b))) return n.id;
    if (blob.includes(n.id.replace(/_/g, " "))) return n.id;
  }
  return list[0]?.id;
}
