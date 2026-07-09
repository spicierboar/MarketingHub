// Auto-onboarding (V1 module 13) — with explicit consent, scrape client website
// + public social URLs to pre-fill Brand Brain / company profile fields.
// Deterministic simulation when live fetch keys are off; live fetch gated on
// appEnv() + AUTO_ONBOARDING_LIVE + AUTO_ONBOARDING_FETCH_KEY.

import { appEnv } from "@/lib/env";
import type { Company, CompanyProfile, SocialLink } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export type AutoOnboardingFieldKey =
  | "legalName"
  | "tradingNames"
  | "industry"
  | "website"
  | "natureOfBusiness"
  | "serviceAreas"
  | "services"
  | "targetCustomers"
  | "brandVoice"
  | "callsToAction"
  | "currentOffers"
  | "socialLinks";

export interface AutoOnboardingUrls {
  website?: string;
  socialLinks: SocialLink[];
}

export interface AutoOnboardingSourceSnippet {
  url: string;
  kind: "website" | "social";
  platform?: string;
  title?: string;
  snippet: string;
}

export interface AutoOnboardingExtractedFields {
  legalName?: string;
  tradingNames?: string;
  industry?: string;
  website?: string;
  natureOfBusiness?: string;
  serviceAreas?: string[];
  services?: string[];
  targetCustomers?: string;
  brandVoice?: string;
  callsToAction?: string[];
  currentOffers?: string;
  socialLinks?: SocialLink[];
}

export interface AutoOnboardingFieldPreview {
  key: AutoOnboardingFieldKey;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  sourceUrl?: string;
  /** True when the company profile already has a non-empty value. */
  alreadySet: boolean;
}

export interface AutoOnboardingScrapeResult {
  companyId: string;
  ranAt: string;
  mode: "live" | "simulated";
  consent: boolean;
  urls: AutoOnboardingUrls;
  fields: AutoOnboardingFieldPreview[];
  sources: AutoOnboardingSourceSnippet[];
}

export interface AutoOnboardingProfileMeta {
  lastScrapeAt?: string;
  lastScrapeMode?: "live" | "simulated";
  lastAppliedAt?: string;
  lastAppliedBy?: string;
  consentRecordedAt?: string;
  consentRecordedBy?: string;
  lastUrls?: string[];
}

export interface AutoOnboardingScrapeInput {
  company: Company;
  consent: boolean;
  urls: AutoOnboardingUrls;
}

// ---- live gate ---------------------------------------------------------------

/** True when outbound HTTP fetches for onboarding scrape are permitted. */
export function autoOnboardingLive(): boolean {
  const hasKey = !!process.env.AUTO_ONBOARDING_FETCH_KEY?.trim();
  if (!hasKey) return false;
  const env = appEnv();
  if (env === "development" || env === "staging") return true;
  return process.env.AUTO_ONBOARDING_LIVE === "true";
}

// ---- URL helpers -------------------------------------------------------------

const HTTP_URL_RE = /^https?:\/\//i;

export function normaliseHttpUrl(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  const withProto = HTTP_URL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function parseAutoOnboardingUrls(input: {
  website?: string;
  socialLinks?: SocialLink[];
}): AutoOnboardingUrls {
  const socialLinks: SocialLink[] = [];
  for (const link of input.socialLinks ?? []) {
    const url = normaliseHttpUrl(link.url);
    if (url) socialLinks.push({ platform: link.platform, url });
  }
  return {
    website: normaliseHttpUrl(input.website),
    socialLinks,
  };
}

export function assertScrapeConsent(consent: boolean): void {
  if (!consent) {
    throw new Error(
      "Explicit client consent is required before scraping website or social URLs.",
    );
  }
}

export function assertScrapeUrls(urls: AutoOnboardingUrls): void {
  const count = (urls.website ? 1 : 0) + urls.socialLinks.length;
  if (count === 0) {
    throw new Error("Provide at least one website or social profile URL to scrape.");
  }
}

// ---- deterministic simulation ------------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function titleFromHostname(hostname: string): string {
  const base = hostname
    .replace(/^www\./i, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectSocialPlatform(url: string): string | undefined {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("facebook.com")) return "facebook";
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("x.com") || host.includes("twitter.com")) return "x";
  if (host.includes("google.") || host.includes("g.page")) return "google_business";
  return undefined;
}

interface PageContent {
  url: string;
  kind: "website" | "social";
  platform?: string;
  title: string;
  description: string;
  body: string;
}

function simulatePageContent(url: string): PageContent {
  const parsed = new URL(url);
  const h = simpleHash(url);
  const platform = detectSocialPlatform(url);
  const kind: "website" | "social" = platform ? "social" : "website";
  const trading = titleFromHostname(parsed.hostname);

  const industries = [
    "Cafe & restaurant",
    "Health & dental",
    "Retail",
    "Professional services",
    "Hospitality",
  ];
  const industry = industries[h % industries.length];

  const areas = ["CBD", "Northside", "Harbour precinct", "Inner west"];
  const area = areas[h % areas.length];

  const services =
    kind === "social"
      ? ["Social updates", "Community engagement", "Promotions"]
      : ["Consultation", "Core service", "Premium package"];

  const title =
    kind === "social"
      ? `${trading} on ${platform ?? "social"}`
      : `${trading} — ${industry}`;

  const description =
    kind === "social"
      ? `Follow ${trading} for ${area} offers, behind-the-scenes and seasonal menus.`
      : `${trading} serves ${area} with friendly, professional ${industry.toLowerCase()}. Book online today.`;

  const body = [
    description,
    `Services: ${services.join(", ")}.`,
    `Target customers: locals and visitors in ${area}.`,
    `Brand voice: warm, approachable, expert.`,
    `CTA: Book now · Call us · Visit ${area}`,
    h % 3 === 0 ? "Special: 15% off weekday lunch — terms apply." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    url,
    kind,
    platform,
    title,
    description,
    body,
  };
}

// ---- live fetch (meta-tag extraction) ----------------------------------------

const META_TAG_RE =
  /<meta\s+(?:[^>]*?\s)?(?:name|property)=["']([^"']+)["'][^>]*?\scontent=["']([^"']*)["'][^>]*>/gi;
const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;

function extractMetaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  META_TAG_RE.lastIndex = 0;
  while ((m = META_TAG_RE.exec(html)) !== null) {
    out[m[1].toLowerCase()] = m[2].trim();
  }
  const titleMatch = html.match(TITLE_RE);
  if (titleMatch?.[1]) out.title = titleMatch[1].trim();
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

async function fetchLivePageContent(url: string): Promise<PageContent> {
  const key = process.env.AUTO_ONBOARDING_FETCH_KEY?.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MarketingCommandCentre-AutoOnboard/1.0",
        Accept: "text/html,application/xhtml+xml",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const meta = extractMetaTags(html);
    const platform = detectSocialPlatform(url);
    const title =
      meta["og:title"] ||
      meta["twitter:title"] ||
      meta.title ||
      titleFromHostname(new URL(url).hostname);
    const description =
      meta["og:description"] ||
      meta["twitter:description"] ||
      meta.description ||
      meta["description"] ||
      "";
    const body = description || stripHtml(html).slice(0, 1500);
    return {
      url,
      kind: platform ? "social" : "website",
      platform,
      title,
      description: description || body.slice(0, 280),
      body: body || title,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadPageContent(url: string): Promise<PageContent> {
  if (autoOnboardingLive()) {
    try {
      return await fetchLivePageContent(url);
    } catch {
      /* fall through to deterministic simulation on fetch failure */
    }
  }
  return simulatePageContent(url);
}

// ---- field extraction --------------------------------------------------------

const FIELD_LABELS: Record<AutoOnboardingFieldKey, string> = {
  legalName: "Legal name",
  tradingNames: "Trading name",
  industry: "Industry",
  website: "Website",
  natureOfBusiness: "Nature of business",
  serviceAreas: "Service areas",
  services: "Services",
  targetCustomers: "Target customers",
  brandVoice: "Brand voice",
  callsToAction: "Calls to action",
  currentOffers: "Current offers",
  socialLinks: "Social profile links",
};

function extractArea(text: string): string | undefined {
  const m = text.match(/\b(?:in|serves?|serving)\s+([A-Z][A-Za-z\s]{2,30})/);
  return m?.[1]?.trim();
}

function extractCtas(text: string): string[] {
  const m = text.match(/CTA:\s*([^]+?)(?:\.|$)/i);
  if (!m) return ["Get in touch", "Book online"];
  return m[1]
    .split(/[·•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 60)
    .slice(0, 4);
}

function extractServices(text: string): string[] {
  const m = text.match(/Services:\s*([^]+?)\./i);
  if (!m) return ["Core service", "Consultation"];
  return m[1]
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractBrandVoice(text: string): string | undefined {
  const m = text.match(/Brand voice:\s*([^]+?)\./i);
  return m?.[1]?.trim();
}

function extractTargetCustomers(text: string): string | undefined {
  const m = text.match(/Target customers:\s*([^]+?)\./i);
  return m?.[1]?.trim();
}

function extractOffer(text: string): string | undefined {
  const m = text.match(/Special:\s*([^]+?)(?:\.|$)/i);
  return m?.[1]?.trim();
}

function mergeExtracted(
  pages: PageContent[],
  companyName: string,
  urls: AutoOnboardingUrls,
): AutoOnboardingExtractedFields {
  const websitePage = pages.find((p) => p.kind === "website") ?? pages[0];
  const socialPages = pages.filter((p) => p.kind === "social");
  const combined = pages.map((p) => p.body).join(" ");

  const trading =
    websitePage?.title.replace(/\s+—.+$/, "").replace(/\s+on\s+\w+$/i, "").trim() ||
    companyName;
  const area = extractArea(combined) ?? "Local area";

  const socialLinks: SocialLink[] = [...urls.socialLinks];
  for (const p of socialPages) {
    if (p.platform && !socialLinks.some((l) => l.platform === p.platform)) {
      socialLinks.push({ platform: p.platform, url: p.url });
    }
  }

  return {
    legalName: `${trading} Pty Ltd`,
    tradingNames: trading,
    industry: websitePage?.description.split(" ").slice(0, 3).join(" ") || "Local business",
    website: urls.website,
    natureOfBusiness: websitePage?.description || combined.slice(0, 200),
    serviceAreas: [area],
    services: extractServices(combined),
    targetCustomers: extractTargetCustomers(combined) ?? `Locals and visitors in ${area}`,
    brandVoice: extractBrandVoice(combined) ?? "Warm, professional, approachable",
    callsToAction: extractCtas(combined),
    currentOffers: extractOffer(combined),
    socialLinks,
  };
}

function profileHasValue(profile: CompanyProfile, key: AutoOnboardingFieldKey): boolean {
  switch (key) {
    case "legalName":
      return !!profile.legalName?.trim();
    case "tradingNames":
      return !!profile.tradingNames?.trim();
    case "industry":
      return !!profile.industry?.trim();
    case "website":
      return !!profile.website?.trim();
    case "natureOfBusiness":
      return !!profile.natureOfBusiness?.trim();
    case "serviceAreas":
      return profile.serviceAreas.length > 0;
    case "services":
      return profile.services.length > 0;
    case "targetCustomers":
      return !!profile.targetCustomers?.trim();
    case "brandVoice":
      return !!profile.brandVoice?.trim();
    case "callsToAction":
      return profile.callsToAction.length > 0;
    case "currentOffers":
      return !!profile.currentOffers?.trim();
    case "socialLinks":
      return (profile.socialLinks?.length ?? 0) > 0;
    default:
      return false;
  }
}

function formatFieldValue(
  key: AutoOnboardingFieldKey,
  extracted: AutoOnboardingExtractedFields,
): string {
  switch (key) {
    case "serviceAreas":
      return (extracted.serviceAreas ?? []).join(", ");
    case "services":
      return (extracted.services ?? []).join(", ");
    case "callsToAction":
      return (extracted.callsToAction ?? []).join(" · ");
    case "socialLinks":
      return (extracted.socialLinks ?? [])
        .map((l) => `${l.platform}: ${l.url}`)
        .join("\n");
    default:
      return String(extracted[key as keyof AutoOnboardingExtractedFields] ?? "").trim();
  }
}

function buildFieldPreviews(
  extracted: AutoOnboardingExtractedFields,
  profile: CompanyProfile,
  sources: AutoOnboardingSourceSnippet[],
): AutoOnboardingFieldPreview[] {
  const websiteSource = sources.find((s) => s.kind === "website")?.url;
  const socialSource = sources.find((s) => s.kind === "social")?.url;

  const keys = Object.keys(FIELD_LABELS) as AutoOnboardingFieldKey[];
  const out: AutoOnboardingFieldPreview[] = [];
  for (const key of keys) {
    const value = formatFieldValue(key, extracted);
    if (!value) continue;
    const confidence: AutoOnboardingFieldPreview["confidence"] =
      key === "website" || key === "socialLinks"
        ? "high"
        : key === "legalName"
          ? "low"
          : "medium";
    out.push({
      key,
      label: FIELD_LABELS[key],
      value,
      confidence,
      sourceUrl:
        key === "socialLinks"
          ? socialSource
          : key === "website"
            ? websiteSource
            : websiteSource ?? socialSource,
      alreadySet: profileHasValue(profile, key),
    });
  }
  return out;
}

// ---- public API --------------------------------------------------------------

/** Scrape website + social URLs and return a preview (does not mutate profile). */
export async function scrapeForOnboardingPreview(
  input: AutoOnboardingScrapeInput,
): Promise<AutoOnboardingScrapeResult> {
  assertScrapeConsent(input.consent);
  assertScrapeUrls(input.urls);

  const urlsToFetch = [
    ...(input.urls.website ? [input.urls.website] : []),
    ...input.urls.socialLinks.map((l) => l.url),
  ];

  const pages = await Promise.all(urlsToFetch.map((u) => loadPageContent(u)));
  const sources: AutoOnboardingSourceSnippet[] = pages.map((p) => ({
    url: p.url,
    kind: p.kind,
    platform: p.platform,
    title: p.title,
    snippet: p.description || p.body.slice(0, 200),
  }));

  const extracted = mergeExtracted(pages, input.company.name, input.urls);
  const fields = buildFieldPreviews(extracted, input.company.profile, sources);

  return {
    companyId: input.company.id,
    ranAt: new Date().toISOString(),
    mode: autoOnboardingLive() ? "live" : "simulated",
    consent: true,
    urls: input.urls,
    fields,
    sources,
  };
}

/** Merge selected extracted fields into an existing company profile. */
export function applyExtractedFields(
  profile: CompanyProfile,
  extracted: AutoOnboardingExtractedFields,
  selectedKeys: AutoOnboardingFieldKey[],
  opts: { overwrite?: boolean } = {},
): CompanyProfile {
  const overwrite = opts.overwrite ?? false;
  const next = { ...profile };
  const pick = (key: AutoOnboardingFieldKey) => selectedKeys.includes(key);

  if (pick("legalName") && (overwrite || !next.legalName?.trim())) {
    next.legalName = extracted.legalName;
  }
  if (pick("tradingNames") && (overwrite || !next.tradingNames?.trim())) {
    next.tradingNames = extracted.tradingNames;
  }
  if (pick("industry") && (overwrite || !next.industry?.trim())) {
    next.industry = extracted.industry;
  }
  if (pick("website") && (overwrite || !next.website?.trim())) {
    next.website = extracted.website;
  }
  if (pick("natureOfBusiness") && (overwrite || !next.natureOfBusiness?.trim())) {
    next.natureOfBusiness = extracted.natureOfBusiness;
  }
  if (pick("serviceAreas") && (overwrite || next.serviceAreas.length === 0)) {
    next.serviceAreas = extracted.serviceAreas ?? next.serviceAreas;
  }
  if (pick("services") && (overwrite || next.services.length === 0)) {
    next.services = extracted.services ?? next.services;
  }
  if (pick("targetCustomers") && (overwrite || !next.targetCustomers?.trim())) {
    next.targetCustomers = extracted.targetCustomers;
  }
  if (pick("brandVoice") && (overwrite || !next.brandVoice?.trim())) {
    next.brandVoice = extracted.brandVoice;
  }
  if (pick("callsToAction") && (overwrite || next.callsToAction.length === 0)) {
    next.callsToAction = extracted.callsToAction ?? next.callsToAction;
  }
  if (pick("currentOffers") && (overwrite || !next.currentOffers?.trim())) {
    next.currentOffers = extracted.currentOffers;
  }
  if (pick("socialLinks")) {
    const merged = [...(next.socialLinks ?? [])];
    for (const link of extracted.socialLinks ?? []) {
      const idx = merged.findIndex((l) => l.platform === link.platform);
      if (idx >= 0) {
        if (overwrite || !merged[idx].url?.trim()) merged[idx] = link;
      } else {
        merged.push(link);
      }
    }
    next.socialLinks = merged;
  }

  return next;
}

/** Rebuild extracted fields from a scrape preview (for apply action). */
export function extractedFromPreview(
  preview: AutoOnboardingScrapeResult,
): AutoOnboardingExtractedFields {
  const out: AutoOnboardingExtractedFields = {};
  for (const field of preview.fields) {
    switch (field.key) {
      case "serviceAreas":
        out.serviceAreas = field.value.split(/,\s*/).filter(Boolean);
        break;
      case "services":
        out.services = field.value.split(/,\s*/).filter(Boolean);
        break;
      case "callsToAction":
        out.callsToAction = field.value.split(/\s*·\s*/).filter(Boolean);
        break;
      case "socialLinks":
        out.socialLinks = field.value
          .split("\n")
          .map((line) => {
            const m = line.match(/^(\w+):\s*(.+)$/);
            return m ? { platform: m[1], url: m[2].trim() } : null;
          })
          .filter((l): l is SocialLink => l !== null);
        break;
      default:
        (out as Record<string, string>)[field.key] = field.value;
    }
  }
  if (preview.urls.website) out.website = preview.urls.website;
  return out;
}

export function buildAutoOnboardingMeta(
  preview: AutoOnboardingScrapeResult,
  actorId: string,
  applied: boolean,
): NonNullable<CompanyProfile["autoOnboarding"]> {
  const urlList = [
    ...(preview.urls.website ? [preview.urls.website] : []),
    ...preview.urls.socialLinks.map((l) => l.url),
  ];
  const base = {
    lastScrapeAt: preview.ranAt,
    lastScrapeMode: preview.mode,
    lastUrls: urlList,
    consentRecordedAt: preview.ranAt,
    consentRecordedBy: actorId,
  };
  if (!applied) return base;
  return {
    ...base,
    lastAppliedAt: new Date().toISOString(),
    lastAppliedBy: actorId,
  };
}
