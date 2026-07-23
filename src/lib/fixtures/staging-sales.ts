/**
 * Staging field-sales demo seat — Casey Rivera + two live-feeling clients.
 * Client-visible copy avoids TEST ONLY / fixture jargon (same posture as Saffron pack).
 * Internal fixtureKey metadata remains for idempotent seed / quick-login.
 */

import type {
  Company,
  CompanyAccess,
  CompanyProfile,
  TenantMember,
  User,
} from "@/lib/types";
import {
  STAGING_FIXTURE_TENANT_ID,
  STAGING_FIXTURE_TIMESTAMP,
} from "@/lib/fixtures/staging-agency";

export const STAGING_SALES_FIXTURE_KEY = "staging-sales-book-v1" as const;
export const STAGING_SALES_EMAIL = "sales-1@staging-fixture.invalid" as const;
export const STAGING_SALES_USER_ID =
  "5f150000-0000-4000-8000-000000000010" as const;
export const STAGING_SALES_DISPLAY_NAME = "Casey Rivera" as const;

export type StagingSalesClientDef = {
  slug: string;
  name: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  industry: string;
  businessType: CompanyProfile["businessType"];
  nature: string;
  voice: string;
  services: string[];
  website: string;
  approverName: string;
  packageId: "starter" | "growth" | "managed";
};

/** Demo book — reads like a real field-sales portfolio. */
export const STAGING_SALES_CLIENTS: readonly StagingSalesClientDef[] = [
  {
    slug: "harbour-roast",
    name: "Harbour Roast Co",
    suburb: "Pyrmont",
    city: "Sydney",
    state: "NSW",
    postcode: "2009",
    industry: "Cafe & Specialty Coffee",
    businessType: "restaurant_cafe",
    nature:
      "Neighbourhood specialty coffee roaster and cafe with weekday lunch trade and weekend brunch.",
    voice: "Warm, local, and product-led — clear offers without hype.",
    services: ["Espresso bar", "Brunch", "Retail beans", "Corporate catering"],
    website: "https://harbourroast.example",
    approverName: "Ava Nguyen",
    packageId: "growth",
  },
  {
    slug: "northline-dental",
    name: "Northline Dental",
    suburb: "Chatswood",
    city: "Sydney",
    state: "NSW",
    postcode: "2067",
    industry: "Dental Practice",
    businessType: "other",
    nature:
      "Family dental practice offering general dentistry, preventative care, and clear treatment plans.",
    voice: "Calm, reassuring, and professional — never salesy about health.",
    services: ["Check-ups", "Hygiene", "Cosmetic consults", "Emergency slots"],
    website: "https://northlinedental.example",
    approverName: "Dr Sam Okonkwo",
    packageId: "managed",
  },
];

export const STAGING_SALES_APPROVER_SLUGS = STAGING_SALES_CLIENTS.map(
  (c) => c.slug,
);

export function stagingSalesClientFixtureKey(slug: string): string {
  return `${STAGING_SALES_FIXTURE_KEY}:client:${slug}`;
}

export function stagingSalesApproverEmail(slug: string): string {
  return `approver-${slug}@staging-fixture.invalid`;
}

export function stagingSalesFixtureDisplayName(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (normalized === STAGING_SALES_EMAIL) return STAGING_SALES_DISPLAY_NAME;
  const m = normalized.match(/^approver-([a-z0-9-]+)@staging-fixture\.invalid$/);
  if (!m?.[1]) return null;
  const client = STAGING_SALES_CLIENTS.find((c) => c.slug === m[1]);
  return client?.approverName ?? null;
}

function salesClientUuid(index: number): string {
  return `5f160000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function salesApproverUuid(index: number): string {
  return `5f170000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function serviceMapping(packageId: StagingSalesClientDef["packageId"]) {
  if (packageId === "starter") {
    return {
      marketingPackageId: "starter" as const,
      serviceLevel: "managed_exceptions" as const,
    };
  }
  if (packageId === "growth") {
    return {
      marketingPackageId: "growth" as const,
      serviceLevel: "managed_exceptions" as const,
    };
  }
  return {
    marketingPackageId: "managed" as const,
    serviceLevel: "fully_managed" as const,
  };
}

export type StagingSalesFixture = {
  fixtureKey: typeof STAGING_SALES_FIXTURE_KEY;
  tenantId: string;
  salesUser: User & { fixtureKey: string };
  approvers: Array<User & { fixtureKey: string; companySlug: string }>;
  memberships: TenantMember[];
  companies: Company[];
  access: CompanyAccess[];
};

export function createStagingSalesFixture(): StagingSalesFixture {
  const salesUser = {
    id: STAGING_SALES_USER_ID,
    fixtureKey: `${STAGING_SALES_FIXTURE_KEY}:rep`,
    email: STAGING_SALES_EMAIL,
    name: STAGING_SALES_DISPLAY_NAME,
    role: "user" as const,
    active: true,
    createdAt: STAGING_FIXTURE_TIMESTAMP,
  };

  const approvers = STAGING_SALES_CLIENTS.map((client, index) => ({
    id: salesApproverUuid(index),
    fixtureKey: `${STAGING_SALES_FIXTURE_KEY}:approver:${client.slug}`,
    companySlug: client.slug,
    email: stagingSalesApproverEmail(client.slug),
    name: client.approverName,
    role: "user" as const,
    active: true,
    createdAt: STAGING_FIXTURE_TIMESTAMP,
  }));

  const companies: Company[] = STAGING_SALES_CLIENTS.map((client, index) => {
    const packageSettings = serviceMapping(client.packageId);
    const serviceOptions = {
      searchVisibility: client.packageId !== "starter",
      websiteConnectionSetup: false,
      websitePublishing: false,
      hostedLandingPage: false,
      monthlyAdCapAud: client.packageId === "managed" ? 2500 : 1200,
    };
    const companyId = salesClientUuid(index);
    return {
      id: companyId,
      tenantId: STAGING_FIXTURE_TENANT_ID,
      name: client.name,
      status: "ai_ready",
      createdBy: STAGING_SALES_USER_ID,
      soldByUserId: STAGING_SALES_USER_ID,
      profile: {
        legalName: `${client.name} Pty Ltd`,
        tradingNames: client.name,
        industry: client.industry,
        businessType: client.businessType,
        website: client.website,
        approvalContact: `${client.approverName} <${stagingSalesApproverEmail(client.slug)}>`,
        serviceAreas: [`${client.suburb}, ${client.city}`],
        natureOfBusiness: client.nature,
        services: client.services,
        targetCustomers: `Locals and nearby workers in ${client.suburb} and surrounding suburbs.`,
        brandVoice: client.voice,
        callsToAction: ["Book online", "Visit us", "Enquire"],
        prohibitedClaims: ["Guaranteed results", "Best in Sydney"],
        approvedClaims: [`Located in ${client.suburb}`, `Serving ${client.city}`],
        requiredDisclaimers: [],
        tradingHours: "Mon–Fri 8:00am–5:30pm; Sat 9:00am–1:00pm",
        businessAddress: `${12 + index * 4} Harbour Street, ${client.suburb} ${client.state} ${client.postcode}, Australia`,
        phone: `+61 2 9${String(400 + index).padStart(3, "0")} ${String(1200 + index * 17).padStart(4, "0")}`,
        email: `hello@${client.slug}.example`,
        latitude: -33.87 + index * 0.01,
        longitude: 151.19 + index * 0.01,
        placeCategory: client.businessType === "restaurant_cafe" ? "Cafe" : "Dentist",
        structuredAddress: {
          countryCode: "AU",
          postcode: client.postcode,
          suburb: client.suburb,
          stateRegion: client.state,
          unit: "",
          streetNumber: String(12 + index * 4),
          streetName: "Harbour",
          streetType: "St",
        },
        structuredPhone: {
          countryCallingCode: "61",
          nationalNumber: `2 9${String(400 + index).padStart(3, "0")} ${String(1200 + index * 17).padStart(4, "0")}`,
        },
        abn: `51 000 00${String(80 + index).padStart(3, "0")}`,
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
        stagingFixture: {
          fixtureKey: stagingSalesClientFixtureKey(client.slug),
          testOnly: true,
          city: client.city,
          suburb: client.suburb,
          timezone: "Australia/Sydney",
          serviceTier:
            client.packageId === "starter"
              ? "Starter"
              : client.packageId === "growth"
                ? "Growth"
                : "Managed",
          addons: [],
          identifiers: {
            domain: `${client.slug}.example`,
            abnLike: `51 000 00${String(80 + index).padStart(3, "0")}`,
            notice: "TEST ONLY — not a registered business identifier",
          },
          goals: ["Grow local awareness", "Increase booked enquiries"],
          menuHighlights: [],
          serviceDetails: client.services,
          monthlyAdCapAud: serviceOptions.monthlyAdCapAud,
          connectors: [],
        },
      } as CompanyProfile,
      documents: [],
      createdAt: STAGING_FIXTURE_TIMESTAMP,
      updatedAt: STAGING_FIXTURE_TIMESTAMP,
    };
  });

  const memberships: TenantMember[] = [
    {
      tenantId: STAGING_FIXTURE_TENANT_ID,
      userId: STAGING_SALES_USER_ID,
      role: "member",
      roleTitle: "sales_rep",
      createdAt: STAGING_FIXTURE_TIMESTAMP,
    },
    ...approvers.map(
      (a): TenantMember => ({
        tenantId: STAGING_FIXTURE_TENANT_ID,
        userId: a.id,
        role: "member",
        roleTitle: "approver",
        portalOnly: true,
        createdAt: STAGING_FIXTURE_TIMESTAMP,
      }),
    ),
  ];

  const access: CompanyAccess[] = [
    ...companies.map((c) => ({
      userId: STAGING_SALES_USER_ID,
      companyId: c.id,
    })),
    ...approvers.map((a, index) => ({
      userId: a.id,
      companyId: companies[index]!.id,
    })),
  ];

  return {
    fixtureKey: STAGING_SALES_FIXTURE_KEY,
    tenantId: STAGING_FIXTURE_TENANT_ID,
    salesUser,
    approvers,
    memberships,
    companies,
    access,
  };
}
