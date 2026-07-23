/**
 * Staging retail fixture packs — IGA and General Retail.
 * Parallel to staging-agency restaurants; separate tenants + fixture keys
 * so restaurant seed counts stay untouched.
 */

import type {
  AdBudget,
  Asset,
  Company,
  CompanyAccess,
  CompanyProfile,
  Tenant,
  TenantMember,
  User,
} from "@/lib/types";
import {
  STAGING_FIXTURE_TIMESTAMP,
  stagingFixtureAuthMetadata,
  type SimulatedConnectorState,
  type StagingFixtureRole,
  type StagingServiceTier,
} from "@/lib/fixtures/staging-agency";

export type StagingRetailVertical = "iga" | "general";

export type StagingRetailFixtureKey =
  | "staging-iga-retail-v1"
  | "staging-general-retail-v1";

export interface StagingRetailMetadata {
  fixtureKey: string;
  testOnly: true;
  vertical: StagingRetailVertical;
  city: string;
  suburb: string;
  timezone: string;
  serviceTier: StagingServiceTier;
  addons: Array<"Search Visibility">;
  identifiers: {
    domain: string;
    abnLike: string;
    notice: "TEST ONLY — not a registered business identifier";
  };
  goals: string[];
  heroProducts: string[];
  serviceDetails: string[];
  monthlyAdCapAud: number;
  connectors: SimulatedConnectorState[];
}

export interface StagingRetailProfile extends CompanyProfile {
  stagingFixture: StagingRetailMetadata;
}

export interface StagingRetailCompany extends Omit<Company, "profile"> {
  profile: StagingRetailProfile;
}

export interface StagingRetailFixtureUser extends User {
  fixtureKey: string;
  fixtureRole: StagingFixtureRole;
}

export interface StagingRetailFixture {
  fixtureKey: StagingRetailFixtureKey;
  vertical: StagingRetailVertical;
  tenant: Tenant;
  users: StagingRetailFixtureUser[];
  memberships: TenantMember[];
  companies: StagingRetailCompany[];
  access: CompanyAccess[];
  assets: Asset[];
  adBudgets: AdBudget[];
  sideEffects: {
    realEmails: false;
    billing: false;
    livePublishing: false;
    liveConnectors: false;
  };
}

export type RetailStoreDefinition = {
  slug: string;
  name: string;
  city: string;
  suburb: string;
  state: string;
  postcode: string;
  timezone: string;
  tier: StagingServiceTier;
  hours: string;
  goals: string[];
  voice: string;
  nature: string;
  services: string[];
  productCategories: string[];
  heroProducts: string[];
  promotions: string[];
  seasons: string[];
  pricePositioning: string;
  adCapAud: number;
  searchVisibility?: true;
  approverName: string;
};

type RetailPackConfig = {
  fixtureKey: StagingRetailFixtureKey;
  vertical: StagingRetailVertical;
  tenantId: string;
  tenantName: string;
  industry: string;
  /** UUID group prefix digit (2 = IGA, 3 = general) → 5f{n}100… */
  uuidFamily: "2" | "3";
  stores: readonly RetailStoreDefinition[];
};

function stableUuid(
  family: "2" | "3",
  group: "company" | "approver" | "asset-client" | "asset-ai",
  index: number,
) {
  const groupCode = {
    company: `${family}100`,
    approver: `${family}200`,
    "asset-client": `${family}300`,
    "asset-ai": `${family}400`,
  }[group];
  return `5f${groupCode}00-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function operatorIds(family: "2" | "3") {
  return {
    adminId: `5f${family}50000-0000-4000-8000-000000000001`,
    staffIds: [
      `5f${family}50000-0000-4000-8000-000000000002`,
      `5f${family}50000-0000-4000-8000-000000000003`,
    ] as const,
  };
}

function fixtureConnectors(index: number): SimulatedConnectorState[] {
  return [
    {
      mode: "simulated",
      platform: "Google Business Profile",
      status: index % 3 === 0 ? "not_connected" : "connected",
      externalAccountRef: `TEST-ONLY-GBP-R${String(index + 1).padStart(3, "0")}`,
      liveOperationsAllowed: false,
    },
    {
      mode: "simulated",
      platform: "Instagram",
      status: index % 4 === 0 ? "not_connected" : "connected",
      externalAccountRef: `TEST-ONLY-IG-R${String(index + 1).padStart(3, "0")}`,
      liveOperationsAllowed: false,
    },
    {
      mode: "simulated",
      platform: index % 2 === 0 ? "Meta Ads" : "Google Ads",
      status: "not_connected",
      externalAccountRef: `TEST-ONLY-ADS-R${String(index + 1).padStart(3, "0")}`,
      liveOperationsAllowed: false,
    },
  ];
}

function serviceMapping(tier: StagingServiceTier) {
  if (tier === "Starter") {
    return { marketingPackageId: "starter" as const, serviceLevel: "managed_exceptions" as const };
  }
  if (tier === "Growth") {
    return { marketingPackageId: "growth" as const, serviceLevel: "managed_exceptions" as const };
  }
  return { marketingPackageId: "managed" as const, serviceLevel: "fully_managed" as const };
}

const STAFF_DISPLAY_NAMES = ["Jordan Chen", "Sam Okonkwo"] as const;

/** Approver display names for retail packs (merged into stagingFixtureDisplayName). */
export const STAGING_RETAIL_APPROVER_NAMES: Readonly<Record<string, string>> = {
  "millbrook-iga": "Priya Sharma",
  "westgate-iga-xpress": "Marco Bellini",
  "harbour-iga": "Tom Nguyen",
  "ridgeway-iga": "Elena Vasquez",
  "cedar-homeware": "Hannah Cole",
  "lantern-gifts": "Owen Fraser",
  "coast-outfitters": "Mia Tran",
  "market-pantry": "Ben Wallace",
};

export const IGA_RETAIL_STORES: readonly RetailStoreDefinition[] = [
  {
    slug: "millbrook-iga",
    name: "Millbrook IGA",
    city: "Sydney",
    suburb: "Millbrook",
    state: "NSW",
    postcode: "2153",
    timezone: "Australia/Sydney",
    tier: "Growth",
    hours: "Mon–Sun 7:00am–9:00pm",
    goals: ["Grow click & collect orders", "Promote weekly catalogue specials locally"],
    voice: "Friendly, community-first, proudly local. Plain everyday language.",
    nature:
      "Full-service independent IGA supermarket: fresh produce, butcher, bakery, deli, weekly catalogue, click & collect and local delivery.",
    services: [
      "Weekly catalogue specials",
      "Fresh produce & butcher",
      "Bakery & deli",
      "Click & collect",
      "Local home delivery",
    ],
    productCategories: ["Fresh produce", "Butcher & deli", "Bakery", "Pantry & grocery", "Ready meals"],
    heroProducts: ["In-store baked sourdough", "Local grass-fed mince", "Weekly fruit & veg box"],
    promotions: ["$10 off first click & collect over $100", "Community rewards — 1% to local schools"],
    seasons: ["Winter: soup veg and slow-cooking cuts", "Summer: BBQ and salads", "Back-to-school lunchbox"],
    pricePositioning: "Community value and freshness — catalogue-confirmed specials only; never cheapest-in-town.",
    adCapAud: 1200,
    searchVisibility: true,
    approverName: "Priya Sharma",
  },
  {
    slug: "westgate-iga-xpress",
    name: "Westgate IGA Xpress",
    city: "Melbourne",
    suburb: "Westgate",
    state: "VIC",
    postcode: "3000",
    timezone: "Australia/Melbourne",
    tier: "Starter",
    hours: "Mon–Fri 6:00am–11:00pm; Sat–Sun 7:00am–11:00pm",
    goals: ["Drive after-work grab-and-go traffic", "Grow coffee + lunch combo sales"],
    voice: "Fast, helpful and neighbourhood-minded — convenience without corporate fluff.",
    nature:
      "Small-format IGA Xpress near the station: grab-and-go meals, barista coffee, essentials and top-up groceries with extended hours.",
    services: ["Grab-and-go meals", "Barista coffee", "Essentials", "Extended hours"],
    productCategories: ["Ready meals", "Coffee & drinks", "Snacks", "Essentials", "Dairy"],
    heroProducts: ["Station lunch packs", "House coffee", "Late-night essentials"],
    promotions: ["Coffee + pastry combo", "Commuter meal deal Tue–Thu"],
    seasons: ["Winter: hot drinks and pies", "Summer: cold drinks and salads"],
    pricePositioning: "Convenient value for commuters — no price-match claims.",
    adCapAud: 700,
    approverName: "Marco Bellini",
  },
  {
    slug: "harbour-iga",
    name: "Harbour IGA",
    city: "Brisbane",
    suburb: "Harbour Side",
    state: "QLD",
    postcode: "4000",
    timezone: "Australia/Brisbane",
    tier: "Growth",
    hours: "Mon–Sat 7:00am–8:00pm; Sun 8:00am–7:00pm",
    goals: ["Highlight local seafood and produce", "Increase weekend family shop visits"],
    voice: "Warm coastal community tone — fresh, clear, never exaggerated.",
    nature:
      "Independent harbour-side IGA with strong fresh counters, local suppliers and weekend catalogue promotions.",
    services: ["Fresh counters", "Weekly catalogue", "Click & collect", "Community rewards"],
    productCategories: ["Seafood", "Produce", "Butcher", "Bakery", "Pantry"],
    heroProducts: ["Local prawns (when in season)", "Harbour bakery rolls", "Weekend produce packs"],
    promotions: ["Weekend fresh specials", "Family roast pack"],
    seasons: ["Summer: seafood BBQs", "Winter: soup and roast trays"],
    pricePositioning: "Local freshness first; specials only when catalogue-confirmed.",
    adCapAud: 1100,
    approverName: "Tom Nguyen",
  },
  {
    slug: "ridgeway-iga",
    name: "Ridgeway IGA",
    city: "Perth",
    suburb: "Ridgeway",
    state: "WA",
    postcode: "6008",
    timezone: "Australia/Perth",
    tier: "Managed",
    hours: "Mon–Sun 7:00am–9:00pm",
    goals: ["Run always-on local content", "Grow delivery and click & collect"],
    voice: "Neighbourly, practical and proud of local suppliers.",
    nature:
      "Full-service IGA serving Ridgeway families with fresh departments, delivery and a busy weekly catalogue.",
    services: ["Delivery", "Click & collect", "Fresh departments", "Weekly catalogue"],
    productCategories: ["Produce", "Meat", "Bakery", "Grocery", "Household"],
    heroProducts: ["Local egg packs", "Weeknight meal kits", "Bakery loaves"],
    promotions: ["Free delivery over $120", "Midweek meal kit"],
    seasons: ["Back-to-school", "BBQ summer", "Winter comfort meals"],
    pricePositioning: "Reliable weekly value — no unverified half-price claims.",
    adCapAud: 2000,
    searchVisibility: true,
    approverName: "Elena Vasquez",
  },
];

export const GENERAL_RETAIL_STORES: readonly RetailStoreDefinition[] = [
  {
    slug: "cedar-homeware",
    name: "Cedar & Co Homeware",
    city: "Sydney",
    suburb: "Newtown",
    state: "NSW",
    postcode: "2042",
    timezone: "Australia/Sydney",
    tier: "Growth",
    hours: "Mon–Sat 10:00am–6:00pm; Sun 11:00am–4:00pm",
    goals: ["Grow gift and seasonal homeware sales", "Drive in-store workshop attendance"],
    voice: "Calm, tactile and design-aware — descriptive without hype.",
    nature:
      "Independent homeware boutique selling kitchen, tableware and small furniture with seasonal gift edits.",
    services: ["In-store shopping", "Gift wrapping", "Click & collect", "Seasonal workshops"],
    productCategories: ["Kitchen", "Tableware", "Home fragrance", "Small furniture", "Gifts"],
    heroProducts: ["Cedar serving boards", "Linen napkin sets", "Seasonal candle edit"],
    promotions: ["Complimentary gift wrap weekends", "Workshop early-bird"],
    seasons: ["Mother's Day gifts", "Christmas tablescape", "Spring refresh"],
    pricePositioning: "Thoughtful quality gifts — no discount-warehouse framing.",
    adCapAud: 900,
    approverName: "Hannah Cole",
  },
  {
    slug: "lantern-gifts",
    name: "Lantern Gift Emporium",
    city: "Melbourne",
    suburb: "Carlton",
    state: "VIC",
    postcode: "3053",
    timezone: "Australia/Melbourne",
    tier: "Starter",
    hours: "Mon–Fri 10:00am–6:30pm; Sat 10:00am–5:00pm; Sun closed",
    goals: ["Increase corporate gifting enquiries", "Promote new stationery lines"],
    voice: "Playful, curated and concise — gift ideas without clutter.",
    nature:
      "Gift and stationery emporium with cards, wraps, small lifestyle goods and corporate gifting support.",
    services: ["Gift shopping", "Corporate gifting", "Card & wrap", "Click & collect"],
    productCategories: ["Cards", "Stationery", "Small gifts", "Wrap", "Toys"],
    heroProducts: ["Letterpress cards", "Desk sets", "Host gift bundles"],
    promotions: ["Buy 3 cards save 10%", "Corporate gift consult"],
    seasons: ["Valentine's", "End-of-year corporate", "Teacher gifts"],
    pricePositioning: "Curated gifts at approachable prices — no fake scarcity.",
    adCapAud: 550,
    approverName: "Owen Fraser",
  },
  {
    slug: "coast-outfitters",
    name: "Coast Outfitters",
    city: "Gold Coast",
    suburb: "Burleigh Heads",
    state: "QLD",
    postcode: "4220",
    timezone: "Australia/Brisbane",
    tier: "Growth",
    hours: "Mon–Sun 9:00am–5:30pm",
    goals: ["Grow weekend surf/lifestyle traffic", "Push new season apparel drops"],
    voice: "Relaxed coastal lifestyle — energetic but not salesy.",
    nature:
      "Coastal apparel and outdoor lifestyle retailer for locals and visitors — apparel, accessories and beach essentials.",
    services: ["In-store", "Click & collect", "Alterations partner", "New-season drops"],
    productCategories: ["Apparel", "Footwear", "Accessories", "Beach gear", "Kids"],
    heroProducts: ["Boardshorts", "Sun hats", "Weekend tote"],
    promotions: ["New-season drop weekend", "Locals loyalty punch card"],
    seasons: ["Summer swim", "Winter layers", "Holiday visitors"],
    pricePositioning: "Everyday coastal style — promotions are time-boxed and clear.",
    adCapAud: 1000,
    searchVisibility: true,
    approverName: "Mia Tran",
  },
  {
    slug: "market-pantry",
    name: "Market Pantry Goods",
    city: "Adelaide",
    suburb: "Norwood",
    state: "SA",
    postcode: "5067",
    timezone: "Australia/Adelaide",
    tier: "Managed",
    hours: "Mon–Fri 8:30am–6:00pm; Sat 8:00am–4:00pm; Sun 9:00am–2:00pm",
    goals: ["Grow specialty pantry subscription interest", "Promote local maker weekends"],
    voice: "Food-curious and neighbourly — specific product language, no health overclaims.",
    nature:
      "Specialty pantry and gourmet goods store featuring local makers, oils, preserves and weekend tastings.",
    services: ["In-store", "Click & collect", "Maker weekends", "Pantry subscription (test)"],
    productCategories: ["Oils & vinegar", "Preserves", "Pasta & grains", "Snacks", "Local makers"],
    heroProducts: ["Local olive oil", "Seasonal preserve flight", "Maker tasting packs"],
    promotions: ["Maker weekend tasting", "First pantry box intro"],
    seasons: ["Harvest preserves", "Christmas hampers", "Winter broths"],
    pricePositioning: "Specialty quality with transparent provenance — no miracle health claims.",
    adCapAud: 1600,
    searchVisibility: true,
    approverName: "Ben Wallace",
  },
];

export const STAGING_IGA_FIXTURE_KEY = "staging-iga-retail-v1" as const;
export const STAGING_IGA_TENANT_ID = "5f200000-0000-4000-8000-000000000001" as const;
export const STAGING_GENERAL_RETAIL_FIXTURE_KEY = "staging-general-retail-v1" as const;
export const STAGING_GENERAL_RETAIL_TENANT_ID =
  "5f300000-0000-4000-8000-000000000001" as const;

export const STAGING_IGA_APPROVER_SLUGS = IGA_RETAIL_STORES.map((s) => s.slug);
export const STAGING_GENERAL_RETAIL_APPROVER_SLUGS = GENERAL_RETAIL_STORES.map(
  (s) => s.slug,
);
export const STAGING_RETAIL_APPROVER_SLUGS = [
  ...STAGING_IGA_APPROVER_SLUGS,
  ...STAGING_GENERAL_RETAIL_APPROVER_SLUGS,
] as const;

/** Display name for retail fixture approver emails. */
export function stagingRetailFixtureDisplayName(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const approver = normalized.match(
    /^approver-([a-z0-9-]+)@staging-fixture\.invalid$/,
  );
  if (approver?.[1]) {
    return STAGING_RETAIL_APPROVER_NAMES[approver[1]] ?? null;
  }
  return null;
}

function buildRetailFixture(config: RetailPackConfig): StagingRetailFixture {
  const { adminId, staffIds } = operatorIds(config.uuidFamily);
  const stores = config.stores;

  const users: StagingRetailFixtureUser[] = [
    {
      id: adminId,
      fixtureKey: `${config.fixtureKey}:admin`,
      fixtureRole: "Admin",
      email: "admin@staging-fixture.invalid",
      name: "Alex Morgan",
      role: "super_admin",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    },
    ...staffIds.map((id, index): StagingRetailFixtureUser => ({
      id,
      fixtureKey: `${config.fixtureKey}:staff:${index + 1}`,
      fixtureRole: "Staff",
      email: `staff-${index + 1}@staging-fixture.invalid`,
      name: STAFF_DISPLAY_NAMES[index] ?? `Staff ${index + 1}`,
      role: "admin",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
    ...stores.map((store, index): StagingRetailFixtureUser => ({
      id: stableUuid(config.uuidFamily, "approver", index),
      fixtureKey: `${config.fixtureKey}:approver:${store.slug}`,
      fixtureRole: "Client Approver",
      email: `approver-${store.slug}@staging-fixture.invalid`,
      name: store.approverName,
      role: "user",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
  ];

  const companies: StagingRetailCompany[] = stores.map((store, index) => {
    const companyId = stableUuid(config.uuidFamily, "company", index);
    const packageSettings = serviceMapping(store.tier);
    const serviceOptions = {
      searchVisibility: store.searchVisibility === true || store.tier === "Managed",
      websiteConnectionSetup: false,
      websitePublishing: false,
      hostedLandingPage: false,
      monthlyAdCapAud: store.adCapAud,
    };
    return {
      id: companyId,
      tenantId: config.tenantId,
      name: store.name,
      status: "ai_ready",
      profile: {
        legalName: `TEST ONLY — ${store.name} Fixture Pty Ltd`,
        tradingNames: store.name,
        industry: config.industry,
        businessType: "retail",
        website: `https://${store.slug}.test`,
        approvalContact: `${store.approverName} · ${store.name}`,
        serviceAreas: [`${store.suburb}, ${store.city}`],
        natureOfBusiness: store.nature,
        services: store.services,
        targetCustomers: `Local residents and visitors shopping in ${store.suburb}, ${store.city}.`,
        brandVoice: store.voice,
        callsToAction: ["Shop in store", "Order click & collect", "See this week's offers"],
        prohibitedClaims: [
          "Cheapest in town",
          "Guaranteed savings",
          "Half price (unless catalogue-confirmed)",
        ],
        approvedClaims: [
          `Located in ${store.suburb}`,
          `Fixture hero product: ${store.heroProducts[0]}`,
        ],
        requiredDisclaimers: ["TEST FIXTURE — no order, payment or delivery will be processed."],
        tradingHours: store.hours,
        businessAddress: `TEST ONLY — ${20 + index} Fiction Parade, ${store.suburb} ${store.state} ${store.postcode}, Australia`,
        phone: `+61 8 8${String(200 + index).padStart(3, "0")} ${String(3000 + index * 13).padStart(4, "0")}`,
        email: `hello@${store.slug}.test`,
        latitude: -33.8 + index * 0.02,
        longitude: 151.1 + index * 0.015,
        placeCategory: "Store",
        googlePlaceId: `sim_place_fixture_${store.slug}`,
        structuredAddress: {
          countryCode: "AU",
          postcode: store.postcode,
          suburb: store.suburb,
          stateRegion: store.state,
          unit: "",
          streetNumber: String(20 + index),
          streetName: "Fiction",
          streetType: "Pde",
        },
        structuredPhone: {
          countryCallingCode: "61",
          nationalNumber: `8 8${String(200 + index).padStart(3, "0")} ${String(3000 + index * 13).padStart(4, "0")}`,
        },
        currentOffers: `TEST ONLY — ${store.promotions[0] ?? "sample offer"}; not redeemable.`,
        localMarketNotes: `Fictional staging ${config.vertical} profile for ${store.suburb}, ${store.city}. No real store is represented.`,
        retail: {
          productCategories: store.productCategories,
          heroProducts: store.heroProducts,
          promotions: store.promotions,
          seasons: store.seasons,
          pricePositioning: store.pricePositioning,
        },
        managedService: {
          ...packageSettings,
          serviceOptions,
          serviceBilling: {
            status: "active",
            activePackageId: packageSettings.marketingPackageId,
            serviceOptions,
            lastPaidAt: STAGING_FIXTURE_TIMESTAMP,
          },
          operatingAuthorityConfirmedAt: STAGING_FIXTURE_TIMESTAMP,
          strategyEligibleAt: STAGING_FIXTURE_TIMESTAMP,
          packageChangePendingBilling: false,
        },
        ...(store.searchVisibility
          ? {
              aiDiscovery: {
                directories: {
                  bingPlacesClaimed: false,
                  yelpListed: false,
                  notes: "TEST ONLY — Search Visibility fixture; no directory changes are made.",
                },
              },
            }
          : {}),
        stagingFixture: {
          fixtureKey: `${config.fixtureKey}:store:${store.slug}`,
          testOnly: true,
          vertical: config.vertical,
          city: store.city,
          suburb: store.suburb,
          timezone: store.timezone,
          serviceTier: store.tier,
          addons: store.searchVisibility ? ["Search Visibility"] : [],
          identifiers: {
            domain: `${store.slug}.test`,
            abnLike: `TEST ONLY — 11 000 00${String(index + 1).padStart(3, "0")}`,
            notice: "TEST ONLY — not a registered business identifier",
          },
          goals: store.goals,
          heroProducts: store.heroProducts,
          serviceDetails: store.services,
          monthlyAdCapAud: store.adCapAud,
          connectors: fixtureConnectors(index),
        },
      },
      documents: [
        {
          id: `test-only-rights-audit-${store.slug}`,
          name: `TEST-ONLY-${store.slug}-visual-rights-audit.txt`,
          contentType: "text/plain",
          size: 0,
          approvalStatus: "approved",
          consentObtained: true,
          showsCustomer: false,
          uploadedBy: stableUuid(config.uuidFamily, "approver", index),
          uploadedAt: STAGING_FIXTURE_TIMESTAMP,
        },
      ],
      createdBy: adminId,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
      updatedAt: STAGING_FIXTURE_TIMESTAMP,
    };
  });

  const memberships: TenantMember[] = [
    {
      tenantId: config.tenantId,
      userId: adminId,
      role: "owner",
      roleTitle: "group_admin",
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    },
    ...staffIds.map(
      (userId): TenantMember => ({
        tenantId: config.tenantId,
        userId,
        role: "admin",
        roleTitle: "content_operator",
        createdAt: STAGING_FIXTURE_TIMESTAMP,
      }),
    ),
    ...stores.map(
      (_, index): TenantMember => ({
        tenantId: config.tenantId,
        userId: stableUuid(config.uuidFamily, "approver", index),
        role: "member",
        roleTitle: "approver",
        portalOnly: true,
        createdAt: STAGING_FIXTURE_TIMESTAMP,
      }),
    ),
  ];

  const access: CompanyAccess[] = stores.map((_, index) => ({
    userId: stableUuid(config.uuidFamily, "approver", index),
    companyId: stableUuid(config.uuidFamily, "company", index),
  }));

  const assets = companies.flatMap((company, index): Asset[] => {
    const slug = stores[index]!.slug;
    const approverId = stableUuid(config.uuidFamily, "approver", index);
    return [
      {
        id: stableUuid(config.uuidFamily, "asset-client", index),
        companyId: company.id,
        folder: "Client Provided/Test Fixture",
        name: `TEST ONLY — ${company.name} client-provided storefront visual`,
        description:
          "Metadata-only staging asset. Rights record exists for audit testing; no image bytes are stored.",
        assetType: "image",
        source: "upload",
        externalRef: `fixture://client-provided/${slug}`,
        tags: ["test-only", "client-provided", "rights-audit", config.vertical],
        usageRights: {
          owner: `${company.name} — fictional fixture client`,
          licenceType: "owned",
          licenceRef: `TEST-ONLY-RIGHTS-R${String(index + 1).padStart(3, "0")}`,
          consentObtained: true,
          consentRef: `TEST-ONLY-AUDIT-R${String(index + 1).padStart(3, "0")}`,
          allowedChannels: ["Instagram", "Facebook", "Google Business Profile"],
          restrictions: "Staging fixture only. No real person, store or production publishing.",
        },
        status: "approved",
        createdById: approverId,
        approvedById: adminId,
        approvedAt: STAGING_FIXTURE_TIMESTAMP,
        createdAt: STAGING_FIXTURE_TIMESTAMP,
        updatedAt: STAGING_FIXTURE_TIMESTAMP,
      },
      {
        id: stableUuid(config.uuidFamily, "asset-ai", index),
        companyId: company.id,
        folder: "Private/Generated/Test Fixture",
        name: `TEST ONLY — ${company.name} generated product concept`,
        description:
          "Private metadata-only provenance fixture. It is deliberately unapproved and cannot be published.",
        assetType: "image",
        source: "ai_generated",
        externalRef: `fixture-private://generated/${slug}`,
        tags: ["test-only", "private", "generated", "provenance", config.vertical],
        usageRights: {
          owner: "Staging fixture generator",
          licenceType: "unknown",
          consentObtained: false,
          allowedChannels: [],
          restrictions: "Private provenance test only. Approval and publication prohibited.",
        },
        status: "draft",
        createdById: staffIds[index % staffIds.length]!,
        createdAt: STAGING_FIXTURE_TIMESTAMP,
        updatedAt: STAGING_FIXTURE_TIMESTAMP,
        aiModel: "fixture-simulated-image-model",
        aiPrompt: `TEST FIXTURE ONLY: conceptual ${config.vertical} retail product for ${slug}; no people, logos or real store.`,
        aiRunId: null,
        estCostUsd: 0,
        sourcesUsed: ["fixture://synthetic-brief", "fixture://no-real-source-material"],
      },
    ];
  });

  const adBudgets: AdBudget[] = companies.map((company) => ({
    companyId: company.id,
    monthlyBudgetUsd: 0,
    allocation: {},
    feeModel: "flat_monthly",
    feePercent: 0,
    feeFlatUsd: 0,
    updatedById: adminId,
    updatedAt: STAGING_FIXTURE_TIMESTAMP,
  }));

  return {
    fixtureKey: config.fixtureKey,
    vertical: config.vertical,
    tenant: {
      id: config.tenantId,
      name: config.tenantName,
      kind: "agency",
      plan: "scale",
      status: "active",
      timezone: "Australia/Sydney",
      onboarding: {
        companyName: config.tenantName,
        industry: "Marketing Services",
        notes: `${config.fixtureKey}; TEST ONLY; no billing or outbound communication.`,
      },
      onboardingCompletedAt: STAGING_FIXTURE_TIMESTAMP,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
      updatedAt: STAGING_FIXTURE_TIMESTAMP,
    },
    users,
    memberships,
    companies,
    access,
    assets,
    adBudgets,
    sideEffects: {
      realEmails: false,
      billing: false,
      livePublishing: false,
      liveConnectors: false,
    },
  };
}

export function createStagingIgaRetailFixture(): StagingRetailFixture {
  return buildRetailFixture({
    fixtureKey: STAGING_IGA_FIXTURE_KEY,
    vertical: "iga",
    tenantId: STAGING_IGA_TENANT_ID,
    tenantName: "Wattle Retail Agency (IGA fixtures)",
    industry: "Supermarket & Grocery Retail",
    uuidFamily: "2",
    stores: IGA_RETAIL_STORES,
  });
}

export function createStagingGeneralRetailFixture(): StagingRetailFixture {
  return buildRetailFixture({
    fixtureKey: STAGING_GENERAL_RETAIL_FIXTURE_KEY,
    vertical: "general",
    tenantId: STAGING_GENERAL_RETAIL_TENANT_ID,
    tenantName: "Harbour Retail Agency (general fixtures)",
    industry: "General Merchandise Retail",
    uuidFamily: "3",
    stores: GENERAL_RETAIL_STORES,
  });
}

export function stagingRetailStoreFixtureKey(
  pack: StagingRetailFixtureKey,
  slug: string,
): string {
  return `${pack}:store:${slug}`;
}

export { stagingFixtureAuthMetadata };

export function findStagingRetailPackForSlug(slug: string): {
  pack: StagingRetailFixtureKey;
  tenantId: string;
  create: () => StagingRetailFixture;
} | null {
  if (IGA_RETAIL_STORES.some((s) => s.slug === slug)) {
    return {
      pack: STAGING_IGA_FIXTURE_KEY,
      tenantId: STAGING_IGA_TENANT_ID,
      create: createStagingIgaRetailFixture,
    };
  }
  if (GENERAL_RETAIL_STORES.some((s) => s.slug === slug)) {
    return {
      pack: STAGING_GENERAL_RETAIL_FIXTURE_KEY,
      tenantId: STAGING_GENERAL_RETAIL_TENANT_ID,
      create: createStagingGeneralRetailFixture,
    };
  }
  return null;
}
