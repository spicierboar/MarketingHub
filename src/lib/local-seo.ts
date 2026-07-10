// Local SEO (M51 / W7 module 11) — suburb landing briefs, schema markup
// recommendations, governed factual Q&A draft payloads, and a combined local
// SEO score (GBP audit + landing/schema readiness). Deterministic simulation
// when LOCAL_SEO_LIVE is off; live enrichment when gated on.

import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { buildCanonicalGbp, type GbpAuditResult } from "@/lib/gbp-audit";
import { resolveBusinessType } from "@/lib/business-profiles";
import { createContent } from "@/lib/db";
import { localSeoLive } from "@/lib/local-seo-connectors";
import { routeContent } from "@/lib/routing";
import type { Company, ContentItem, GroundingLabel, LocalAreaProfile } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export type LocalLandingStatus = "ready" | "needs_work" | "missing";

export interface LocalLandingBrief {
  id: string;
  suburb: string;
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  sections: { heading: string; bullets: string[] }[];
  primaryCta: string;
  status: LocalLandingStatus;
  readinessScore: number;
  fixAction?: string;
}

export type SchemaMarkupType =
  | "LocalBusiness"
  | "Restaurant"
  | "Hotel"
  | "FAQPage";

export type SchemaReadiness = "ready" | "partial" | "missing";

export interface SchemaMarkupRecommendation {
  id: string;
  schemaType: SchemaMarkupType;
  title: string;
  readiness: SchemaReadiness;
  requiredFields: string[];
  missingFields: string[];
  jsonLdPreview: string;
  fixAction: string;
  fixHref?: string;
}

export interface LocalSeoQaDraftSpec {
  id: string;
  question: string;
  answer: string;
  topic: string;
  grounding: GroundingLabel;
  factualBasis: string;
  /** Populated after spawnLocalSeoQaDraft succeeds. */
  contentId?: string;
}

export interface LocalSeoScoreBreakdown {
  overall: number;
  gbpComponent: number;
  landingComponent: number;
  schemaComponent: number;
  weights: { gbp: number; landing: number; schema: number };
}

export interface LocalSeoInput {
  company: Company;
  localProfile?: LocalAreaProfile;
  gbpAudit: GbpAuditResult;
}

export interface LocalSeoReport {
  companyId: string;
  ranAt: string;
  mode: "live" | "simulated";
  score: LocalSeoScoreBreakdown;
  landingBriefs: LocalLandingBrief[];
  schemaRecommendations: SchemaMarkupRecommendation[];
  qaDrafts: LocalSeoQaDraftSpec[];
}

// ---- helpers -----------------------------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function slugify(suburb: string): string {
  return suburb
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function businessDisplayName(company: Company): string {
  return (
    company.profile.tradingNames?.trim() ||
    company.profile.legalName?.trim() ||
    company.name.trim()
  );
}

function collectSuburbs(company: Company, localProfile?: LocalAreaProfile): string[] {
  const merged = [
    ...(localProfile?.suburbs ?? []),
    ...(company.profile.serviceAreas ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(merged)].slice(0, 6);
}

function primarySchemaType(company: Company): SchemaMarkupType {
  const type = resolveBusinessType(company);
  if (type === "restaurant_cafe") return "Restaurant";
  if (type === "hotel") return "Hotel";
  return "LocalBusiness";
}

function landingStatus(
  suburb: string,
  company: Company,
  live: boolean,
): { status: LocalLandingStatus; score: number; fixAction?: string } {
  const h = simpleHash(`${company.id}:${suburb}`);
  const hasWebsite = !!company.profile.website?.trim();
  const hasServices = (company.profile.services ?? []).length > 0;
  const hasSearchTerms = (company.profile.serviceAreas ?? []).length > 0;

  if (!hasWebsite) {
    return {
      status: "missing",
      score: 15,
      fixAction: "Add a canonical website URL before publishing suburb landing pages.",
    };
  }

  const base =
    (hasWebsite ? 40 : 0) + (hasServices ? 30 : 0) + (hasSearchTerms ? 20 : 0);
  const drift = live ? 0 : h % 3 === 0 ? 15 : 0;
  const score = Math.min(100, Math.max(20, base - drift + (h % 10)));

  if (score >= 75) return { status: "ready", score };
  if (score >= 45) {
    return {
      status: "needs_work",
      score,
      fixAction: `Add suburb-specific proof points, offers and internal links for ${suburb}.`,
    };
  }
  return {
    status: "missing",
    score,
    fixAction: `Draft a dedicated ${suburb} landing page in CMS with NAP, services and FAQ.`,
  };
}

// ---- landing briefs ----------------------------------------------------------

export function buildLocalLandingBriefs(
  company: Company,
  localProfile?: LocalAreaProfile,
): LocalLandingBrief[] {
  const suburbs = collectSuburbs(company, localProfile);
  if (suburbs.length === 0) {
    return [
      {
        id: "landing_none",
        suburb: "(no suburbs documented)",
        slug: "",
        title: "",
        metaDescription: "",
        h1: "",
        sections: [],
        primaryCta: company.profile.callsToAction[0] ?? "Contact us",
        status: "missing",
        readinessScore: 0,
        fixAction:
          "Add service areas or local intelligence suburbs on Brand Brain / local profile.",
      },
    ];
  }

  const name = businessDisplayName(company);
  const live = localSeoLive();
  const services = (company.profile.services ?? []).slice(0, 4);
  const searchTerms = (localProfile?.searchTerms ?? []).slice(0, 3);
  const cta = company.profile.callsToAction[0] ?? "Get in touch";

  return suburbs.map((suburb, i) => {
    const slug = slugify(suburb);
    const { status, score, fixAction } = landingStatus(suburb, company, live);
    const term = searchTerms[i % Math.max(1, searchTerms.length)] ?? services[0] ?? name;

    return {
      id: `landing_${slug || i}`,
      suburb,
      slug,
      title: `${name} in ${suburb} — ${term}`,
      metaDescription: `${name} serves ${suburb} with ${services.join(", ") || "local expertise"}. ${cta}.`,
      h1: `${name} — trusted in ${suburb}`,
      sections: [
        {
          heading: "Why locals choose us",
          bullets: [
            `Serving ${suburb} and nearby areas`,
            ...(services.length ? services.map((s) => `Specialising in ${s}`) : ["Personalised local service"]),
            localProfile?.commonNeeds
              ? `Common need: ${localProfile.commonNeeds}`
              : "Answers to the questions your neighbours ask most",
          ],
        },
        {
          heading: "Plan your visit",
          bullets: [
            company.profile.website ? `Website: ${company.profile.website}` : "Add website for directions CTA",
            ...(company.profile.serviceAreas?.includes(suburb)
              ? [`Listed service area: ${suburb}`]
              : [`Expand service area to include ${suburb}`]),
          ],
        },
      ],
      primaryCta: cta,
      status,
      readinessScore: score,
      fixAction,
    };
  });
}

// ---- schema recommendations --------------------------------------------------

function buildJsonLdPreview(
  schemaType: SchemaMarkupType,
  company: Company,
  canonical: ReturnType<typeof buildCanonicalGbp>,
): string {
  const name = businessDisplayName(company);
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType === "FAQPage" ? "FAQPage" : schemaType,
    name,
    url: canonical.website,
    telephone: canonical.phone,
    address: canonical.addressLines[0]
      ? { "@type": "PostalAddress", streetAddress: canonical.addressLines[0] }
      : undefined,
  };

  if (schemaType === "Restaurant") {
    base.servesCuisine =
      company.profile.restaurant?.cuisineStyle ?? company.profile.industry;
    base.acceptsReservations = true;
  }
  if (schemaType === "Hotel") {
    base.amenityFeature = (company.profile.hotel?.amenities ?? []).slice(0, 3);
  }
  if (schemaType === "FAQPage") {
    base.mainEntity = [
      {
        "@type": "Question",
        name: "What are your opening hours?",
        acceptedAnswer: { "@type": "Answer", text: canonical.hoursSummary ?? "Contact us for hours." },
      },
    ];
  }

  return JSON.stringify(base, null, 2);
}

function schemaFieldGaps(
  schemaType: SchemaMarkupType,
  company: Company,
  canonical: ReturnType<typeof buildCanonicalGbp>,
): { required: string[]; missing: string[] } {
  const required =
    schemaType === "FAQPage"
      ? ["mainEntity", "Question", "Answer"]
      : ["name", "url", "telephone", "address"];

  const missing: string[] = [];
  if (!canonical.businessName) missing.push("name");
  if (!canonical.website) missing.push("url");
  if (!canonical.phone) missing.push("telephone");
  if (canonical.addressLines.length === 0) missing.push("address");
  if (schemaType === "Restaurant" && !company.profile.restaurant && !company.profile.industry) {
    missing.push("servesCuisine");
  }
  if (schemaType === "Hotel" && !(company.profile.hotel?.amenities?.length)) {
    missing.push("amenityFeature");
  }
  if (schemaType === "FAQPage" && !canonical.hoursSummary) {
    missing.push("mainEntity (hours FAQ)");
  }

  return { required, missing };
}

export function buildSchemaRecommendations(
  company: Company,
  localProfile: LocalAreaProfile | undefined,
  gbpAudit: GbpAuditResult,
): SchemaMarkupRecommendation[] {
  const canonical = buildCanonicalGbp(company, localProfile);
  const primary = primarySchemaType(company);
  const companyId = company.id;
  const types: SchemaMarkupType[] = [primary, "FAQPage"];

  return types.map((schemaType) => {
    const { required, missing } = schemaFieldGaps(schemaType, company, canonical);
    const readiness: SchemaReadiness =
      missing.length === 0 ? "ready" : missing.length <= 2 ? "partial" : "missing";

    const gbpHint =
      gbpAudit.gbpConnected && gbpAudit.score < 70
        ? " Fix GBP checklist gaps to align NAP with schema."
        : "";

    return {
      id: `schema_${schemaType.toLowerCase()}`,
      schemaType,
      title: `${schemaType} JSON-LD`,
      readiness,
      requiredFields: required,
      missingFields: missing,
      jsonLdPreview: buildJsonLdPreview(schemaType, company, canonical),
      fixAction:
        missing.length === 0
          ? `Embed validated ${schemaType} JSON-LD on the homepage and suburb landing pages.${gbpHint}`
          : `Complete missing fields: ${missing.join(", ")}.${gbpHint}`,
      fixHref:
        schemaType === "FAQPage"
          ? `/studio?company=${companyId}`
          : `/companies/${companyId}`,
    };
  });
}

// ---- Q&A draft specs ---------------------------------------------------------

function qaTemplates(company: Company, localProfile?: LocalAreaProfile): Omit<LocalSeoQaDraftSpec, "id">[] {
  const name = businessDisplayName(company);
  const type = resolveBusinessType(company);
  const suburbs = collectSuburbs(company, localProfile);
  const suburb = suburbs[0] ?? "the local area";
  const canonical = buildCanonicalGbp(company, localProfile);
  const cta = company.profile.callsToAction[0] ?? "contact us";

  const common: Omit<LocalSeoQaDraftSpec, "id">[] = [
    {
      question: `Does ${name} serve ${suburb}?`,
      answer: `Yes — ${name} serves ${suburb}${suburbs.length > 1 ? ` and nearby areas including ${suburbs.slice(1, 3).join(", ")}` : ""}. ${cta}.`,
      topic: "service area",
      grounding: suburbs.length > 0 ? "grounded" : "requires_evidence",
      factualBasis: "Company service areas and local intelligence suburbs",
    },
    {
      question: `What are the opening hours for ${name}?`,
      answer: canonical.hoursSummary
        ? `${name} hours: ${canonical.hoursSummary}. Please check our website or call before visiting on public holidays.`
        : `Please ${cta} for current opening hours — we will confirm peak periods and holiday closures.`,
      topic: "hours",
      grounding: canonical.hoursSummary ? "grounded" : "requires_evidence",
      factualBasis: "Company profile hours / peak periods",
    },
    {
      question: `How do I contact ${name}?`,
      answer: [
        canonical.phone ? `Phone: ${canonical.phone}.` : null,
        canonical.website ? `Website: ${canonical.website}.` : null,
        `You can also ${cta}.`,
      ]
        .filter(Boolean)
        .join(" "),
      topic: "contact",
      grounding: canonical.phone || canonical.website ? "grounded" : "suggested_by_ai",
      factualBasis: "NAP fields from company profile",
    },
  ];

  if (type === "restaurant_cafe") {
    const peak = company.profile.restaurant?.peakServicePeriods?.[0];
    common.push({
      question: `Does ${name} take reservations?`,
      answer: peak
        ? `${name} peak service: ${peak}. Please ${cta} to reserve, especially on weekends.`
        : `Reservations depend on peak periods — please ${cta} to book a table in ${suburb}.`,
      topic: "reservations",
      grounding: peak ? "grounded" : "suggested_by_ai",
      factualBasis: "Restaurant profile peak service periods",
    });
  }

  if (type === "hotel") {
    common.push({
      question: `What amenities does ${name} offer?`,
      answer:
        (company.profile.hotel?.amenities?.length ?? 0) > 0
          ? `Amenities include ${company.profile.hotel!.amenities!.slice(0, 5).join(", ")}.`
          : `Please ${cta} for the latest room amenities and packages.`,
      topic: "amenities",
      grounding: (company.profile.hotel?.amenities?.length ?? 0) > 0 ? "grounded" : "requires_evidence",
      factualBasis: "Hotel profile amenities",
    });
  }

  if (localProfile?.commonNeeds?.trim()) {
    common.push({
      question: `Can ${name} help with ${localProfile.commonNeeds.split(/[.;]/)[0]?.trim() ?? "local needs"}?`,
      answer: `${name} supports locals with ${localProfile.commonNeeds.trim()}. ${cta} to discuss your situation.`,
      topic: "local needs",
      grounding: "grounded",
      factualBasis: "Local intelligence common needs",
    });
  }

  return common.slice(0, 6);
}

export function buildLocalSeoQaDrafts(
  company: Company,
  localProfile?: LocalAreaProfile,
): LocalSeoQaDraftSpec[] {
  return qaTemplates(company, localProfile).map((t, i) => ({
    ...t,
    id: `qa_${slugify(t.topic) || i}`,
  }));
}

// ---- governed draft spawn ----------------------------------------------------

export function formatQaDraftBody(draft: LocalSeoQaDraftSpec, company: Company): string {
  return [
    `Q: ${draft.question}`,
    "",
    `A: ${draft.answer}`,
    "",
    `— ${businessDisplayName(company)} · Local SEO factual Q&A`,
    `Basis: ${draft.factualBasis}`,
  ].join("\n");
}

/** Persist a governed ai_draft FAQ row (never auto-published). */
export async function spawnLocalSeoQaDraft(args: {
  company: Company;
  draft: LocalSeoQaDraftSpec;
  userId: string;
}): Promise<ContentItem> {
  const { company, draft, userId } = args;
  const body = formatQaDraftBody(draft, company);
  const compliance = await checkCompliance(body, company);
  const claimAudit = await auditClaims(body, company);
  const routedTo = routeContent({ type: "faq", compliance, claimAudit });
  const groundingLabel: GroundingLabel = draft.grounding;

  return createContent({
    companyId: company.id,
    requestId: null,
    campaignId: null,
    campaignItemId: null,
    type: "faq",
    title: draft.question,
    body,
    status: "ai_draft",
    createdById: userId,
    compliance,
    claimAudit,
    groundingLabel,
    routedTo,
    sourceRefs: [],
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 10),
    aiModel: localSeoLive() ? "local-seo-live" : "local-seo-template",
    aiPrompt: `Local SEO Q&A: ${draft.topic}`,
    sourcesUsed: [`Local SEO: ${draft.factualBasis}`],
  });
}

// ---- score -------------------------------------------------------------------

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeLocalSeoScore(
  gbpAudit: GbpAuditResult,
  landingBriefs: LocalLandingBrief[],
  schemaRecs: SchemaMarkupRecommendation[],
): LocalSeoScoreBreakdown {
  const weights = { gbp: 0.5, landing: 0.25, schema: 0.25 };

  const gbpComponent = gbpAudit.score;
  const landingComponent = average(landingBriefs.map((b) => b.readinessScore));
  const schemaComponent = average(
    schemaRecs.map((r) =>
      r.readiness === "ready" ? 100 : r.readiness === "partial" ? 60 : 25,
    ),
  );

  const overall = Math.round(
    gbpComponent * weights.gbp +
      landingComponent * weights.landing +
      schemaComponent * weights.schema,
  );

  return {
    overall,
    gbpComponent,
    landingComponent,
    schemaComponent,
    weights,
  };
}

// ---- main entry --------------------------------------------------------------

export function buildLocalSeoReport(input: LocalSeoInput): LocalSeoReport {
  const { company, localProfile, gbpAudit } = input;
  const landingBriefs = buildLocalLandingBriefs(company, localProfile);
  const schemaRecommendations = buildSchemaRecommendations(
    company,
    localProfile,
    gbpAudit,
  );
  const qaDrafts = buildLocalSeoQaDrafts(company, localProfile);
  const score = computeLocalSeoScore(gbpAudit, landingBriefs, schemaRecommendations);

  return {
    companyId: company.id,
    ranAt: new Date().toISOString(),
    mode: localSeoLive() ? "live" : "simulated",
    score,
    landingBriefs,
    schemaRecommendations,
    qaDrafts,
  };
}

export async function buildLocalSeoForCompany(
  company: Company,
  deps: {
    localProfile?: LocalAreaProfile;
    gbpAudit: GbpAuditResult;
  },
): Promise<LocalSeoReport> {
  return buildLocalSeoReport({
    company,
    localProfile: deps.localProfile,
    gbpAudit: deps.gbpAudit,
  });
}
