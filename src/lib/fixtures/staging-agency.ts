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

export const STAGING_FIXTURE_KEY = "staging-indian-restaurants-v1" as const;
export const STAGING_FIXTURE_TIMESTAMP = "2026-07-01T00:00:00.000Z" as const;
export const STAGING_FIXTURE_TENANT_ID = "5f100000-0000-4000-8000-000000000001" as const;

export type StagingFixtureRole = "Admin" | "Staff" | "Client Approver";
export type StagingServiceTier = "Starter" | "Growth" | "Managed";

export interface SimulatedConnectorState {
  mode: "simulated";
  platform: "Google Business Profile" | "Instagram" | "Meta Ads" | "Google Ads";
  status: "connected" | "not_connected";
  externalAccountRef: string;
  liveOperationsAllowed: false;
}

export interface StagingRestaurantMetadata {
  fixtureKey: string;
  testOnly: true;
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
  menuHighlights: string[];
  serviceDetails: string[];
  monthlyAdCapAud: number;
  connectors: SimulatedConnectorState[];
}

export interface StagingRestaurantProfile extends CompanyProfile {
  stagingFixture: StagingRestaurantMetadata;
}

export interface StagingRestaurantCompany extends Omit<Company, "profile"> {
  profile: StagingRestaurantProfile;
}

export interface StagingFixtureUser extends User {
  fixtureKey: string;
  fixtureRole: StagingFixtureRole;
}

export function stagingFixtureAuthMetadata(
  user: StagingFixtureUser,
  tenantId: string,
): {
  appMetadata: Record<string, string>;
  userMetadata: { fixture_key: string; test_only: true };
} {
  const operator =
    user.fixtureRole === "Admin" || user.fixtureRole === "Staff";
  return {
    appMetadata: operator
      ? { role: user.fixtureRole, tenant_id: tenantId }
      : {},
    userMetadata: {
      fixture_key: user.fixtureKey,
      test_only: true,
    },
  };
}

export interface StagingAgencyFixture {
  fixtureKey: typeof STAGING_FIXTURE_KEY;
  tenant: Tenant;
  users: StagingFixtureUser[];
  memberships: TenantMember[];
  companies: StagingRestaurantCompany[];
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

type RestaurantDefinition = {
  slug: string;
  name: string;
  city: string;
  suburb: string;
  timezone: string;
  tier: StagingServiceTier;
  cuisine: string;
  hours: string;
  goals: string[];
  voice: string;
  menu: string[];
  services: string[];
  dietary: string[];
  adCapAud: number;
  searchVisibility?: true;
};

/** Human display names for fixture seats (never "Client Approver — …"). */
const APPROVER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "saffron-laneway": "Priya Mehta",
  "copper-tiffin": "Arjun Shah",
  "monsoon-courtyard": "Neha Kapoor",
  "pepperleaf-thali": "Rohan Desai",
  "clove-and-coal": "Ananya Iyer",
  "tamarind-terrace": "Vikram Nair",
  "valley-masala": "Meera Joshi",
  "deccan-social": "Kabir Reddy",
  "marigold-coast": "Sana Pillai",
  "riverstone-dhaba": "Dev Patel",
};

const STAFF_DISPLAY_NAMES = ["Jordan Chen", "Sam Okonkwo"] as const;

/** Resolve a professional display name for a staging fixture email. */
export function stagingFixtureDisplayName(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === "admin@staging-fixture.invalid") return "Alex Morgan";
  const staff = normalized.match(/^staff-(\d+)@staging-fixture\.invalid$/);
  if (staff?.[1]) {
    const idx = Math.max(0, Number(staff[1]) - 1);
    return STAFF_DISPLAY_NAMES[idx] ?? `Staff ${staff[1]}`;
  }
  const approver = normalized.match(
    /^approver-([a-z0-9-]+)@staging-fixture\.invalid$/,
  );
  if (approver?.[1]) {
    return APPROVER_DISPLAY_NAMES[approver[1]] ?? null;
  }
  return null;
}

const RESTAURANTS: readonly RestaurantDefinition[] = [
  {
    slug: "saffron-laneway",
    name: "Saffron Laneway Kitchen",
    city: "Sydney",
    suburb: "Surry Hills",
    timezone: "Australia/Sydney",
    tier: "Starter",
    cuisine: "Modern North Indian",
    hours: "Mon–Thu 5:00pm–10:00pm; Fri–Sat 5:00pm–11:00pm; Sun 5:00pm–9:30pm",
    goals: ["Grow weekday dinner bookings", "Build awareness with nearby office teams"],
    voice: "Warm, contemporary and ingredient-led; confident without claiming authenticity awards.",
    menu: ["Smoked eggplant bharta", "Tandoori mushroom skewers", "Cardamom kulfi"],
    services: ["Dine-in", "Takeaway", "Small-group set menus"],
    dietary: ["Vegetarian", "Vegan options", "Gluten-friendly options"],
    adCapAud: 700,
  },
  {
    slug: "copper-tiffin",
    name: "Copper Tiffin House",
    city: "Melbourne",
    suburb: "Fitzroy",
    timezone: "Australia/Melbourne",
    tier: "Starter",
    cuisine: "South Indian tiffin and filter coffee",
    hours: "Tue–Fri 7:30am–3:00pm; Sat–Sun 8:00am–4:00pm; Mon closed",
    goals: ["Increase weekday breakfast visits", "Introduce the rotating lunch tiffin"],
    voice: "Bright, curious and neighbourhood-focused, with short sensory descriptions.",
    menu: ["Masala dosa", "Mini idli sambar", "Jaggery filter coffee"],
    services: ["Breakfast", "Lunch", "Takeaway"],
    dietary: ["Vegetarian", "Vegan options", "Gluten-friendly options"],
    adCapAud: 600,
  },
  {
    slug: "monsoon-courtyard",
    name: "Monsoon Courtyard",
    city: "Brisbane",
    suburb: "West End",
    timezone: "Australia/Brisbane",
    tier: "Starter",
    cuisine: "Goan and coastal Indian",
    hours: "Wed–Sun 12:00pm–3:00pm and 5:00pm–10:00pm; Mon–Tue closed",
    goals: ["Lift Sunday lunch bookings", "Showcase coastal dishes beyond curry"],
    voice: "Relaxed, colourful and coastal; descriptive, never exaggerated.",
    menu: ["Coconut fish curry", "Mushroom xacuti", "Bebinca with coconut"],
    services: ["Dine-in", "Takeaway", "Sunday shared lunch"],
    dietary: ["Vegetarian", "Dairy-free options", "Gluten-friendly options"],
    adCapAud: 650,
  },
  {
    slug: "pepperleaf-thali",
    name: "Pepperleaf Thali Room",
    city: "Perth",
    suburb: "Northbridge",
    timezone: "Australia/Perth",
    tier: "Starter",
    cuisine: "Gujarati and Rajasthani vegetarian thali",
    hours: "Mon–Sat 11:30am–3:00pm and 5:30pm–9:30pm; Sun 11:30am–4:00pm",
    goals: ["Increase first-time thali trials", "Grow pre-theatre early dining"],
    voice: "Welcoming, generous and practical; explain unfamiliar dishes simply.",
    menu: ["Seasonal Gujarati thali", "Dal baati churma", "Kesar shrikhand"],
    services: ["Dine-in", "Takeaway thali", "Pre-theatre service"],
    dietary: ["Vegetarian", "Jain options by request", "Gluten-friendly options"],
    adCapAud: 750,
  },
  {
    slug: "clove-and-coal",
    name: "Clove & Coal Dining",
    city: "Adelaide",
    suburb: "Norwood",
    timezone: "Australia/Adelaide",
    tier: "Growth",
    cuisine: "Indian charcoal grill and regional plates",
    hours: "Tue–Thu 5:00pm–10:00pm; Fri–Sat 5:00pm–11:00pm; Sun 12:00pm–9:00pm",
    goals: ["Grow celebration bookings", "Build a repeat local dinner audience"],
    voice: "Polished but approachable, with an emphasis on craft, fire and sharing.",
    menu: ["Charred paneer tikka", "Black pepper lamb chops", "Rose falooda"],
    services: ["Dine-in", "Group dining", "Private set menus"],
    dietary: ["Vegetarian", "Halal-friendly meat supplier fixture", "Gluten-friendly options"],
    adCapAud: 1400,
  },
  {
    slug: "tamarind-terrace",
    name: "Tamarind Terrace",
    city: "Darwin",
    suburb: "Parap",
    timezone: "Australia/Darwin",
    tier: "Growth",
    cuisine: "Kerala-inspired tropical Indian",
    hours: "Tue–Sun 11:30am–2:30pm and 5:00pm–9:30pm; Mon closed",
    goals: ["Strengthen wet-season takeaway demand", "Promote family banquet menus"],
    voice: "Lively, tropical and family-friendly; focus on freshness and sharing.",
    menu: ["Kerala vegetable stew", "Pepper chicken roast", "Tender coconut payasam"],
    services: ["Dine-in", "Takeaway", "Family banquets"],
    dietary: ["Vegetarian", "Vegan options", "Dairy-free options"],
    adCapAud: 1200,
  },
  {
    slug: "valley-masala",
    name: "Valley Masala Table",
    city: "Hobart",
    suburb: "North Hobart",
    timezone: "Australia/Hobart",
    tier: "Growth",
    cuisine: "Seasonal Indian dining with Tasmanian produce",
    hours: "Wed–Sun 5:00pm–10:00pm; Fri–Sun lunch 12:00pm–2:30pm",
    goals: ["Improve local search discovery", "Grow winter weekend bookings"],
    voice: "Grounded, seasonal and quietly confident; connect dishes to local produce.",
    menu: ["Huon mushroom korma", "Charred brassica chaat", "Saffron apple phirni"],
    services: ["Dine-in", "Chef's shared menu", "Weekend lunch"],
    dietary: ["Vegetarian", "Vegan tasting options", "Gluten-friendly options"],
    adCapAud: 1500,
    searchVisibility: true,
  },
  {
    slug: "deccan-social",
    name: "Deccan Social Canteen",
    city: "Canberra",
    suburb: "Braddon",
    timezone: "Australia/Sydney",
    tier: "Growth",
    cuisine: "Hyderabadi street food and biryani",
    hours: "Mon–Fri 11:30am–10:00pm; Sat–Sun 12:00pm–10:00pm",
    goals: ["Grow office lunch orders", "Build awareness of late-week social dining"],
    voice: "Energetic, direct and social; useful detail first, playful lines second.",
    menu: ["Vegetable dum biryani", "Mirchi ka salan", "Double ka meetha"],
    services: ["Dine-in", "Click and collect", "Office catering"],
    dietary: ["Vegetarian", "Halal-friendly meat supplier fixture", "Gluten-friendly options"],
    adCapAud: 1350,
  },
  {
    slug: "marigold-coast",
    name: "Marigold Coast Indian",
    city: "Gold Coast",
    suburb: "Burleigh Heads",
    timezone: "Australia/Brisbane",
    tier: "Managed",
    cuisine: "Contemporary Indian coastal dining",
    hours: "Daily 12:00pm–3:00pm and 5:00pm–10:30pm",
    goals: ["Build a consistent year-round campaign calendar", "Grow group and event enquiries"],
    voice: "Sunlit, celebratory and premium without being formal.",
    menu: ["Moreton Bay bug pepper fry", "Jackfruit biryani", "Mango shrikhand tart"],
    services: ["Dine-in", "Events", "Group dining", "Takeaway"],
    dietary: ["Vegetarian", "Vegan options", "Gluten-friendly options"],
    adCapAud: 2800,
  },
  {
    slug: "riverstone-dhaba",
    name: "Riverstone Dhaba",
    city: "Newcastle",
    suburb: "Cooks Hill",
    timezone: "Australia/Sydney",
    tier: "Managed",
    cuisine: "Punjabi comfort food and tandoor",
    hours: "Tue–Thu 5:00pm–10:00pm; Fri–Sun 12:00pm–10:30pm; Mon closed",
    goals: ["Maintain an always-on local content program", "Increase family banquet bookings"],
    voice: "Generous, candid and community-minded; hearty language without superlatives.",
    menu: ["Dal makhani", "Tandoori cauliflower", "Pistachio kulfi"],
    services: ["Dine-in", "Takeaway", "Family banquets", "Local catering"],
    dietary: ["Vegetarian", "Vegan options", "Gluten-friendly options"],
    adCapAud: 2500,
  },
] as const;

function stableUuid(group: "company" | "approver" | "asset-client" | "asset-ai", index: number) {
  const groupCode = {
    company: "1100",
    approver: "1200",
    "asset-client": "1300",
    "asset-ai": "1400",
  }[group];
  return `5f${groupCode}00-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function fixtureConnectors(index: number): SimulatedConnectorState[] {
  return [
    {
      mode: "simulated",
      platform: "Google Business Profile",
      status: index % 3 === 0 ? "not_connected" : "connected",
      externalAccountRef: `TEST-ONLY-GBP-${String(index + 1).padStart(3, "0")}`,
      liveOperationsAllowed: false,
    },
    {
      mode: "simulated",
      platform: "Instagram",
      status: index % 4 === 0 ? "not_connected" : "connected",
      externalAccountRef: `TEST-ONLY-IG-${String(index + 1).padStart(3, "0")}`,
      liveOperationsAllowed: false,
    },
    {
      mode: "simulated",
      platform: index % 2 === 0 ? "Meta Ads" : "Google Ads",
      status: "not_connected",
      externalAccountRef: `TEST-ONLY-ADS-${String(index + 1).padStart(3, "0")}`,
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

function buildFixture(): StagingAgencyFixture {
  const adminId = "5f150000-0000-4000-8000-000000000001";
  const staffIds = [
    "5f150000-0000-4000-8000-000000000002",
    "5f150000-0000-4000-8000-000000000003",
  ];
  const users: StagingFixtureUser[] = [
    {
      id: adminId,
      fixtureKey: `${STAGING_FIXTURE_KEY}:admin`,
      fixtureRole: "Admin",
      email: "admin@staging-fixture.invalid",
      name: "Alex Morgan",
      role: "super_admin",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    },
    ...staffIds.map((id, index): StagingFixtureUser => ({
      id,
      fixtureKey: `${STAGING_FIXTURE_KEY}:staff:${index + 1}`,
      fixtureRole: "Staff",
      email: `staff-${index + 1}@staging-fixture.invalid`,
      name: STAFF_DISPLAY_NAMES[index] ?? `Staff ${index + 1}`,
      role: "admin",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
    ...RESTAURANTS.map((restaurant, index): StagingFixtureUser => ({
      id: stableUuid("approver", index),
      fixtureKey: `${STAGING_FIXTURE_KEY}:approver:${restaurant.slug}`,
      fixtureRole: "Client Approver",
      email: `approver-${restaurant.slug}@staging-fixture.invalid`,
      name:
        APPROVER_DISPLAY_NAMES[restaurant.slug] ??
        `Approver ${restaurant.name}`,
      role: "user",
      active: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
  ];

  const companies: StagingRestaurantCompany[] = RESTAURANTS.map((restaurant, index) => {
    const companyId = stableUuid("company", index);
    const packageSettings = serviceMapping(restaurant.tier);
    const serviceOptions = {
      searchVisibility:
        restaurant.searchVisibility === true || restaurant.tier === "Managed",
      websiteConnectionSetup: false,
      websitePublishing: false,
      hostedLandingPage: false,
      monthlyAdCapAud: restaurant.adCapAud,
    };
    return {
      id: companyId,
      tenantId: STAGING_FIXTURE_TENANT_ID,
      name: restaurant.name,
      status: "ai_ready",
      profile: {
        legalName: `TEST ONLY — ${restaurant.name} Fixture Pty Ltd`,
        tradingNames: restaurant.name,
        industry: "Restaurant & Hospitality",
        businessType: "restaurant_cafe",
        website: `https://${restaurant.slug}.test`,
        approvalContact: `${APPROVER_DISPLAY_NAMES[restaurant.slug] ?? "Approver"} · ${restaurant.name}`,
        serviceAreas: [`${restaurant.suburb}, ${restaurant.city}`],
        natureOfBusiness: `${restaurant.cuisine} restaurant serving ${restaurant.suburb} and nearby ${restaurant.city} communities.`,
        services: restaurant.services,
        targetCustomers: `Local residents, workers and visitors seeking ${restaurant.cuisine.toLowerCase()} dining in ${restaurant.suburb}.`,
        brandVoice: restaurant.voice,
        callsToAction: ["View the test menu", "Request a fixture booking", "Plan a group meal"],
        prohibitedClaims: ["Best Indian restaurant", "Guaranteed health benefits", "Award-winning unless verified"],
        approvedClaims: [`Fixture menu includes ${restaurant.menu[0]}`, `Located in ${restaurant.suburb}`],
        requiredDisclaimers: ["TEST FIXTURE — no booking, order or payment will be processed."],
        tradingHours: restaurant.hours,
        businessAddress: `TEST ONLY — ${12 + (index % 80)} Fiction St, ${restaurant.suburb} ${restaurant.city}`,
        phone: `+61 2 9${String(100 + index).padStart(3, "0")} ${String(2000 + index * 11).padStart(4, "0")}`,
        email: `hello@${restaurant.slug}.test`,
        latitude: -33.86 + index * 0.01,
        longitude: 151.2 + index * 0.008,
        placeCategory: "Restaurant",
        googlePlaceId: `sim_place_fixture_${restaurant.slug}`,
        currentOffers: "TEST ONLY — sample seasonal shared-menu promotion; not redeemable.",
        localMarketNotes: `Fictional staging profile for ${restaurant.suburb}, ${restaurant.city}. No real venue is represented. Use suburb + map pin for local targeting tests.`,
        restaurant: {
          cuisineStyle: restaurant.cuisine,
          serviceModes: restaurant.services,
          dietaryOptions: restaurant.dietary,
          peakServicePeriods: ["Friday dinner", "Saturday dinner", "Sunday lunch"],
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
        ...(restaurant.searchVisibility
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
          fixtureKey: `${STAGING_FIXTURE_KEY}:restaurant:${restaurant.slug}`,
          testOnly: true,
          city: restaurant.city,
          suburb: restaurant.suburb,
          timezone: restaurant.timezone,
          serviceTier: restaurant.tier,
          addons: restaurant.searchVisibility ? ["Search Visibility"] : [],
          identifiers: {
            domain: `${restaurant.slug}.test`,
            abnLike: `TEST ONLY — 00 000 00${String(index + 1).padStart(3, "0")}`,
            notice: "TEST ONLY — not a registered business identifier",
          },
          goals: restaurant.goals,
          menuHighlights: restaurant.menu,
          serviceDetails: restaurant.services,
          monthlyAdCapAud: restaurant.adCapAud,
          connectors: fixtureConnectors(index),
        },
      },
      documents: [
        {
          id: `test-only-rights-audit-${restaurant.slug}`,
          name: `TEST-ONLY-${restaurant.slug}-visual-rights-audit.txt`,
          contentType: "text/plain",
          size: 0,
          approvalStatus: "approved",
          consentObtained: true,
          showsCustomer: false,
          uploadedBy: stableUuid("approver", index),
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
      tenantId: STAGING_FIXTURE_TENANT_ID,
      userId: adminId,
      role: "owner",
      roleTitle: "group_admin",
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    },
    ...staffIds.map((userId): TenantMember => ({
      tenantId: STAGING_FIXTURE_TENANT_ID,
      userId,
      role: "admin",
      roleTitle: "content_operator",
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
    ...RESTAURANTS.map((_, index): TenantMember => ({
      tenantId: STAGING_FIXTURE_TENANT_ID,
      userId: stableUuid("approver", index),
      role: "member",
      roleTitle: "approver",
      portalOnly: true,
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    })),
  ];

  const access: CompanyAccess[] = RESTAURANTS.map((_, index) => ({
    userId: stableUuid("approver", index),
    companyId: stableUuid("company", index),
  }));

  const assets = companies.flatMap((company, index): Asset[] => {
    const slug = RESTAURANTS[index]!.slug;
    const approverId = stableUuid("approver", index);
    return [
      {
        id: stableUuid("asset-client", index),
        companyId: company.id,
        folder: "Client Provided/Test Fixture",
        name: `TEST ONLY — ${company.name} client-provided dining-room visual`,
        description: "Metadata-only staging asset. Rights record exists for audit testing; no image bytes are stored.",
        assetType: "image",
        source: "upload",
        externalRef: `fixture://client-provided/${slug}`,
        tags: ["test-only", "client-provided", "rights-audit"],
        usageRights: {
          owner: `${company.name} — fictional fixture client`,
          licenceType: "owned",
          licenceRef: `TEST-ONLY-RIGHTS-${String(index + 1).padStart(3, "0")}`,
          consentObtained: true,
          consentRef: `TEST-ONLY-AUDIT-${String(index + 1).padStart(3, "0")}`,
          allowedChannels: ["Instagram", "Facebook", "Google Business Profile"],
          restrictions: "Staging fixture only. No real person, venue or production publishing.",
        },
        status: "approved",
        createdById: approverId,
        approvedById: adminId,
        approvedAt: STAGING_FIXTURE_TIMESTAMP,
        createdAt: STAGING_FIXTURE_TIMESTAMP,
        updatedAt: STAGING_FIXTURE_TIMESTAMP,
      },
      {
        id: stableUuid("asset-ai", index),
        companyId: company.id,
        folder: "Private/Generated/Test Fixture",
        name: `TEST ONLY — ${company.name} generated plating concept`,
        description: "Private metadata-only provenance fixture. It is deliberately unapproved and cannot be published.",
        assetType: "image",
        source: "ai_generated",
        externalRef: `fixture-private://generated/${slug}`,
        tags: ["test-only", "private", "generated", "provenance"],
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
        aiPrompt: `TEST FIXTURE ONLY: conceptual plated ${RESTAURANTS[index]!.cuisine} dish; no people, logos or real venue.`,
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
    fixtureKey: STAGING_FIXTURE_KEY,
    tenant: {
      id: STAGING_FIXTURE_TENANT_ID,
      name: "Southern Cross Hospitality",
      kind: "agency",
      plan: "scale",
      status: "active",
      timezone: "Australia/Sydney",
      onboarding: {
        companyName: "Southern Cross Hospitality",
        industry: "Marketing Services",
        notes: `${STAGING_FIXTURE_KEY}; TEST ONLY; no billing or outbound communication.`,
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

export function createStagingAgencyFixture(): StagingAgencyFixture {
  return buildFixture();
}
