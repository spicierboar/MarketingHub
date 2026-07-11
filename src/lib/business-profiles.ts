// Business-type profiles (V1 module 2): industry selector drives templates,
// recommended campaign goals, and AI context. Vertical fields live in
// company.profile jsonb — no separate tables.

import type {
  BusinessType,
  Company,
  CompanyProfile,
} from "@/lib/types";

/** Canonical business types — restaurant/café wedge extends, not replaces. */
export type { BusinessType };

export const BUSINESS_TYPES: {
  value: BusinessType;
  label: string;
  description: string;
}[] = [
  {
    value: "restaurant_cafe",
    label: "Restaurant / café",
    description: "Menus, service periods, dietary options — complements Order Now",
  },
  {
    value: "retail",
    label: "Retail",
    description: "Products, promotions, seasonal ranges — not full inventory",
  },
  {
    value: "hotel",
    label: "Hotel / accommodation",
    description: "Rooms, packages, amenities — not bookings or PMS",
  },
  {
    value: "professional",
    label: "Professional services",
    description: "Consulting, health, trades — service-led marketing",
  },
  {
    value: "other",
    label: "Other",
    description: "General business profile without vertical extras",
  },
];

/** Structured retail context (profile jsonb — not inventory). */
export interface RetailProfileFields {
  productCategories: string[];
  heroProducts: string[];
  promotions: string[];
  seasons: string[];
  pricePositioning?: string;
}

/** Structured hotel context (profile jsonb — not PMS). */
export interface HotelProfileFields {
  roomTypes: string[];
  packages: string[];
  amenities: string[];
  occupancyLanguage?: string;
  directBookingBenefits?: string;
}

/** Restaurant/café wedge — extends menus/ordering, does not replace them. */
export interface RestaurantProfileFields {
  cuisineStyle?: string;
  serviceModes: string[];
  dietaryOptions: string[];
  peakServicePeriods: string[];
}

export interface ContentTemplate {
  id: string;
  label: string;
  channel: string;
  brief: string;
}

const EMPTY_RETAIL: RetailProfileFields = {
  productCategories: [],
  heroProducts: [],
  promotions: [],
  seasons: [],
};

const EMPTY_HOTEL: HotelProfileFields = {
  roomTypes: [],
  packages: [],
  amenities: [],
};

const EMPTY_RESTAURANT: RestaurantProfileFields = {
  serviceModes: [],
  dietaryOptions: [],
  peakServicePeriods: [],
};

/** Onboarding suggestion defaults per business type — never auto-schedules or publishes. */
export interface SignupDefaults {
  contentPillars: string[];
  postingCadence: string;
  audienceBlurb: string;
  platformLabels: string[];
  seasonalHints: string[];
  /** Claim/regulatory caution one-liner where relevant; omitted for generic businesses. */
  regulatoryCaution?: string;
}

/** Deterministic keyword map from scraped or manual industry text → business type. */
export function inferBusinessTypeFromIndustry(industry?: string): BusinessType {
  const text = (industry ?? "").toLowerCase();
  if (
    /restaurant|cafe|café|food service|hospitality.*dining|bistro|bakery|dining|bar\b|pub\b/.test(
      text,
    )
  ) {
    return "restaurant_cafe";
  }
  if (/hotel|motel|accommodation|resort|lodging|bnb|bed.?and.?breakfast/.test(text)) {
    return "hotel";
  }
  if (
    /retail|supermarket|grocery|shop|store|convenience|boutique|florist|flowers|iga\b/.test(
      text,
    )
  ) {
    return "retail";
  }
  if (
    /dental|medical|legal|accounting|consulting|professional|clinic|physio|chiro|lawyer|solicitor/.test(
      text,
    )
  ) {
    return "professional";
  }
  return "other";
}

/** Suggestion-only onboarding defaults for a resolved business type. */
export function suggestSignupDefaults(businessType: BusinessType): SignupDefaults {
  return SIGNUP_DEFAULTS[businessType];
}

export const SIGNUP_DEFAULTS: Record<BusinessType, SignupDefaults> = {
  restaurant_cafe: {
    contentPillars: [
      "Menu highlights & chef specials",
      "Behind the kitchen",
      "Local dining & community",
      "Events, functions & seasonal menus",
    ],
    postingCadence:
      "3–4 social posts per week; 1 Google Business update fortnightly",
    audienceBlurb:
      "Locals, visitors, and food lovers in your service area who dine in, order takeaway, or book for occasions.",
    platformLabels: ["Instagram", "Facebook", "Google Business Profile", "TikTok"],
    seasonalHints: [
      "Mother's Day & Father's Day brunch",
      "Winter comfort menu",
      "Summer outdoor dining",
      "End-of-year functions",
    ],
    regulatoryCaution:
      "Never claim therapeutic health benefits from food; verify alcohol service and responsible-service wording with venue policies.",
  },
  retail: {
    contentPillars: [
      "Weekly specials & catalogue lines",
      "New arrivals & hero products",
      "Local convenience & community",
      "Seasonal ranges & gift ideas",
    ],
    postingCadence:
      "4–5 posts per week during catalogue weeks; 2–3 otherwise",
    audienceBlurb:
      "Households and locals who shop for groceries, gifts, and everyday essentials in your catchment.",
    platformLabels: ["Facebook", "Instagram", "Email", "Google Business Profile"],
    seasonalHints: [
      "Catalogue Wednesday",
      "Back to school",
      "Holiday gift guides",
      "End-of-financial-year clearance",
    ],
    regulatoryCaution:
      "Use only approved catalogue and pricing language — no unverified savings or competitor comparisons.",
  },
  hotel: {
    contentPillars: [
      "Direct booking benefits",
      "Room & package showcases",
      "Local experiences & itineraries",
      "Amenity & guest-experience highlights",
    ],
    postingCadence: "2–3 posts per week; 1 package email monthly",
    audienceBlurb:
      "Weekend visitors, business travellers, and families planning stays in your region.",
    platformLabels: ["Instagram", "Facebook", "Google Business Profile", "Email"],
    seasonalHints: [
      "School holidays",
      "Event & festival weekends",
      "Wine-region tourism peaks",
      "Midweek corporate rates",
    ],
    regulatoryCaution:
      "Use approved rate and availability language only — avoid guaranteeing specific room views or occupancy claims.",
  },
  professional: {
    contentPillars: [
      "Client education & FAQs",
      "Team expertise & credentials",
      "Service explainers",
      "Trust signals & community involvement",
    ],
    postingCadence:
      "2 posts per week; 1 educational email or newsletter monthly",
    audienceBlurb:
      "Local patients, clients, and families seeking trusted professional services in your area.",
    platformLabels: ["Facebook", "Google Business Profile", "LinkedIn", "Email"],
    seasonalHints: [
      "New-year health goals",
      "Tax-season reminders",
      "Winter wellness checks",
      "Back-to-school health",
    ],
    regulatoryCaution:
      "No medical, legal, or financial advice claims — educational content only with required disclaimers.",
  },
  other: {
    contentPillars: [
      "Local awareness",
      "Customer stories & community",
      "Offers & service updates",
      "Behind-the-scenes",
    ],
    postingCadence: "2–3 posts per week",
    audienceBlurb:
      "Locals and customers in your service area who benefit from what you offer.",
    platformLabels: ["Facebook", "Instagram", "Google Business Profile"],
    seasonalHints: ["Local events", "Holiday periods", "Seasonal offers"],
    regulatoryCaution:
      "Use only approved claims — never invent testimonials or guarantees.",
  },
};

/** Infer business type from explicit field or legacy industry string. */
export function resolveBusinessType(company: Company): BusinessType {
  const bt = company.profile.businessType;
  if (bt) return bt;
  return inferBusinessTypeFromIndustry(company.profile.industry);
}

export function normaliseVerticalProfile(
  profile: Partial<CompanyProfile>,
): CompanyProfile {
  const p = profile as CompanyProfile;
  return {
    ...p,
    serviceAreas: p.serviceAreas ?? [],
    services: p.services ?? [],
    callsToAction: p.callsToAction ?? [],
    prohibitedClaims: p.prohibitedClaims ?? [],
    approvedClaims: p.approvedClaims ?? [],
    requiredDisclaimers: p.requiredDisclaimers ?? [],
    retail: p.retail
      ? {
          ...EMPTY_RETAIL,
          ...p.retail,
          productCategories: p.retail.productCategories ?? [],
          heroProducts: p.retail.heroProducts ?? [],
          promotions: p.retail.promotions ?? [],
          seasons: p.retail.seasons ?? [],
        }
      : undefined,
    hotel: p.hotel
      ? {
          ...EMPTY_HOTEL,
          ...p.hotel,
          roomTypes: p.hotel.roomTypes ?? [],
          packages: p.hotel.packages ?? [],
          amenities: p.hotel.amenities ?? [],
        }
      : undefined,
    restaurant: p.restaurant
      ? {
          ...EMPTY_RESTAURANT,
          ...p.restaurant,
          serviceModes: p.restaurant.serviceModes ?? [],
          dietaryOptions: p.restaurant.dietaryOptions ?? [],
          peakServicePeriods: p.restaurant.peakServicePeriods ?? [],
        }
      : undefined,
  };
}

/** Recommended campaign objectives per business type. */
export const CAMPAIGN_GOALS: Record<BusinessType, string[]> = {
  restaurant_cafe: [
    "Fill weekday lunch tables",
    "Promote weekend brunch and special events",
    "Drive takeaway and delivery orders",
    "Launch a new seasonal menu",
    "Grow email list for loyalty offers",
  ],
  retail: [
    "Drive foot traffic for weekly catalogue specials",
    "Promote click & collect and local delivery",
    "Clear seasonal stock with a limited-time offer",
    "Launch a new product range",
    "Re-engage lapsed shoppers with a rewards push",
  ],
  hotel: [
    "Increase direct bookings and reduce OTA commission",
    "Fill midweek rooms with corporate and tradie rates",
    "Promote packages for wine-region weekenders",
    "Boost occupancy during school holidays",
    "Highlight pet-friendly and family room options",
  ],
  professional: [
    "Generate qualified enquiries for core services",
    "Promote a seasonal health check or consultation offer",
    "Build trust with patient/client education content",
    "Encourage Google reviews from recent clients",
    "Reactivate past clients with a check-in campaign",
  ],
  other: [
    "Increase local awareness",
    "Promote a current offer",
    "Drive enquiries from new customers",
    "Re-engage past customers",
    "Grow social following with useful tips",
  ],
};

export function recommendedCampaignGoals(company: Company): string[] {
  return CAMPAIGN_GOALS[resolveBusinessType(company)];
}

/** Content templates surfaced in onboarding — starting points, not auto-posts. */
export const CONTENT_TEMPLATES: Record<BusinessType, ContentTemplate[]> = {
  restaurant_cafe: [
    {
      id: "rc_special",
      label: "Chef's special spotlight",
      channel: "Instagram",
      brief: "Hero the dish, ingredients, and who it's perfect for — CTA to book or order.",
    },
    {
      id: "rc_hours",
      label: "Service hours reminder",
      channel: "Facebook",
      brief: "Peak-period hours + how to reserve or walk in.",
    },
    {
      id: "rc_dietary",
      label: "Dietary-friendly option",
      channel: "Google Business Profile",
      brief: "Highlight one inclusive menu choice with approved dietary wording.",
    },
  ],
  retail: [
    {
      id: "rt_catalogue",
      label: "Weekly specials carousel",
      channel: "Facebook",
      brief: "Top 3 catalogue lines with approved pricing language only.",
    },
    {
      id: "rt_season",
      label: "Seasonal range launch",
      channel: "Instagram",
      brief: "New season products tied to local weather or events.",
    },
    {
      id: "rt_collect",
      label: "Click & collect push",
      channel: "Email",
      brief: "Convenience angle for busy locals — link to order flow.",
    },
  ],
  hotel: [
    {
      id: "ht_direct",
      label: "Book direct save",
      channel: "Facebook",
      brief: "Direct-booking benefits vs OTAs — approved rate language only.",
    },
    {
      id: "ht_package",
      label: "Weekend package",
      channel: "Instagram",
      brief: "Room + experience package for wine-region or event weekends.",
    },
    {
      id: "ht_amenity",
      label: "Amenity highlight",
      channel: "Google Business Profile",
      brief: "Pet-friendly, parking, Wi-Fi — one amenity per post.",
    },
  ],
  professional: [
    {
      id: "pr_education",
      label: "Patient/client tip",
      channel: "Facebook",
      brief: "Educational post answering a common question — no medical/legal claims.",
    },
    {
      id: "pr_offer",
      label: "Seasonal check-up offer",
      channel: "Email",
      brief: "Approved offer wording with required disclaimers.",
    },
    {
      id: "pr_trust",
      label: "Team credentials",
      channel: "LinkedIn",
      brief: "Approved claims about experience and local service only.",
    },
  ],
  other: [
    {
      id: "ot_awareness",
      label: "Local awareness post",
      channel: "Facebook",
      brief: "Who you help, where you operate, one clear CTA.",
    },
    {
      id: "ot_offer",
      label: "Current offer reminder",
      channel: "Instagram",
      brief: "Approved offer with end date if applicable.",
    },
    {
      id: "ot_social_proof",
      label: "Community proof",
      channel: "Google Business Profile",
      brief: "Approved claims and local involvement — no invented testimonials.",
    },
  ],
};

export function contentTemplatesFor(company: Company): ContentTemplate[] {
  return CONTENT_TEMPLATES[resolveBusinessType(company)];
}

/** Vertical context block for AI drafting and campaign planning. */
export function buildBusinessProfileAiContext(company: Company): string {
  const type = resolveBusinessType(company);
  const meta = BUSINESS_TYPES.find((b) => b.value === type);
  const lines: string[] = [
    `Business type: ${meta?.label ?? type}`,
  ];

  const p = company.profile;

  if (type === "retail" && p.retail) {
    const r = p.retail;
    if (r.productCategories.length) {
      lines.push(`Product categories: ${r.productCategories.join(", ")}`);
    }
    if (r.heroProducts.length) {
      lines.push(`Hero products: ${r.heroProducts.join(", ")}`);
    }
    if (r.promotions.length) {
      lines.push(`Active promotions: ${r.promotions.join(" | ")}`);
    }
    if (r.seasons.length) {
      lines.push(`Seasonal focus: ${r.seasons.join(" | ")}`);
    }
    if (r.pricePositioning?.trim()) {
      lines.push(`Price positioning: ${r.pricePositioning.trim()}`);
    }
  }

  if (type === "hotel" && p.hotel) {
    const h = p.hotel;
    if (h.roomTypes.length) {
      lines.push(`Room types: ${h.roomTypes.join(", ")}`);
    }
    if (h.packages.length) {
      lines.push(`Packages: ${h.packages.join(" | ")}`);
    }
    if (h.amenities.length) {
      lines.push(`Amenities: ${h.amenities.join(", ")}`);
    }
    if (h.occupancyLanguage?.trim()) {
      lines.push(`Occupancy language (use this phrasing): ${h.occupancyLanguage.trim()}`);
    }
    if (h.directBookingBenefits?.trim()) {
      lines.push(`Direct booking benefits: ${h.directBookingBenefits.trim()}`);
    }
  }

  if (type === "restaurant_cafe" && p.restaurant) {
    const r = p.restaurant;
    if (r.cuisineStyle?.trim()) {
      lines.push(`Cuisine style: ${r.cuisineStyle.trim()}`);
    }
    if (r.serviceModes.length) {
      lines.push(`Service modes: ${r.serviceModes.join(", ")}`);
    }
    if (r.dietaryOptions.length) {
      lines.push(`Dietary options: ${r.dietaryOptions.join(", ")}`);
    }
    if (r.peakServicePeriods.length) {
      lines.push(`Peak service periods: ${r.peakServicePeriods.join(" | ")}`);
    }
  }

  const goals = recommendedCampaignGoals(company);
  if (goals.length) {
    lines.push(`Typical campaign goals for this business type: ${goals.slice(0, 3).join("; ")}`);
  }

  return lines.join("\n");
}

/** Parse line-oriented form fields into a string array. */
export function linesFromForm(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
