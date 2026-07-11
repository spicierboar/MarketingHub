// AI discovery (GEO) — improve odds of being named in ChatGPT / Gemini /
// Perplexity answers. Never a guarantee; readiness + prompt pack + manual
// mention scorecard. Stored on companies.profile.aiDiscovery (jsonb).

import type { GbpAuditResult } from "@/lib/gbp-audit";
import type { LocalSeoReport } from "@/lib/local-seo";
import type {
  AiDiscoveryCheckStatus,
  AiDiscoveryDirectoryFlags,
  AiDiscoveryMentionResult,
  AiDiscoveryObservationRow,
  AiDiscoveryPlatform,
  AiDiscoveryScorecard,
  Company,
  CompanyReview,
} from "@/lib/types";

export const AI_DISCOVERY_PLATFORMS: {
  id: AiDiscoveryPlatform;
  label: string;
}[] = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
];

export const AI_DISCOVERY_DISCLAIMER =
  "We improve AI discovery odds — we do not control ChatGPT, Gemini, or Perplexity, and we never promise a mention.";

export interface AiDiscoveryPrompt {
  id: string;
  text: string;
  kind: "category_local" | "service_suburb" | "best_of" | "near_me";
}

export interface AiDiscoveryCheck {
  id: string;
  title: string;
  status: AiDiscoveryCheckStatus;
  detail: string;
  fixAction: string;
  fixHref?: string;
  weight: number;
}

export interface AiDiscoveryReport {
  companyId: string;
  ranAt: string;
  readinessScore: number;
  checks: AiDiscoveryCheck[];
  prompts: AiDiscoveryPrompt[];
  directories: AiDiscoveryDirectoryFlags;
  latestScorecard?: AiDiscoveryScorecard | null;
  disclaimer: string;
}

export interface AiDiscoveryInput {
  company: Company;
  gbpAudit?: GbpAuditResult;
  localSeo?: LocalSeoReport;
  reviews?: CompanyReview[];
  faqItemCount?: number;
}

function tradeLabel(company: Company): string {
  const industry = company.profile.industry?.trim();
  if (industry) return industry.toLowerCase();
  const svc = company.profile.services[0]?.trim();
  if (svc) return svc.toLowerCase();
  return "local business";
}

function primarySuburb(company: Company): string {
  return (
    company.profile.serviceAreas[0]?.trim() ||
    company.profile.localMarketNotes?.split(/[,.]/)[0]?.trim() ||
    "your area"
  );
}

export function buildAiDiscoveryPrompts(company: Company): AiDiscoveryPrompt[] {
  const trade = tradeLabel(company);
  const suburb = primarySuburb(company);
  const name = company.name.trim();
  const service = company.profile.services[0]?.trim() || trade;
  const suburbs = company.profile.serviceAreas.slice(0, 2);

  const prompts: AiDiscoveryPrompt[] = [
    {
      id: "cat_local",
      kind: "category_local",
      text: `best ${trade} in ${suburb}`,
    },
    {
      id: "svc_suburb",
      kind: "service_suburb",
      text: `${service} near ${suburb}`,
    },
    {
      id: "best_of",
      kind: "best_of",
      text: `recommend a trusted ${trade} for ${suburb}`,
    },
    {
      id: "near_me",
      kind: "near_me",
      text: `${trade} near me open now`,
    },
  ];

  if (suburbs[1]) {
    prompts.push({
      id: "cat_alt",
      kind: "category_local",
      text: `best ${trade} in ${suburbs[1]}`,
    });
  }

  // Keep a brand-check prompt last (useful for accuracy, not discovery).
  prompts.push({
    id: "brand_check",
    kind: "best_of",
    text: `what do you know about ${name} in ${suburb}?`,
  });

  return prompts.slice(0, 6);
}

export function computeMentionRate(
  rows: AiDiscoveryObservationRow[],
): { mentionRate: number | null; completedCount: number } {
  const done = rows.filter((r) => r.result === "mentioned" || r.result === "not_mentioned");
  if (done.length === 0) return { mentionRate: null, completedCount: 0 };
  const hits = done.filter((r) => r.result === "mentioned").length;
  return { mentionRate: hits / done.length, completedCount: done.length };
}

function check(
  id: string,
  title: string,
  status: AiDiscoveryCheckStatus,
  detail: string,
  fixAction: string,
  weight: number,
  fixHref?: string,
): AiDiscoveryCheck {
  return { id, title, status, detail, fixAction, weight, fixHref };
}

export function buildAiDiscoveryChecks(input: AiDiscoveryInput): AiDiscoveryCheck[] {
  const { company, gbpAudit, localSeo, reviews = [], faqItemCount = 0 } = input;
  const p = company.profile;
  const dirs = p.aiDiscovery?.directories ?? {};
  const base = `/companies/${company.id}`;
  const out: AiDiscoveryCheck[] = [];

  const website = p.website?.trim();
  out.push(
    website
      ? check(
          "website",
          "Website live",
          "pass",
          website,
          "Keep service and suburb pages crawlable.",
          12,
          website.startsWith("http") ? website : undefined,
        )
      : check(
          "website",
          "Website live",
          "fail",
          "No website on the client profile.",
          "Add the website URL on the client overview.",
          12,
          base,
        ),
  );

  const hasPhone = !!(p.approvalContact && /\d{6,}/.test(p.approvalContact));
  out.push(
    hasPhone
      ? check("nap_phone", "Phone on profile (NAP)", "pass", p.approvalContact!.trim(), "Keep identical across directories.", 10, base)
      : check(
          "nap_phone",
          "Phone on profile (NAP)",
          "fail",
          "AI needs a consistent phone number across the web.",
          "Add approval / business phone on the client profile.",
          10,
          base,
        ),
  );

  out.push(
    p.serviceAreas.length > 0
      ? check(
          "service_areas",
          "Service suburbs listed",
          "pass",
          p.serviceAreas.slice(0, 4).join(", "),
          "Use the same suburb names on the website and directories.",
          10,
          base,
        )
      : check(
          "service_areas",
          "Service suburbs listed",
          "fail",
          "No service areas — local AI prompts have nothing to ground on.",
          "Add suburbs / service areas on the client profile.",
          10,
          base,
        ),
  );

  out.push(
    p.services.length > 0
      ? check(
          "services",
          "Services listed",
          "pass",
          p.services.slice(0, 4).join(", "),
          "Mirror these on the website and GBP categories.",
          8,
          base,
        )
      : check(
          "services",
          "Services listed",
          "warn",
          "No services listed — prompts will be generic.",
          "Add core services on the client profile.",
          8,
          base,
        ),
  );

  const gbpOk = gbpAudit?.gbpConnected || !!p.socialLinks?.some((l) => l.platform === "google_business" && l.url.trim());
  out.push(
    gbpOk
      ? check(
          "gbp",
          "Google Business Profile",
          gbpAudit && gbpAudit.score >= 70 ? "pass" : "warn",
          gbpAudit
            ? `GBP score ${gbpAudit.score}/100${gbpAudit.gbpConnected ? " · connected" : " · link only"}`
            : "Google Business link on profile",
          "Complete NAP, hours, categories, photos, and FAQs on GBP.",
          14,
          `${base}/local-seo`,
        )
      : check(
          "gbp",
          "Google Business Profile",
          "fail",
          "Not connected and no Google Business URL.",
          "Connect GBP or add the Google Business link.",
          14,
          `${base}/local-seo`,
        ),
  );

  out.push(
    dirs.bingPlacesClaimed
      ? check(
          "bing",
          "Bing Places claimed",
          "pass",
          "Marked claimed — ChatGPT often leans on Bing.",
          "Keep NAP identical to Google / website.",
          12,
          `${base}/local-seo`,
        )
      : check(
          "bing",
          "Bing Places claimed",
          "fail",
          "Not marked as claimed. ChatGPT discovery often uses Bing.",
          "Claim Bing Places, then tick it here.",
          12,
          `${base}/local-seo`,
        ),
  );

  out.push(
    dirs.yelpListed
      ? check(
          "yelp",
          "Yelp / review directory",
          "pass",
          dirs.yelpUrl?.trim() || "Marked listed",
          "Keep reviews fresh and respond to them.",
          8,
          dirs.yelpUrl?.trim(),
        )
      : check(
          "yelp",
          "Yelp / review directory",
          "warn",
          "Not marked — Yelp and niche directories are common AI citation sources.",
          "List on Yelp (or your vertical directory) and tick it here.",
          8,
          `${base}/local-seo`,
        ),
  );

  const schema = localSeo?.schemaRecommendations.find((s) => s.schemaType === "LocalBusiness");
  out.push(
    schema?.readiness === "ready"
      ? check(
          "schema",
          "LocalBusiness schema ready",
          "pass",
          "JSON-LD fields look complete.",
          "Publish schema on the live website.",
          10,
          `${base}/local-seo`,
        )
      : check(
          "schema",
          "LocalBusiness schema ready",
          schema?.readiness === "partial" ? "warn" : "fail",
          schema
            ? `Missing: ${schema.missingFields.slice(0, 4).join(", ") || "fields"}`
            : "Run Local SEO to generate schema recommendations.",
          "Fill profile fields, then publish LocalBusiness JSON-LD on the site.",
          10,
          `${base}/local-seo`,
        ),
  );

  const landingReady =
    localSeo?.landingBriefs.filter((b) => b.status === "ready" || b.readinessScore >= 70).length ?? 0;
  out.push(
    landingReady > 0
      ? check(
          "landings",
          "Suburb landing briefs",
          "pass",
          `${landingReady} suburb brief(s) ready to publish.`,
          "Publish suburb pages on the client website.",
          8,
          `${base}/local-seo`,
        )
      : check(
          "landings",
          "Suburb landing briefs",
          "warn",
          "No ready suburb landings — AI has fewer local pages to cite.",
          "Generate and publish suburb landing pages.",
          8,
          `${base}/local-seo`,
        ),
  );

  const faqOk = faqItemCount > 0 || (localSeo?.qaDrafts.length ?? 0) > 0;
  out.push(
    faqOk
      ? check(
          "faq",
          "FAQ / Q&A content",
          "pass",
          faqItemCount > 0
            ? `${faqItemCount} FAQ-style content item(s)`
            : `${localSeo?.qaDrafts.length ?? 0} Q&A draft(s) ready`,
          "Publish FAQs on the site and GBP.",
          6,
          `${base}/local-seo`,
        )
      : check(
          "faq",
          "FAQ / Q&A content",
          "warn",
          "No FAQ content — AI answers love clear Q&A.",
          "Spawn Local SEO Q&A drafts and publish them.",
          6,
          `${base}/local-seo`,
        ),
  );

  const reviewCount = reviews.length;
  const recentPositive = reviews.filter((r) => r.rating >= 4).length;
  out.push(
    reviewCount >= 3
      ? check(
          "reviews",
          "Review presence",
          recentPositive >= 2 ? "pass" : "warn",
          `${reviewCount} review(s) on file · ${recentPositive} rated 4+`,
          "Keep collecting fresh reviews.",
          8,
          `/reviews?company=${company.id}`,
        )
      : check(
          "reviews",
          "Review presence",
          reviewCount > 0 ? "warn" : "fail",
          reviewCount > 0 ? `${reviewCount} review(s) — aim for 3+` : "No reviews imported yet.",
          "Import reviews and run a review-request campaign.",
          8,
          `/reviews?company=${company.id}`,
        ),
  );

  return out;
}

export function readinessScoreFromChecks(checks: AiDiscoveryCheck[]): number {
  const totalW = checks.reduce((s, c) => s + c.weight, 0) || 1;
  let earned = 0;
  for (const c of checks) {
    if (c.status === "pass") earned += c.weight;
    else if (c.status === "warn") earned += c.weight * 0.45;
    else if (c.status === "info") earned += c.weight * 0.7;
  }
  return Math.round((earned / totalW) * 100);
}

export function buildAiDiscoveryReport(input: AiDiscoveryInput): AiDiscoveryReport {
  const checks = buildAiDiscoveryChecks(input);
  const prompts = buildAiDiscoveryPrompts(input.company);
  const slice = input.company.profile.aiDiscovery;
  return {
    companyId: input.company.id,
    ranAt: new Date().toISOString(),
    readinessScore: readinessScoreFromChecks(checks),
    checks,
    prompts,
    directories: slice?.directories ?? {},
    latestScorecard: slice?.scorecards?.[0] ?? null,
    disclaimer: AI_DISCOVERY_DISCLAIMER,
  };
}

export function parseScorecardForm(
  formData: FormData,
  prompts: AiDiscoveryPrompt[],
): AiDiscoveryObservationRow[] {
  const rows: AiDiscoveryObservationRow[] = [];
  for (const prompt of prompts) {
    for (const platform of AI_DISCOVERY_PLATFORMS) {
      const key = `r_${prompt.id}_${platform.id}`;
      const raw = String(formData.get(key) || "not_run").trim() as AiDiscoveryMentionResult;
      const result: AiDiscoveryMentionResult =
        raw === "mentioned" || raw === "not_mentioned" || raw === "not_run" ? raw : "not_run";
      const notes = String(formData.get(`n_${prompt.id}_${platform.id}`) || "").trim();
      rows.push({
        promptId: prompt.id,
        platform: platform.id,
        result,
        ...(notes ? { notes } : {}),
      });
    }
  }
  return rows;
}

export function formatMentionRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
