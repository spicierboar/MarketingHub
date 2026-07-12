// GBP local audit (V1 module 6) — NAP, hours, categories, photos, FAQ checklist
// against the connected Google Business Profile. Deterministic simulation when
// PUBLISHING_LIVE / Google OAuth is off; live fetch when gated on.

import { decryptToken } from "@/lib/crypto";
import { resolveBusinessType } from "@/lib/business-profiles";
import { liveIntegrationsAllowed } from "@/lib/env";
import type {
  Company,
  LocalAreaProfile,
  PublishingIntegration,
} from "@/lib/types";

// ---- types -------------------------------------------------------------------

export type GbpAuditCategory = "nap" | "hours" | "categories" | "photos" | "faq" | "connect";

export type GbpAuditStatus = "pass" | "fail" | "warn" | "info";

export interface GbpAuditCheck {
  id: string;
  category: GbpAuditCategory;
  title: string;
  status: GbpAuditStatus;
  detail: string;
  fixAction: string;
  fixHref?: string;
}

export interface GbpProfileSnapshot {
  businessName: string;
  addressLines: string[];
  phone?: string;
  website?: string;
  hoursSummary?: string;
  primaryCategory?: string;
  additionalCategories: string[];
  photoCount: number;
  faqCount: number;
  source: "live" | "simulated" | "disconnected";
}

export interface CanonicalGbpExpectations {
  businessName: string;
  addressLines: string[];
  phone?: string;
  website?: string;
  hoursSummary?: string;
  suggestedPrimaryCategory?: string;
  suggestedCategories: string[];
  googleBusinessUrl?: string;
}

export interface GbpAuditInput {
  company: Company;
  integration?: PublishingIntegration;
  localProfile?: LocalAreaProfile;
  approvedPhotoCount?: number;
  faqItemCount?: number;
}

export interface GbpAuditResult {
  companyId: string;
  ranAt: string;
  mode: "live" | "simulated";
  gbpConnected: boolean;
  score: number;
  checks: GbpAuditCheck[];
  snapshot: GbpProfileSnapshot;
  canonical: CanonicalGbpExpectations;
}

// ---- live gate ---------------------------------------------------------------

/** True when live GBP Business Information API reads are permitted. */
export function gbpAuditLive(): boolean {
  return (
    liveIntegrationsAllowed() &&
    process.env.PUBLISHING_LIVE === "true" &&
    !!process.env.PUBLISHING_TOKEN_KEY &&
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
}

export function isGbpIntegration(
  integration: PublishingIntegration | undefined,
): integration is PublishingIntegration {
  return (
    !!integration &&
    integration.status === "connected" &&
    integration.platform.toLowerCase().includes("google")
  );
}

// ---- canonical profile (ground truth from company data) ----------------------

const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function normaliseText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractPhone(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(PHONE_RE);
  return m?.[0]?.replace(/\s+/g, " ").trim();
}

function googleBusinessUrl(company: Company): string | undefined {
  return company.profile.socialLinks?.find(
    (l) => l.platform === "google_business" && l.url.trim(),
  )?.url;
}

function hoursFromProfile(company: Company): string | undefined {
  const p = company.profile;
  const restaurant = p.restaurant;
  if (restaurant?.peakServicePeriods?.length) {
    return restaurant.peakServicePeriods.join("; ");
  }
  const hotel = p.hotel;
  if (hotel?.packages?.length) {
    return `Packages: ${hotel.packages.slice(0, 2).join(", ")}`;
  }
  return undefined;
}

function categoriesFromProfile(company: Company): {
  primary?: string;
  additional: string[];
} {
  const p = company.profile;
  const type = resolveBusinessType(company);
  const primary =
    p.industry?.trim() ||
    p.natureOfBusiness?.trim() ||
    (type === "restaurant_cafe" ? "Cafe" : undefined) ||
    (type === "hotel" ? "Hotel" : undefined) ||
    (type === "retail" ? "Grocery store" : undefined);

  const additional = [
    ...(p.services ?? []).slice(0, 3),
    ...(p.retail?.productCategories ?? []).slice(0, 2),
    ...(p.hotel?.amenities ?? []).slice(0, 2),
  ].filter(Boolean);

  return { primary, additional };
}

/** Build the canonical GBP expectations from company profile + local intelligence. */
export function buildCanonicalGbp(
  company: Company,
  localProfile?: LocalAreaProfile,
): CanonicalGbpExpectations {
  const p = company.profile;
  const businessName =
    p.tradingNames?.trim() || p.legalName?.trim() || company.name.trim();

  const addressLines = [
    ...new Set([
      ...(p.serviceAreas ?? []),
      ...(localProfile?.suburbs ?? []),
    ]),
  ].filter(Boolean);

  const cats = categoriesFromProfile(company);

  return {
    businessName,
    addressLines,
    phone: extractPhone(p.approvalContact),
    website: p.website?.trim() || undefined,
    hoursSummary: hoursFromProfile(company),
    suggestedPrimaryCategory: cats.primary,
    suggestedCategories: cats.additional,
    googleBusinessUrl: googleBusinessUrl(company),
  };
}

// ---- simulated / live GBP snapshot -------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic GBP profile for demo / offline audit. When connected, simulates
 * a fetched listing with intentional gaps proportional to profile completeness.
 */
export function simulateGbpSnapshot(
  company: Company,
  canonical: CanonicalGbpExpectations,
  integration?: PublishingIntegration,
): GbpProfileSnapshot {
  if (!isGbpIntegration(integration)) {
    return {
      businessName: "",
      addressLines: [],
      additionalCategories: [],
      photoCount: 0,
      faqCount: 0,
      source: "disconnected",
    };
  }

  const h = simpleHash(company.id);
  const completeness =
    (canonical.businessName ? 1 : 0) +
    (canonical.addressLines.length > 0 ? 1 : 0) +
    (canonical.website ? 1 : 0) +
    (canonical.hoursSummary ? 1 : 0) +
    (canonical.suggestedPrimaryCategory ? 1 : 0);

  const nameDrift =
    completeness >= 4 && h % 7 === 0
      ? `${canonical.businessName} — Local`
      : canonical.businessName;

  const addressDrop = canonical.addressLines.length > 1 && h % 4 === 0 ? 1 : 0;
  const addressLines = canonical.addressLines.slice(
    0,
    Math.max(1, canonical.addressLines.length - addressDrop),
  );

  const hoursMissing = canonical.hoursSummary && h % 5 === 1;
  const phoneMissing = canonical.phone && h % 3 === 0;
  const categoryThin =
    canonical.suggestedCategories.length > 1 && h % 6 === 2
      ? canonical.suggestedCategories.slice(0, 1)
      : canonical.suggestedCategories;

  const basePhotos = Math.min(8, Math.max(1, completeness + (h % 3)));
  const photoCount = completeness >= 4 ? Math.max(2, basePhotos - (h % 3)) : basePhotos - 2;
  const faqCount = completeness >= 3 ? h % 4 : h % 2;

  return {
    businessName: nameDrift,
    addressLines,
    phone: phoneMissing ? undefined : canonical.phone,
    website: canonical.website,
    hoursSummary: hoursMissing ? undefined : canonical.hoursSummary,
    primaryCategory: canonical.suggestedPrimaryCategory,
    additionalCategories: categoryThin,
    photoCount: Math.max(0, photoCount),
    faqCount: Math.max(0, faqCount),
    source: "simulated",
  };
}

/** Live GBP Business Information read (returns null on failure → caller falls back). */
export async function fetchLiveGbpSnapshot(
  integration: PublishingIntegration,
): Promise<GbpProfileSnapshot | null> {
  if (!gbpAuditLive() || !isGbpIntegration(integration)) return null;

  let token: string;
  try {
    token = decryptToken(integration.encryptedToken);
  } catch {
    return null;
  }

  const parent = integration.accountName.trim();
  if (!parent || !parent.includes("locations/")) return null;

  try {
    const res = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${parent}?readMask=name,title,phoneNumbers,websiteUri,categories,regularHours,profile`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title?: string;
      phoneNumbers?: { primaryPhone?: string };
      websiteUri?: string;
      categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: { displayName?: string }[] };
      regularHours?: { periods?: unknown[] };
      profile?: { description?: string };
    };

    const hoursCount = data.regularHours?.periods?.length ?? 0;
    return {
      businessName: data.title ?? "",
      addressLines: [parent],
      phone: data.phoneNumbers?.primaryPhone,
      website: data.websiteUri,
      hoursSummary: hoursCount > 0 ? `${hoursCount} periods configured` : undefined,
      primaryCategory: data.categories?.primaryCategory?.displayName,
      additionalCategories:
        data.categories?.additionalCategories?.map((c) => c.displayName ?? "").filter(Boolean) ??
        [],
      photoCount: 0,
      faqCount: 0,
      source: "live",
    };
  } catch {
    return null;
  }
}

// ---- audit checks ------------------------------------------------------------

function scoreChecks(checks: GbpAuditCheck[]): number {
  if (checks.length === 0) return 0;
  let pts = 0;
  for (const c of checks) {
    if (c.status === "pass") pts += 1;
    else if (c.status === "warn") pts += 0.5;
    else if (c.status === "info") pts += 0.75;
  }
  return Math.round((pts / checks.length) * 100);
}

function namesAlign(a: string, b: string): boolean {
  const na = normaliseText(a);
  const nb = normaliseText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function addressesOverlap(
  canonical: string[],
  gbp: string[],
): boolean {
  if (canonical.length === 0 || gbp.length === 0) return false;
  const norm = (s: string) => normaliseText(s);
  return canonical.some((c) => gbp.some((g) => norm(c).includes(norm(g)) || norm(g).includes(norm(c))));
}

function auditConnect(
  integration: PublishingIntegration | undefined,
  mode: "live" | "simulated",
): GbpAuditCheck {
  if (!isGbpIntegration(integration)) {
    return {
      id: "connect_gbp",
      category: "connect",
      title: "Google Business Profile connected",
      status: "fail",
      detail: "No active GBP OAuth integration for this company.",
      fixAction: "Connect Google Business Profile via OAuth or send a client connect link.",
      fixHref: "/publishing",
    };
  }
  return {
    id: "connect_gbp",
    category: "connect",
    title: "Google Business Profile connected",
    status: "pass",
    detail: `Connected as ${integration.accountName} (${mode} audit).`,
    fixAction: "Re-authorise if the listing was transferred or permissions changed.",
    fixHref: "/publishing",
  };
}

function auditNap(
  canonical: CanonicalGbpExpectations,
  snapshot: GbpProfileSnapshot,
  companyId: string,
): GbpAuditCheck[] {
  const checks: GbpAuditCheck[] = [];

  checks.push({
    id: "nap_name",
    category: "nap",
    title: "Business name (NAP)",
    status:
      snapshot.source === "disconnected"
        ? canonical.businessName
          ? "warn"
          : "fail"
        : namesAlign(canonical.businessName, snapshot.businessName)
          ? "pass"
          : "fail",
    detail:
      snapshot.source === "disconnected"
        ? canonical.businessName
          ? `Profile name "${canonical.businessName}" — connect GBP to verify listing.`
          : "No trading or legal name on the company profile."
        : `Profile: "${canonical.businessName}" · GBP: "${snapshot.businessName}"`,
    fixAction: canonical.businessName
      ? "Align GBP listing title with approved trading name; avoid keyword stuffing."
      : "Add legal or trading name on the company profile.",
    fixHref: `/companies/${companyId}`,
  });

  checks.push({
    id: "nap_address",
    category: "nap",
    title: "Address / service area",
    status:
      canonical.addressLines.length === 0
        ? "fail"
        : snapshot.source === "disconnected"
          ? "warn"
          : addressesOverlap(canonical.addressLines, snapshot.addressLines)
            ? "pass"
            : "fail",
    detail:
      canonical.addressLines.length === 0
        ? "No service areas or suburbs documented."
        : `Profile areas: ${canonical.addressLines.slice(0, 3).join(", ")}${
            canonical.addressLines.length > 3 ? "…" : ""
          } · GBP: ${snapshot.addressLines.join(", ") || "—"}`,
    fixAction: "Ensure GBP address matches physical location; add service areas to the profile.",
    fixHref: `/companies/${companyId}/brand-brain`,
  });

  checks.push({
    id: "nap_website",
    category: "nap",
    title: "Website URL",
    status: !canonical.website
      ? "fail"
      : !snapshot.website
        ? snapshot.source === "disconnected"
          ? "warn"
          : "fail"
        : normaliseText(canonical.website) === normaliseText(snapshot.website)
          ? "pass"
          : "warn",
    detail: `Profile: ${canonical.website ?? "missing"} · GBP: ${snapshot.website ?? "missing"}`,
    fixAction: "Add the canonical website on both the profile and GBP listing.",
    fixHref: `/companies/${companyId}`,
  });

  checks.push({
    id: "nap_phone",
    category: "nap",
    title: "Phone number",
    status: !canonical.phone
      ? "warn"
      : !snapshot.phone
        ? snapshot.source === "disconnected"
          ? "info"
          : "fail"
        : "pass",
    detail: `Profile contact: ${canonical.phone ?? "not captured"} · GBP: ${snapshot.phone ?? "not listed"}`,
    fixAction: "Add a local phone number to GBP and the approval contact field.",
    fixHref: `/companies/${companyId}`,
  });

  if (!canonical.googleBusinessUrl) {
    checks.push({
      id: "nap_gbp_url",
      category: "nap",
      title: "Google Business profile link",
      status: "warn",
      detail: "No google_business URL on the company profile for reference.",
      fixAction: "Paste the public GBP / Maps URL in social profile links.",
      fixHref: `/companies/${companyId}`,
    });
  } else {
    checks.push({
      id: "nap_gbp_url",
      category: "nap",
      title: "Google Business profile link",
      status: "pass",
      detail: canonical.googleBusinessUrl,
      fixAction: "Keep the profile URL current if the listing is merged or renamed.",
      fixHref: `/companies/${companyId}`,
    });
  }

  return checks;
}

function auditHours(
  canonical: CanonicalGbpExpectations,
  snapshot: GbpProfileSnapshot,
  companyId: string,
): GbpAuditCheck[] {
  const documented = !!canonical.hoursSummary;
  const onGbp = !!snapshot.hoursSummary;

  return [
    {
      id: "hours_documented",
      category: "hours",
      title: "Hours documented in profile",
      status: documented ? "pass" : "fail",
      detail: documented
        ? canonical.hoursSummary!
        : "No service hours or peak periods in the company profile.",
      fixAction:
        "Add peak service periods (restaurant) or check-in/out times (hotel) on the profile.",
      fixHref: `/companies/${companyId}`,
    },
    {
      id: "hours_on_gbp",
      category: "hours",
      title: "Hours on Google Business Profile",
      status: !documented
        ? "info"
        : onGbp
          ? "pass"
          : snapshot.source === "disconnected"
            ? "warn"
            : "fail",
      detail: onGbp
        ? snapshot.hoursSummary!
        : snapshot.source === "disconnected"
          ? "Connect GBP to verify opening hours."
          : "Hours documented internally but missing on GBP.",
      fixAction: "Update GBP regular hours including holidays and special closures.",
      fixHref: "/publishing",
    },
  ];
}

function auditCategories(
  canonical: CanonicalGbpExpectations,
  snapshot: GbpProfileSnapshot,
  companyId: string,
): GbpAuditCheck[] {
  const hasPrimary = !!canonical.suggestedPrimaryCategory;
  const gbpPrimary = snapshot.primaryCategory;

  return [
    {
      id: "categories_primary",
      category: "categories",
      title: "Primary category",
      status: !hasPrimary
        ? "fail"
        : !gbpPrimary
          ? snapshot.source === "disconnected"
            ? "warn"
            : "fail"
          : namesAlign(canonical.suggestedPrimaryCategory!, gbpPrimary) ||
              normaliseText(gbpPrimary).includes(
                normaliseText(canonical.suggestedPrimaryCategory!).split(" ")[0] ?? "",
              )
            ? "pass"
            : "warn",
      detail: `Suggested: ${canonical.suggestedPrimaryCategory ?? "—"} · GBP: ${gbpPrimary ?? "—"}`,
      fixAction:
        "Choose the most specific primary category Google offers (e.g. Grocery store, Motel, Dentist).",
      fixHref: `/companies/${companyId}`,
    },
    {
      id: "categories_additional",
      category: "categories",
      title: "Additional categories",
      status:
        canonical.suggestedCategories.length >= 2 && snapshot.additionalCategories.length < 2
          ? snapshot.source === "disconnected"
            ? "info"
            : "warn"
          : canonical.suggestedCategories.length > 0
            ? "pass"
            : "warn",
      detail: `Profile services: ${canonical.suggestedCategories.slice(0, 4).join(", ") || "—"} · GBP extras: ${
        snapshot.additionalCategories.join(", ") || "—"
      }`,
      fixAction: "Add 2–4 relevant additional categories without diluting the primary.",
      fixHref: `/companies/${companyId}`,
    },
  ];
}

function auditPhotos(
  snapshot: GbpProfileSnapshot,
  approvedPhotoCount: number,
  companyId: string,
): GbpAuditCheck[] {
  const minGbp = 3;
  const gbpOk = snapshot.photoCount >= minGbp;
  const assetsOk = approvedPhotoCount >= minGbp;

  return [
    {
      id: "photos_gbp",
      category: "photos",
      title: "GBP photo count",
      status:
        snapshot.source === "disconnected"
          ? "info"
          : gbpOk
            ? "pass"
            : snapshot.photoCount > 0
              ? "warn"
              : "fail",
      detail: `${snapshot.photoCount} photos on GBP (recommend ≥${minGbp}: exterior, interior, team/product).`,
      fixAction: "Upload fresh exterior, interior, team and product photos to GBP.",
      fixHref: `/assets?company=${companyId}`,
    },
    {
      id: "photos_dam",
      category: "photos",
      title: "Approved marketing photos (DAM)",
      status: assetsOk ? "pass" : approvedPhotoCount > 0 ? "warn" : "fail",
      detail: `${approvedPhotoCount} approved image assets available to syndicate.`,
      fixAction: "Approve store photos in the asset library for GBP and social use.",
      fixHref: `/assets?company=${companyId}`,
    },
  ];
}

function auditFaq(
  snapshot: GbpProfileSnapshot,
  faqItemCount: number,
  companyId: string,
): GbpAuditCheck[] {
  const minFaq = 2;
  return [
    {
      id: "faq_content",
      category: "faq",
      title: "FAQ content in library",
      status: faqItemCount >= minFaq ? "pass" : faqItemCount > 0 ? "warn" : "fail",
      detail: `${faqItemCount} FAQ / Q&A content items (recommend ≥${minFaq} for AI search readiness).`,
      fixAction: "Draft FAQs in Studio (type FAQ) covering hours, parking, services and offers.",
      fixHref: `/studio?company=${companyId}`,
    },
    {
      id: "faq_gbp",
      category: "faq",
      title: "Q&A on Google Business Profile",
      status:
        snapshot.source === "disconnected"
          ? "info"
          : snapshot.faqCount >= minFaq
            ? "pass"
            : snapshot.faqCount > 0
              ? "warn"
              : "fail",
      detail: `${snapshot.faqCount} Q&A entries on GBP (owner-seeded answers improve local SEO).`,
      fixAction: "Seed GBP Q&A with approved answers; monitor for user questions weekly.",
      fixHref: "/publishing",
    },
  ];
}

// ---- main entry --------------------------------------------------------------

export async function runGbpAudit(input: GbpAuditInput): Promise<GbpAuditResult> {
  const { company, integration, localProfile } = input;
  const canonical = buildCanonicalGbp(company, localProfile);
  const gbpConnected = isGbpIntegration(integration);

  let mode: "live" | "simulated" = "simulated";
  let snapshot: GbpProfileSnapshot;

  if (gbpAuditLive() && gbpConnected) {
    const live = await fetchLiveGbpSnapshot(integration);
    if (live) {
      snapshot = live;
      mode = "live";
    } else {
      snapshot = simulateGbpSnapshot(company, canonical, integration);
    }
  } else {
    snapshot = simulateGbpSnapshot(company, canonical, integration);
  }

  const approvedPhotoCount = input.approvedPhotoCount ?? 0;
  const faqItemCount = input.faqItemCount ?? 0;

  const checks: GbpAuditCheck[] = [
    auditConnect(integration, mode),
    ...auditNap(canonical, snapshot, company.id),
    ...auditHours(canonical, snapshot, company.id),
    ...auditCategories(canonical, snapshot, company.id),
    ...auditPhotos(snapshot, approvedPhotoCount, company.id),
    ...auditFaq(snapshot, faqItemCount, company.id),
  ];

  return {
    companyId: company.id,
    ranAt: new Date().toISOString(),
    mode,
    gbpConnected,
    score: scoreChecks(checks),
    checks,
    snapshot,
    canonical,
  };
}

/** Load audit inputs for a company (tenant-pinned list calls). */
export async function buildGbpAuditForCompany(
  company: Company,
  deps: {
    integration?: PublishingIntegration;
    localProfile?: LocalAreaProfile;
    approvedPhotoCount?: number;
    faqItemCount?: number;
  },
): Promise<GbpAuditResult> {
  return runGbpAudit({
    company,
    integration: deps.integration,
    localProfile: deps.localProfile,
    approvedPhotoCount: deps.approvedPhotoCount,
    faqItemCount: deps.faqItemCount,
  });
}
