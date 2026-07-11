// Auto-onboarding (V1 module 13) — with explicit consent, scrape client website
// + public social URLs to pre-fill Brand Brain / company profile fields.
// Deterministic simulation when live fetch keys are off; live fetch gated on
// appEnv() + AUTO_ONBOARDING_LIVE + AUTO_ONBOARDING_FETCH_KEY.

import { appEnv } from "@/lib/env";
import { enrichExtractedWithBusinessType } from "@/lib/signup-prefill-templates";
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
  /** AI/template extras not in the core field key enum. */
  extras?: {
    localMarketNotes?: string;
    businessAddress?: string;
    phone?: string;
    email?: string;
    enrichMode?: "claude" | "template";
  };
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

/** Structured signals parsed from page HTML (schema.org, meta, links). */
export interface OnboardingHtmlExtract {
  meta: Record<string, string>;
  schemaName?: string;
  schemaLegalName?: string;
  schemaDescription?: string;
  schemaTelephone?: string;
  schemaEmail?: string;
  schemaLocality?: string;
  schemaRegion?: string;
  schemaStreet?: string;
  schemaOpeningHours?: string[];
  schemaSameAs: string[];
  schemaTypes: string[];
  logoUrl?: string;
  telHrefs: string[];
  mailtoHrefs: string[];
  socialLinks: SocialLink[];
  navServices: string[];
  notes: string[];
}

interface PageContent {
  url: string;
  kind: "website" | "social";
  platform?: string;
  title: string;
  description: string;
  body: string;
  htmlExtract?: OnboardingHtmlExtract;
}

interface FieldExtractHint {
  confidence: "high" | "medium" | "low";
  sourceUrl?: string;
}

interface MergeResult {
  fields: AutoOnboardingExtractedFields;
  hints: Partial<Record<AutoOnboardingFieldKey, FieldExtractHint>>;
}

/** Demo hosts that return schema-rich HTML in simulated mode (no network). */
const SCHEMA_DEMO_HOSTS = new Set(["harbourroasters.example"]);

function simulatedDemoHtml(url: string): string | undefined {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./i, "");
  if (!SCHEMA_DEMO_HOSTS.has(host)) return undefined;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta property="og:site_name" content="Harbour Roasters">
  <meta property="og:title" content="Harbour Roasters — Cafe &amp; Restaurant">
  <meta property="og:description" content="Specialty coffee and brunch in Harbour precinct.">
  <meta property="og:image" content="https://harbourroasters.example/assets/logo.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Harbour Roasters">
  <meta name="twitter:description" content="Specialty coffee and brunch in Harbour precinct.">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Harbour Roasters",
    "description": "Specialty coffee roastery and cafe serving Harbour precinct.",
    "telephone": "+61 2 5555 0100",
    "email": "hello@harbourroasters.example",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "12 Wharf St",
      "addressLocality": "Harbour precinct",
      "addressRegion": "NSW"
    },
    "openingHours": "Mo-Fr 07:00-16:00",
    "sameAs": [
      "https://instagram.com/harbourroasters",
      "https://facebook.com/harbourroasters"
    ]
  }
  </script>
</head>
<body>
  <img class="site-logo" src="https://harbourroasters.example/assets/logo.png" alt="Harbour Roasters logo">
  <nav class="main-menu">
    <a href="/espresso">Espresso</a>
    <a href="/brunch">Weekend Brunch</a>
    <a href="/catering">Corporate Catering</a>
  </nav>
  <p>Target customers: locals and visitors in Harbour precinct. Brand voice: warm, approachable, expert.</p>
  <p>CTA: Book now · Call us · Visit Harbour precinct</p>
  <p>Special: 15% off weekday lunch — terms apply.</p>
  <footer class="site-footer">
    <a href="https://instagram.com/harbourroasters">Instagram</a>
    <a href="https://facebook.com/harbourroasters">Facebook</a>
    <a href="tel:+61255550100">Call us</a>
    <a href="mailto:hello@harbourroasters.example">Email</a>
  </footer>
</body>
</html>`;
}

function simulatePageContent(url: string): PageContent {
  const demoHtml = simulatedDemoHtml(url);
  if (demoHtml) return pageContentFromHtml(url, demoHtml);

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

  const wrappedHtml = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="${trading}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<title>${title}</title>
</head><body><p>${body}</p></body></html>`;

  return pageContentFromHtml(url, wrappedHtml);
}

// ---- HTML parsing (schema.org, meta, links) ----------------------------------

const META_TAG_RE =
  /<meta\s+[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*>|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:name|property)=["']([^"']+)["'][^>]*>/gi;
const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;
const JSON_LD_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const NAV_BLOCK_RE =
  /<(?:nav|div)[^>]*(?:class|id|role)=["'][^"']*(?:nav|menu|navigation)[^"']*["'][^>]*>[\s\S]*?<\/(?:nav|div)>/gi;
const FOOTER_BLOCK_RE =
  /<(?:footer|div)[^>]*(?:class|id)=["'][^"']*footer[^"']*["'][^>]*>[\s\S]*?<\/(?:footer|div)>/gi;
const ANCHOR_RE = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const IMG_TAG_RE = /<img[^>]*>/gi;
const SKIP_NAV_LABELS = new Set([
  "home",
  "about",
  "contact",
  "blog",
  "news",
  "login",
  "sign in",
  "privacy",
  "terms",
  "faq",
  "careers",
]);

function extractMetaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  META_TAG_RE.lastIndex = 0;
  while ((m = META_TAG_RE.exec(html)) !== null) {
    const key = (m[1] ?? m[4] ?? "").toLowerCase();
    const value = (m[2] ?? m[3] ?? "").trim();
    if (key && value) out[key] = value;
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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function flattenJsonLd(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((item) => flattenJsonLd(item));
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    return (obj["@graph"] as unknown[]).flatMap((item) => flattenJsonLd(item));
  }
  return [obj];
}

function schemaTypeMatches(type: unknown, ...names: string[]): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/^.*\//, "");
  if (typeof type === "string") {
    const base = norm(type);
    return names.some((n) => base.includes(n.toLowerCase()));
  }
  if (Array.isArray(type)) return type.some((t) => schemaTypeMatches(t, ...names));
  return false;
}

function readPostalAddress(
  addr: unknown,
): { locality?: string; region?: string; street?: string } | undefined {
  if (!addr || typeof addr !== "object") return undefined;
  const a = addr as Record<string, unknown>;
  const locality =
    typeof a.addressLocality === "string" ? a.addressLocality.trim() : undefined;
  const region =
    typeof a.addressRegion === "string" ? a.addressRegion.trim() : undefined;
  const street =
    typeof a.streetAddress === "string" ? a.streetAddress.trim() : undefined;
  if (!locality && !region && !street) return undefined;
  return { locality, region, street };
}

function extractSchemaOrg(html: string): Partial<OnboardingHtmlExtract> {
  const out: Partial<OnboardingHtmlExtract> = {
    schemaSameAs: [],
    schemaTypes: [],
    schemaOpeningHours: [],
  };
  const blocks: unknown[] = [];
  let m: RegExpExecArray | null;
  JSON_LD_RE.lastIndex = 0;
  while ((m = JSON_LD_RE.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      /* skip malformed JSON-LD */
    }
  }

  for (const node of blocks.flatMap((b) => flattenJsonLd(b))) {
    const type = node["@type"];
    const isBusiness =
      schemaTypeMatches(type, "LocalBusiness", "Organization", "Store", "Restaurant") ||
      schemaTypeMatches(node["@type"], "PostalAddress");
    if (!isBusiness && !schemaTypeMatches(type, "PostalAddress")) continue;

    if (schemaTypeMatches(type, "LocalBusiness", "Organization", "Store", "Restaurant")) {
      for (const t of Array.isArray(type) ? type : [type]) {
        if (typeof t === "string") out.schemaTypes!.push(t.replace(/^.*\//, ""));
      }
      if (!out.schemaName && typeof node.name === "string") {
        out.schemaName = node.name.trim();
      }
      if (!out.schemaLegalName && typeof node.legalName === "string") {
        out.schemaLegalName = node.legalName.trim();
      }
      if (!out.schemaDescription && typeof node.description === "string") {
        out.schemaDescription = node.description.trim();
      }
      if (!out.schemaTelephone && typeof node.telephone === "string") {
        out.schemaTelephone = node.telephone.trim();
      }
      if (!out.schemaEmail && typeof node.email === "string") {
        out.schemaEmail = node.email.trim();
      }
      const addr = readPostalAddress(node.address);
      if (addr?.locality && !out.schemaLocality) out.schemaLocality = addr.locality;
      if (addr?.region && !out.schemaRegion) out.schemaRegion = addr.region;
      if (addr?.street && !out.schemaStreet) out.schemaStreet = addr.street;
      if (typeof node.openingHours === "string") {
        out.schemaOpeningHours!.push(node.openingHours.trim());
      } else if (Array.isArray(node.openingHours)) {
        for (const oh of node.openingHours) {
          if (typeof oh === "string") out.schemaOpeningHours!.push(oh.trim());
        }
      }
      if (Array.isArray(node.sameAs)) {
        for (const link of node.sameAs) {
          if (typeof link === "string") out.schemaSameAs!.push(link.trim());
        }
      } else if (typeof node.sameAs === "string") {
        out.schemaSameAs!.push(node.sameAs.trim());
      }
      if (!out.logoUrl && typeof node.logo === "string") out.logoUrl = node.logo.trim();
      if (!out.logoUrl && node.logo && typeof node.logo === "object") {
        const logoObj = node.logo as Record<string, unknown>;
        if (typeof logoObj.url === "string") out.logoUrl = logoObj.url.trim();
      }
    }

    if (schemaTypeMatches(type, "PostalAddress")) {
      const addr = readPostalAddress(node);
      if (addr?.locality && !out.schemaLocality) out.schemaLocality = addr.locality;
      if (addr?.region && !out.schemaRegion) out.schemaRegion = addr.region;
      if (addr?.street && !out.schemaStreet) out.schemaStreet = addr.street;
    }
  }

  return out;
}

function extractHrefLinks(
  html: string,
  blocks: RegExp,
): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  let block: RegExpExecArray | null;
  blocks.lastIndex = 0;
  while ((block = blocks.exec(html)) !== null) {
    const segment = block[0];
    let m: RegExpExecArray | null;
    ANCHOR_RE.lastIndex = 0;
    while ((m = ANCHOR_RE.exec(segment)) !== null) {
      const href = decodeHtmlEntities(m[1].trim());
      const text = decodeHtmlEntities(stripHtml(m[2]).trim());
      if (href) links.push({ href, text });
    }
  }
  return links;
}

function socialLinkFromUrl(url: string): SocialLink | undefined {
  const normalised = normaliseHttpUrl(url);
  if (!normalised) return undefined;
  const platform = detectSocialPlatform(normalised);
  if (!platform) return undefined;
  return { platform, url: normalised };
}

function mergeSocialLinks(...groups: SocialLink[][]): SocialLink[] {
  const merged: SocialLink[] = [];
  for (const group of groups) {
    for (const link of group) {
      if (!link.platform || !link.url) continue;
      const idx = merged.findIndex((l) => l.platform === link.platform);
      if (idx >= 0) merged[idx] = link;
      else merged.push(link);
    }
  }
  return merged;
}

function extractLogoUrl(html: string, meta: Record<string, string>): string | undefined {
  if (meta["og:image"]?.trim()) return meta["og:image"].trim();
  if (meta["twitter:image"]?.trim()) return meta["twitter:image"].trim();

  let m: RegExpExecArray | null;
  IMG_TAG_RE.lastIndex = 0;
  while ((m = IMG_TAG_RE.exec(html)) !== null) {
    const tag = m[0];
    if (!/logo/i.test(tag)) continue;
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (srcMatch?.[1]) return decodeHtmlEntities(srcMatch[1].trim());
  }
  return undefined;
}

function extractNavServices(html: string): string[] {
  const services: string[] = [];
  const links = extractHrefLinks(html, NAV_BLOCK_RE);
  for (const { text } of links) {
    const label = text.trim();
    if (!label || label.length > 48) continue;
    if (SKIP_NAV_LABELS.has(label.toLowerCase())) continue;
    if (!services.some((s) => s.toLowerCase() === label.toLowerCase())) {
      services.push(label);
    }
  }
  return services.slice(0, 8);
}

function extractTelMailto(html: string): { tel: string[]; mailto: string[] } {
  const tel: string[] = [];
  const mailto: string[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1].trim());
    if (href.startsWith("tel:")) {
      const num = href.slice(4).trim();
      if (num && !tel.includes(num)) tel.push(num);
    } else if (href.startsWith("mailto:")) {
      const addr = href.slice(7).split("?")[0].trim();
      if (addr && !mailto.includes(addr)) mailto.push(addr);
    }
  }
  return { tel, mailto };
}

function extractFooterSocialLinks(html: string): SocialLink[] {
  const links: SocialLink[] = [];
  const footerLinks = extractHrefLinks(html, FOOTER_BLOCK_RE);
  for (const { href } of footerLinks) {
    const social = socialLinkFromUrl(href);
    if (social) links.push(social);
  }
  return links;
}

/** Parse onboarding-relevant signals from raw HTML (exported for self-tests). */
export function parseHtmlForOnboarding(html: string, pageUrl: string): OnboardingHtmlExtract {
  const meta = extractMetaTags(html);
  const schema = extractSchemaOrg(html);
  const { tel, mailto } = extractTelMailto(html);
  const navServices = extractNavServices(html);
  const footerSocial = extractFooterSocialLinks(html);
  const schemaSocial = (schema.schemaSameAs ?? [])
    .map((u) => socialLinkFromUrl(u))
    .filter((l): l is SocialLink => l !== undefined);
  const logoUrl = extractLogoUrl(html, meta) ?? schema.logoUrl;

  const notes: string[] = [];
  if (logoUrl) notes.push(`Logo URL: ${logoUrl}`);
  if (schema.schemaTelephone) notes.push(`Telephone: ${schema.schemaTelephone}`);
  if (schema.schemaEmail) notes.push(`Email: ${schema.schemaEmail}`);
  if (schema.schemaStreet || schema.schemaLocality) {
    const parts = [
      schema.schemaStreet,
      schema.schemaLocality,
      schema.schemaRegion,
    ].filter(Boolean);
    notes.push(`Address: ${parts.join(", ")}`);
  }
  if (schema.schemaOpeningHours?.length) {
    notes.push(`Opening hours: ${schema.schemaOpeningHours.join("; ")}`);
  }
  if (tel.length) notes.push(`tel: ${tel.join(", ")}`);
  if (mailto.length) notes.push(`mailto: ${mailto.join(", ")}`);

  return {
    meta,
    schemaName: schema.schemaName,
    schemaLegalName: schema.schemaLegalName,
    schemaDescription: schema.schemaDescription,
    schemaTelephone: schema.schemaTelephone,
    schemaEmail: schema.schemaEmail,
    schemaLocality: schema.schemaLocality,
    schemaRegion: schema.schemaRegion,
    schemaStreet: schema.schemaStreet,
    schemaOpeningHours: schema.schemaOpeningHours ?? [],
    schemaSameAs: schema.schemaSameAs ?? [],
    schemaTypes: schema.schemaTypes ?? [],
    logoUrl,
    telHrefs: tel,
    mailtoHrefs: mailto,
    socialLinks: mergeSocialLinks(schemaSocial, footerSocial),
    navServices,
    notes,
  };
}

function pageContentFromHtml(url: string, html: string): PageContent {
  const extract = parseHtmlForOnboarding(html, url);
  const platform = detectSocialPlatform(url);
  const meta = extract.meta;
  const title =
    meta["og:title"] ||
    meta["twitter:title"] ||
    extract.schemaName ||
    meta["og:site_name"] ||
    meta.title ||
    titleFromHostname(new URL(url).hostname);
  const description =
    meta["og:description"] ||
    meta["twitter:description"] ||
    extract.schemaDescription ||
    meta.description ||
    "";
  const bodyText = stripHtml(html);
  const body = bodyText || description || title;

  return {
    url,
    kind: platform ? "social" : "website",
    platform,
    title,
    description: description || body.slice(0, 280),
    body: body || title,
    htmlExtract: extract,
  };
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
    return pageContentFromHtml(url, html);
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

function industryFromTitle(title: string): string | undefined {
  const m = title.match(/[—–-]\s*(.+)$/);
  return m?.[1]?.trim();
}

function titleTradingName(title: string): string {
  return title.replace(/\s+—.+$/, "").replace(/\s+on\s+\w+$/i, "").trim();
}

function mergeExtracted(
  pages: PageContent[],
  companyName: string,
  urls: AutoOnboardingUrls,
): MergeResult {
  const websitePage = pages.find((p) => p.kind === "website") ?? pages[0];
  const socialPages = pages.filter((p) => p.kind === "social");
  const combined = pages.map((p) => p.body).join(" ");
  const web = websitePage?.htmlExtract;
  const webUrl = websitePage?.url;
  const hints: Partial<Record<AutoOnboardingFieldKey, FieldExtractHint>> = {};

  const setHint = (
    key: AutoOnboardingFieldKey,
    confidence: FieldExtractHint["confidence"],
    sourceUrl?: string,
  ) => {
    hints[key] = { confidence, sourceUrl: sourceUrl ?? webUrl };
  };

  const meta = web?.meta ?? {};
  const trading =
    web?.schemaName ||
    meta["og:site_name"] ||
    titleTradingName(websitePage?.title ?? "") ||
    companyName;

  if (web?.schemaName) setHint("tradingNames", "high", webUrl);
  else if (meta["og:site_name"]) setHint("tradingNames", "high", webUrl);
  else setHint("tradingNames", "medium", webUrl);

  const legalName = web?.schemaLegalName ?? `${trading} Pty Ltd`;
  setHint(
    "legalName",
    web?.schemaLegalName ? "medium" : "low",
    webUrl,
  );

  const industry =
    industryFromTitle(meta["og:title"] ?? websitePage?.title ?? "") ||
    industryFromTitle(websitePage?.title ?? "") ||
    web?.schemaTypes?.find((t) => /business|restaurant|store/i.test(t)) ||
    websitePage?.description.split(" ").slice(0, 3).join(" ") ||
    "Local business";
  if (industryFromTitle(meta["og:title"] ?? "")) setHint("industry", "high", webUrl);
  else if (web?.schemaTypes?.length) setHint("industry", "medium", webUrl);
  else setHint("industry", "medium", webUrl);

  const natureOfBusiness =
    web?.schemaDescription ||
    meta["og:description"] ||
    meta["twitter:description"] ||
    websitePage?.description ||
    combined.slice(0, 200);
  if (web?.schemaDescription) setHint("natureOfBusiness", "high", webUrl);
  else if (meta["og:description"]) setHint("natureOfBusiness", "medium", webUrl);
  else setHint("natureOfBusiness", "medium", webUrl);

  const area =
    web?.schemaLocality ||
    extractArea(combined) ||
    "Local area";
  if (web?.schemaLocality) setHint("serviceAreas", "high", webUrl);
  else setHint("serviceAreas", "medium", webUrl);

  const navServices = web?.navServices ?? [];
  const textServices = extractServices(combined);
  const services = navServices.length > 0 ? navServices : textServices;
  if (navServices.length > 0) setHint("services", "medium", webUrl);
  else setHint("services", "medium", webUrl);

  const targetCustomers =
    extractTargetCustomers(combined) ?? `Locals and visitors in ${area}`;
  setHint("targetCustomers", "medium", webUrl);

  const brandVoice =
    extractBrandVoice(combined) ?? "Warm, professional, approachable";
  setHint("brandVoice", "medium", webUrl);

  const telCtas =
    web?.telHrefs?.map((t) => `Call ${t}`) ??
    (web?.schemaTelephone ? [`Call ${web.schemaTelephone}`] : []);
  const mailCtas = web?.mailtoHrefs?.map(() => "Email us") ?? [];
  const textCtas = extractCtas(combined);
  const callsToAction = [...new Set([...textCtas, ...telCtas, ...mailCtas])].slice(0, 6);
  if (telCtas.length || web?.schemaTelephone) setHint("callsToAction", "high", webUrl);
  else setHint("callsToAction", "medium", webUrl);

  const currentOffers = extractOffer(combined);
  if (currentOffers) setHint("currentOffers", "low", webUrl);

  const socialLinks: SocialLink[] = mergeSocialLinks(
    urls.socialLinks,
    web?.socialLinks ?? [],
    socialPages
      .filter((p) => p.platform)
      .map((p) => ({ platform: p.platform!, url: p.url })),
  );
  const socialSource =
    web?.schemaSameAs?.length || (web?.socialLinks?.length ?? 0) > 0
      ? webUrl
      : socialPages[0]?.url;
  setHint("socialLinks", web?.schemaSameAs?.length ? "high" : "high", socialSource);

  setHint("website", "high", urls.website);

  return {
    fields: {
      legalName,
      tradingNames: trading,
      industry,
      website: urls.website,
      natureOfBusiness,
      serviceAreas: [area],
      services,
      targetCustomers,
      brandVoice,
      callsToAction,
      currentOffers,
      socialLinks,
    },
    hints,
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
  hints: Partial<Record<AutoOnboardingFieldKey, FieldExtractHint>> = {},
): AutoOnboardingFieldPreview[] {
  const websiteSource = sources.find((s) => s.kind === "website")?.url;
  const socialSource = sources.find((s) => s.kind === "social")?.url;

  const keys = Object.keys(FIELD_LABELS) as AutoOnboardingFieldKey[];
  const out: AutoOnboardingFieldPreview[] = [];
  for (const key of keys) {
    const value = formatFieldValue(key, extracted);
    if (!value) continue;
    const hint = hints[key];
    const confidence: AutoOnboardingFieldPreview["confidence"] =
      hint?.confidence ??
      (key === "website" || key === "socialLinks"
        ? "high"
        : key === "legalName"
          ? "low"
          : "medium");
    out.push({
      key,
      label: FIELD_LABELS[key],
      value,
      confidence,
      sourceUrl:
        hint?.sourceUrl ??
        (key === "socialLinks"
          ? socialSource
          : key === "website"
            ? websiteSource
            : websiteSource ?? socialSource),
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
  const sources: AutoOnboardingSourceSnippet[] = pages.map((p) => {
    const notes = p.htmlExtract?.notes?.length
      ? ` ${p.htmlExtract.notes.join(" · ")}`
      : "";
    return {
      url: p.url,
      kind: p.kind,
      platform: p.platform,
      title: p.title,
      snippet: (p.description || p.body.slice(0, 200)) + notes,
    };
  });

  const { fields: extracted, hints } = mergeExtracted(
    pages,
    input.company.name,
    input.urls,
  );
  const fieldPreviews = buildFieldPreviews(
    extracted,
    input.company.profile,
    sources,
    hints,
  );

  return {
    companyId: input.company.id,
    ranAt: new Date().toISOString(),
    mode: autoOnboardingLive() ? "live" : "simulated",
    consent: true,
    urls: input.urls,
    fields: fieldPreviews,
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

  if (!next.businessType) {
    const { businessType } = enrichExtractedWithBusinessType({
      industry: next.industry ?? extracted.industry,
    });
    next.businessType = businessType;
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

/**
 * Run scrape + AI/template enrichment + apply high/medium fields when creating a client.
 * Always persists a normalised website when provided; scrape failures still keep the URL.
 */
export async function scrapeAndApplyInitialProfile(input: {
  company: Company;
  website: string;
  actorId: string;
}): Promise<{
  profile: CompanyProfile;
  fieldCount: number;
  mode: AutoOnboardingScrapeResult["mode"] | "failed";
  enrichMode?: "claude" | "template";
}> {
  const urls = parseAutoOnboardingUrls({
    website: input.website,
    socialLinks: [],
  });
  const website = urls.website;
  if (!website) {
    return {
      profile: input.company.profile,
      fieldCount: 0,
      mode: "failed",
    };
  }

  const baseProfile: CompanyProfile = {
    ...input.company.profile,
    website,
  };

  try {
    let preview = await scrapeForOnboardingPreview({
      company: { ...input.company, profile: baseProfile },
      consent: true,
      urls,
    });

    const { enrichOnboardingPreview, applyContactAndNotesToProfile } =
      await import("@/lib/ai/onboarding-enrich");
    const enriched = await enrichOnboardingPreview({
      company: { ...input.company, profile: baseProfile },
      preview,
      actorId: input.actorId,
    });
    preview = enriched.preview;

    const keys = preview.fields
      .filter((f) => f.confidence === "high" || f.confidence === "medium")
      .map((f) => f.key);
    const extracted = extractedFromPreview(preview);
    let profile = applyExtractedFields(baseProfile, extracted, keys, {
      overwrite: false,
    });
    profile = applyContactAndNotesToProfile(profile, enriched.enrichment);
    profile.website = profile.website || website;
    profile.autoOnboarding = buildAutoOnboardingMeta(
      preview,
      input.actorId,
      keys.length > 0,
    );
    return {
      profile,
      fieldCount: keys.length,
      mode: preview.mode,
      enrichMode: enriched.enrichment.mode,
    };
  } catch {
    return { profile: baseProfile, fieldCount: 0, mode: "failed" };
  }
}
