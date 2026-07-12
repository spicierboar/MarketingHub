// Auto-onboarding (V1 module 13) — with explicit consent, scrape client website
// + public social URLs to pre-fill Brand Brain / company profile fields.
// Live HTTP fetch is on by default in development/staging; production opts in via
// AUTO_ONBOARDING_LIVE=true. AUTO_ONBOARDING_FETCH_KEY is an optional proxy auth
// header only — it does not gate whether public HTML is fetched.

import { appEnv } from "@/lib/env";
import { enrichExtractedWithBusinessType } from "@/lib/signup-prefill-templates";
import type { Company, CompanyProfile, SocialLink } from "@/lib/types";
import tls from "node:tls";

// On Windows / corporate SSL, Node's default Mozilla CA bundle often fails leaf
// verification. Prefer the OS trust store for outbound HTML fetches (matches
// `node --use-system-ca` used by `dev:supabase`). Safe no-op when unavailable.
try {
  const systemCerts = tls.getCACertificates?.("system");
  if (systemCerts?.length) {
    tls.setDefaultCACertificates?.(systemCerts);
  }
} catch {
  /* older Node or restricted env */
}

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
  /** Retail/grocery nav categories — stored on profile.retail, not Services. */
  productCategories?: string[];
  targetCustomers?: string;
  brandVoice?: string;
  callsToAction?: string[];
  currentOffers?: string;
  socialLinks?: SocialLink[];
  /** Real trust lines found on-site (optional). */
  approvedClaims?: string[];
  /** Real disclaimer / terms lines found on-site (optional). */
  requiredDisclaimers?: string[];
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
    /** Scrape/enrich product categories for retail (applied to profile.retail). */
    productCategories?: string[];
    /** Real trust lines found on-site. */
    approvedClaims?: string[];
    /** Real disclaimer / terms lines found on-site. */
    requiredDisclaimers?: string[];
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
  const flag = (process.env.AUTO_ONBOARDING_LIVE || "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  const env = appEnv();
  // Non-prod: fetch public HTML by default so New Client scrape works in demos.
  if (env === "development" || env === "staging") return true;
  // Production: explicit opt-in only.
  return flag === "true" || flag === "1" || flag === "on";
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

function titleFromHostname(hostname: string): string {
  const base = hostname
    .replace(/^www\./i, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Share/intent/plugin URLs — never treat as a profile. */
function isSocialShareOrJunkUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /\/sharer|\/share\.php|\/share\b|\/intent\/|\/dialog\/|\/plugins\/|platform\.twitter|addtoany|buffer\.com\/add|pinterest\.com\/pin\/create/i.test(
      u,
    ) ||
    /facebook\.com\/sharer|twitter\.com\/intent|x\.com\/intent/i.test(u)
  );
}

function detectSocialPlatform(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();

  if (host === "fb.com" || host === "fb.me" || host.includes("facebook.com")) {
    return "facebook";
  }
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host === "x.com" || host.includes("twitter.com")) return "x";
  // Google Business / Maps public profile links (not fonts/accounts/etc.)
  if (
    host === "g.page" ||
    host.endsWith(".g.page") ||
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && path.startsWith("/maps")) ||
    host.includes("business.google.com") ||
    ((host === "google.com" ||
      host === "google.com.au" ||
      host.endsWith(".google.com") ||
      host.endsWith(".google.com.au")) &&
      (/\/maps\//.test(path) || path.includes("/place/")))
  ) {
    return "google_business";
  }
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

/**
 * Soft fallback when live fetch is off or failed for a non-demo host.
 * Hostname-only signals — never invent services / areas / marketing fluff that
 * looks like a successful scrape (that caused the Viya Imports demo bug).
 */
function simulatePageContent(url: string): PageContent {
  const demoHtml = simulatedDemoHtml(url);
  if (demoHtml) return pageContentFromHtml(url, demoHtml);

  const parsed = new URL(url);
  const platform = detectSocialPlatform(url);
  const trading = titleFromHostname(parsed.hostname);

  const title =
    platform != null
      ? `${trading} on ${platform}`
      : trading;
  const description =
    platform != null
      ? `${trading} public ${platform} profile.`
      : "";

  const wrappedHtml = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="${trading}">
<meta property="og:title" content="${title}">
${description ? `<meta property="og:description" content="${description}">` : ""}
<title>${title}</title>
</head><body><p>${trading}</p></body></html>`;

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
/** Nav / chrome labels that are never services or product categories. */
const SKIP_NAV_LABELS = new Set([
  "home",
  "about",
  "about us",
  "contact",
  "contact us",
  "blog",
  "news",
  "login",
  "log in",
  "sign in",
  "sign up",
  "signup",
  "register",
  "create account",
  "my account",
  "account",
  "cart",
  "basket",
  "bag",
  "checkout",
  "wishlist",
  "favourites",
  "favorites",
  "privacy",
  "privacy policy",
  "terms",
  "terms of service",
  "faq",
  "faqs",
  "careers",
  "jobs",
  "search",
  "menu",
  "toggle menu",
  "open menu",
  "close menu",
  "skip to content",
  "skip to main content",
  "all products",
  "categories",
  "shop all",
  "view all",
  "sale",
  "offers",
  "deals",
  "help",
  "support",
  "track order",
  "track your order",
  "order tracking",
  "returns",
  "shipping",
  "delivery info",
]);

/** Phrases scraped from mobile headers / a11y chrome — never nature copy. */
const UI_CHROME_RE =
  /\b(?:toggle\s+menu|open\s+menu|close\s+menu|skip\s+to\s+(?:main\s+)?content|search\s+for|loading[.…]*|cookie\s+(?:policy|settings|preferences)|accept\s+(?:all\s+)?cookies?)\b/gi;
const WELCOME_CHROME_RE = /\bwelcome\s+to\s+[^.!?]{1,48}[!]?/gi;

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
    .slice(0, 8000);
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
  let raw = (url ?? "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return undefined;
  if (raw.startsWith("//")) raw = `https:${raw}`;
  const normalised = normaliseHttpUrl(raw);
  if (!normalised) return undefined;
  if (isSocialShareOrJunkUrl(normalised)) return undefined;
  const platform = detectSocialPlatform(normalised);
  if (!platform) return undefined;
  return { platform, url: normalised };
}

/**
 * Scan the whole page for social profile hrefs (header/footer/icon rows).
 * Footer-only parsing misses many Shopify / e-commerce themes.
 */
function extractPageSocialLinks(html: string): SocialLink[] {
  const links: SocialLink[] = [];
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const social = socialLinkFromUrl(decodeHtmlEntities(m[1].trim()));
    if (social) links.push(social);
  }
  // <link rel="me" href="…"> (IndieWeb / some themes)
  const linkMeRe =
    /<link[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>|<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\bme\b[^"']*["'][^>]*>/gi;
  linkMeRe.lastIndex = 0;
  while ((m = linkMeRe.exec(html)) !== null) {
    const social = socialLinkFromUrl(decodeHtmlEntities((m[1] ?? m[2] ?? "").trim()));
    if (social) links.push(social);
  }
  return links;
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

/** True when a nav/link label is chrome, auth, or account UI — not a service. */
export function isChromeServiceLabel(label: string): boolean {
  const t = label.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t || t.length > 48) return true;
  if (SKIP_NAV_LABELS.has(t)) return true;
  if (/^(log\s*in|sign\s*up|sign\s*in|register|cart|wishlist)$/i.test(t)) return true;
  return false;
}

/** Drop auth/nav chrome from a scraped services list. */
export function filterServiceLabels(services: string[]): string[] {
  const out: string[] = [];
  for (const raw of services) {
    const label = raw.trim();
    if (!label || isChromeServiceLabel(label)) continue;
    if (!out.some((s) => s.toLowerCase() === label.toLowerCase())) {
      out.push(label);
    }
  }
  return out.slice(0, 8);
}

/**
 * True when context is retail / grocery / wholesale / e-commerce product seller —
 * nav labels are usually product categories, not services.
 */
export function isProductSellerContext(signal?: string): boolean {
  const t = (signal ?? "").toLowerCase();
  if (!t.trim()) return false;
  if (
    /\b(restaurant|caf[eé]|bistro|brunch|hotel|motel|accommodation|clinic|dental|lawyer|accountant|professional\s+services?)\b/.test(
      t,
    )
  ) {
    return false;
  }
  // Consumer grocery / online store / retail type (incl. "Retail and Wholesale")
  if (
    /\b(grocery|supermarket|pantry|online\s+store|online\s+shop|e-?commerce|retail(?:\s+and\s+wholesale)?|florist|boutique)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // Product wholesale / food importer ranges (nav = catalogue lines)
  if (
    /\b(wholesale|import(?:er|s|ing)?)\b/.test(t) &&
    /\b(foods?|grocery|pantry|specialty|oils?|pasta|spices?|produce)\b/.test(t)
  ) {
    return true;
  }
  // Nature already names grocery/product ranges
  if (/\b(rice|lentils?|snacks?|gravies?|ghee|spices?)\b/.test(t)) return true;
  if (/\b(shop|store)\b/.test(t) && !/\b(serving\s+retailers?|for\s+retailers?)\b/.test(t)) {
    return true;
  }
  return false;
}

/** Fulfilment / ops offerings — valid Services for retailers. */
const TRUE_SERVICE_RE =
  /\b(delivery|deliver(?:ing|ed)?|shipping|ship(?:ping)?|click\s*[&+]?\s*collect|click\s+and\s+collect|pick\s*[- ]?up|collection|wholesale\s+supply|trade\s+(?:supply|enquir)|online\s+(?:order|ordering|grocery|shopping)|shop\s+online|in[- ]?store\s+shopping|nationwide|national\s+delivery|local\s+delivery|same[- ]?day|next[- ]?day|gift\s+wrapping|installation|assembly|returns?|refunds?|customer\s+support|trade\s+enquir|import\s+sourcing|catalogue|consultation|catering|dine[- ]?in|takeaway|rooms?|packages?|guest\s+parking|follow[- ]?up\s+care|new\s+client\s+enquir)\b/i;

/** True when a label is a real service/fulfilment offering, not a SKU category. */
export function isTrueServiceLabel(label: string): boolean {
  const t = label.trim();
  if (!t || isChromeServiceLabel(t)) return false;
  return TRUE_SERVICE_RE.test(t);
}

/**
 * Short goods/food/category nav labels — product categories for retail sellers.
 * Conservative: only when product-seller context is already established.
 */
export function looksLikeProductCategory(label: string): boolean {
  const t = label.trim();
  if (!t || isChromeServiceLabel(t) || isTrueServiceLabel(t)) return false;
  if (t.length > 48) return false;
  const words = t.split(/[\s/|&]+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  // Explicit goods / grocery category vocabulary
  if (
    /\b(rice|lentils?|dal|dhal|atta|flour|spices?|masala|snacks?|namkeen|sweets?|mithai|pickles?|chutney|oils?|ghee|butter|gravies?|curry|sauces?|pasta|noodles?|grains?|pulses?|beans?|flour|bread|dairy|frozen|fresh|produce|vegetables?|fruits?|meat|seafood|beverages?|drinks?|tea|coffee|biscuits?|cookies?|chocolate|candy|household|cleaning|personal\s+care|baby|pet|electronics?|apparel|clothing|footwear|accessories|homewares?|kitchen|pantry|ready\s+to\s+use|ready[- ]?meals?|olive\s+oils?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Generic short noun phrases without service verbs → likely category
  if (
    words.length <= 4 &&
    !/\b(and|with|for|our|the|your|free|book|order|enquire|enquir|call|email|visit|learn|get|see|shop|browse)\b/i.test(
      t,
    ) &&
    !TRUE_SERVICE_RE.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Split scraped labels into true services vs product categories for retail-like
 * businesses. Non-retail contexts keep all non-chrome labels as services.
 */
export function partitionServicesAndProductCategories(
  labels: string[],
  contextSignal?: string,
): { services: string[]; productCategories: string[] } {
  const cleaned = filterServiceLabels(labels);
  if (!isProductSellerContext(contextSignal)) {
    return { services: cleaned, productCategories: [] };
  }
  const services: string[] = [];
  const productCategories: string[] = [];
  for (const label of cleaned) {
    if (isTrueServiceLabel(label)) {
      services.push(label);
    } else if (looksLikeProductCategory(label) || !isTrueServiceLabel(label)) {
      // Retail default: leftover nav items are categories, not services
      productCategories.push(label);
    }
  }
  return {
    services: services.slice(0, 8),
    productCategories: productCategories.slice(0, 12),
  };
}

/** Infer fulfilment services from nature/title when retail has category-only nav. */
export function inferRetailServicesFromContext(signal?: string): string[] {
  const t = (signal ?? "").toLowerCase();
  if (!isProductSellerContext(t)) return [];
  const out: string[] = [];
  if (/\b(deliver|delivery|shipping|nationwide|across\s+australia|all\s+over)\b/.test(t)) {
    out.push(
      /\b(australia|nationwide|national|all\s+over)\b/.test(t)
        ? "National delivery"
        : "Local delivery",
    );
  }
  if (/\b(online|e-?commerce|web\s*store|shop\s+online)\b/.test(t)) {
    out.push("Online ordering");
  }
  if (/\b(click\s*[&+]?\s*collect|click\s+and\s+collect|pick\s*[- ]?up)\b/.test(t)) {
    out.push("Click & collect");
  }
  if (/\b(wholesale|trade\s+supply|b2b)\b/.test(t)) {
    out.push("Wholesale supply");
  }
  if (/\b(in[- ]?store|physical\s+store|shop\s+front)\b/.test(t) && !out.includes("In-store shopping")) {
    out.push("In-store shopping");
  }
  return filterServiceLabels(out).slice(0, 6);
}

function extractNavServices(html: string): string[] {
  const services: string[] = [];
  const links = extractHrefLinks(html, NAV_BLOCK_RE);
  for (const { text } of links) {
    const label = text.trim();
    if (!label || isChromeServiceLabel(label)) continue;
    if (!services.some((s) => s.toLowerCase() === label.toLowerCase())) {
      services.push(label);
    }
  }
  return filterServiceLabels(services);
}

/** Strip mobile-nav / welcome mashups from scraped marketing copy. */
export function stripUiChrome(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(UI_CHROME_RE, " ");
  t = t.replace(WELCOME_CHROME_RE, " ");
  // Repeated brand+tagline glue left by stripHtml of header+hero
  t = t.replace(/\s*[|·•]\s*/g, " — ");
  t = t.replace(/\s+/g, " ").trim();
  // Drop dangling separators
  t = t.replace(/^[\s\-—–|:]+|[\s\-—–|:]+$/g, "").trim();
  return t;
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
  const pageSocial = extractPageSocialLinks(html);
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
  const socialLinks = mergeSocialLinks(schemaSocial, footerSocial, pageSocial);
  if (socialLinks.length) {
    notes.push(
      `Socials: ${socialLinks.map((l) => `${l.platform}=${l.url}`).join(" · ")}`,
    );
  }

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
    socialLinks,
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
        "User-Agent":
          "Mozilla/5.0 (compatible; MarketingCommandCentre/1.0; +https://github.com/marketing-command-centre)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
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

async function loadPageContent(
  url: string,
): Promise<{ content: PageContent; fetchedLive: boolean }> {
  if (autoOnboardingLive()) {
    try {
      return { content: await fetchLivePageContent(url), fetchedLive: true };
    } catch {
      /* fall through to soft simulation on fetch failure */
    }
  }
  return { content: simulatePageContent(url), fetchedLive: false };
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
  // Capture 1–3 place-name tokens only — do not swallow "with friendly…" fluff.
  // e.g. "serves Northside with friendly" → "Northside"
  //      "in Harbour precinct." → "Harbour precinct"
  const m = text.match(
    /\b(?:in|serves?|serving)\s+((?:[A-Z][A-Za-z']+)(?:\s+[A-Z][A-Za-z']+){0,2})\b/,
  );
  const area = m?.[1]?.trim();
  if (!area) return undefined;
  // Reject connector-like leftovers
  if (/^(with|for|and|the|our|locals?)$/i.test(area)) return undefined;
  return area;
}

function extractCtas(text: string): string[] {
  const m = text.match(/CTA:\s*([^]+?)(?:\.|$)/i);
  if (!m) return [];
  return m[1]
    .split(/[·•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 60)
    .slice(0, 4);
}

function extractServices(text: string): string[] {
  const m = text.match(/Services:\s*([^]+?)\./i);
  if (!m) return [];
  return filterServiceLabels(
    m[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => {
        if (!s || s.length > 60) return false;
        // Never treat known simulation placeholders as real services
        if (/^(core service|premium package|consultation|enquir(?:y|ies))$/i.test(s)) {
          return false;
        }
        return true;
      }),
  ).slice(0, 6);
}

function extractBrandVoice(text: string): string | undefined {
  const m = text.match(/Brand voice:\s*([^]+?)\./i);
  return m?.[1]?.trim();
}

function extractTargetCustomers(text: string): string | undefined {
  const m = text.match(/Target customers:\s*([^]+?)\./i);
  const v = m?.[1]?.trim();
  // Simulated fluff — treat as missing so enrich can do better
  if (v && isWeakTargetCustomers(v)) return undefined;
  return v;
}

function extractOffer(text: string): string | undefined {
  const m = text.match(/Special:\s*([^]+?)(?:\.|$)/i);
  return m?.[1]?.trim();
}

/** Pull real disclaimer / terms lines from page copy when present. */
export function extractDisclaimersFromText(text: string): string[] {
  const cleaned = stripUiChrome(text);
  if (!cleaned.trim()) return [];
  const found: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length < 12 || t.length > 220) return;
    if (found.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    found.push(t);
  };

  // Explicit labelled disclaimers
  for (const m of cleaned.matchAll(
    /(?:disclaimer|important\s+notice|terms\s*(?:&|and)?\s*conditions)\s*[:\-–]\s*([^.!?\n]+[.!?]?)/gi,
  )) {
    if (m[1]) push(m[1]);
  }

  // Common retail / offer legal lines
  for (const m of cleaned.matchAll(
    /([^.!?\n]{0,80}\b(?:while\s+stocks?\s+last|subject\s+to\s+availability|terms\s+apply|prices?\s+subject\s+to\s+change|results?\s+may\s+vary)[^.!?\n]{0,80}[.!?]?)/gi,
  )) {
    if (m[1]) push(m[1]);
  }

  return found.slice(0, 4);
}

/**
 * Conservative “why choose us” / trust lines — only short factual slogans,
 * never health outcomes or absolute #1 claims.
 */
export function extractApprovedClaimCandidates(text: string): string[] {
  const cleaned = stripUiChrome(text);
  if (!cleaned.trim()) return [];
  const found: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, "");
    if (t.length < 8 || t.length > 100) return;
    if (/\b(cure|guaranteed|cheapest|#\s*1|best\s+in\s+australia|risk-?free)\b/i.test(t)) {
      return;
    }
    if (found.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    found.push(t);
  };

  for (const m of cleaned.matchAll(
    /(?:why\s+choose\s+us|our\s+promise|we\s+(?:are|offer)|locally\s+owned)[:\s]+([^.!?\n]+)/gi,
  )) {
    if (m[1]) push(m[1]);
  }
  for (const m of cleaned.matchAll(
    /\b(locally\s+owned(?:\s+&\s+operated)?|family[- ]owned(?:\s+since\s+\d{4})?|nationwide\s+delivery|same[- ]day\s+delivery)\b/gi,
  )) {
    if (m[0]) push(m[0]);
  }

  return found.slice(0, 4);
}

/** Prefer a complete about-style sentence from page body over truncated meta fluff. */
function extractAboutBlurb(body: string, companyName: string): string | undefined {
  const nameToken = companyName.trim().split(/\s+/)[0];
  if (!nameToken || nameToken.length < 2) return undefined;
  const cleanedBody = stripUiChrome(body);
  const sentences = cleanedBody
    .split(/(?<=[.!?])\s+/)
    .map((s) => stripUiChrome(s))
    .filter(Boolean);
  const nameRe = new RegExp(`\\b${nameToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  for (const s of sentences) {
    if (s.length < 50 || s.length > 360) continue;
    if (!nameRe.test(s)) continue;
    // Skip known simulation / template fluff / chrome leftovers
    if (/with friendly, professional/i.test(s)) continue;
    if (/book online today/i.test(s) && s.length < 120) continue;
    if (hasUiChromeResidue(s)) continue;
    return s.replace(/\s+/g, " ").trim();
  }
  // Fall back: first substantial sentence that looks like an about blurb
  for (const s of sentences) {
    if (s.length < 80 || s.length > 360) continue;
    if (/^(copyright|cookie|privacy|menu|home)\b/i.test(s)) continue;
    if (hasUiChromeResidue(s)) continue;
    if (/\b(we|our|speciali[sz]e|import|wholesale|supply|provide|offer|grocery|deliver)\b/i.test(s)) {
      return s.replace(/\s+/g, " ").trim();
    }
  }
  return undefined;
}

/** True when copy still contains obvious UI chrome after stripping. */
export function hasUiChromeResidue(text: string): boolean {
  return /\b(toggle\s+menu|skip\s+to\s+content|welcome\s+to\s+\w+|open\s+menu|close\s+menu)\b/i.test(
    text,
  );
}

/**
 * Pull an industry/tagline from a page title.
 * Prefers the front half when the dash suffix is brand/delivery fluff
 * ("Online Indian Grocery… - Viya Delivering All Over Australia").
 */
function industryFromTitle(title: string): string | undefined {
  const cleaned = stripUiChrome(title);
  if (!cleaned) return undefined;
  const parts = cleaned.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  const front = parts[0];
  const suffix = parts.length > 1 ? parts.slice(1).join(" — ") : undefined;

  const looksLikeIndustry = (s: string) =>
    /\b(grocery|supermarket|retail|cafe|café|restaurant|hotel|motel|accommodation|wholesale|import|clinic|dental|shop|store|foods?|pantry|boutique|florist|services?|professional)\b/i.test(
      s,
    );
  const looksLikeBrandFluff = (s: string) =>
    /^(delivering|welcome|home|shop\s+now|buy\s+online)\b/i.test(s) ||
    (!looksLikeIndustry(s) && s.split(/\s+/).length <= 6 && /^[A-Z][a-z]+/.test(s));

  if (suffix && looksLikeIndustry(suffix) && !looksLikeBrandFluff(suffix)) {
    return suffix;
  }
  if (front && looksLikeIndustry(front)) return front;
  if (suffix && looksLikeIndustry(suffix)) return suffix;
  return undefined;
}

function industryFromBody(text: string): string | undefined {
  const lower = stripUiChrome(text).toLowerCase();
  if (/\b(indian\s+grocery|online\s+indian\s+grocery)\b/.test(lower)) {
    return "Indian grocery retail";
  }
  if (/\b(grocery|supermarket|butcher|deli)\b/.test(lower)) return "Grocery retail";
  if (/\b(import(?:er|s|ing)?|wholesale|distributor|trade supply)\b/.test(lower)) {
    // Consumer grocery store that also imports still maps as grocery retail
    if (/\b(grocery|supermarket|online\s+store|shop\s+online)\b/.test(lower)) {
      return "Grocery retail";
    }
    return "Wholesale / imports";
  }
  if (/\b(cafe|café|restaurant|brunch|coffee)\b/.test(lower)) return "Cafe & restaurant";
  if (/\b(hotel|motel|accommodation|guest rooms?)\b/.test(lower)) return "Accommodation";
  if (/\b(dental|medical|physio|clinic|solicitor|lawyer)\b/.test(lower)) {
    return "Professional services";
  }
  if (/\b(retail|boutique|florist|online\s+store)\b/.test(lower)) {
    return "Retail and Wholesale";
  }
  return undefined;
}

function titleTradingName(title: string): string {
  return stripUiChrome(title)
    .replace(/\s+[—–-].+$/, "")
    .replace(/\s+on\s+\w+$/i, "")
    .trim();
}

/**
 * SEO meta titles / taglines must never land in Trading names.
 * Prefer brand-like short names (schema, og:site_name, company name).
 */
export function looksLikeSeoTagline(
  candidate: string,
  companyName?: string,
): boolean {
  const t = candidate.trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 6) return true;
  if (
    words.length >= 4 &&
    /\b(online|store|shop|grocery|supermarket|best|leading|official|home)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\bin\s+(australia|sydney|melbourne|brisbane|perth|adelaide|nsw|vic|qld)\b/i.test(
      t,
    ) &&
    words.length >= 3
  ) {
    return true;
  }
  if (companyName?.trim()) {
    const brand = companyName.trim().split(/\s+/)[0] ?? "";
    if (
      brand.length >= 3 &&
      !new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t) &&
      words.length >= 4
    ) {
      return true;
    }
  }
  return false;
}

/** Resolve trading name: schema / og:site_name / brand-like title / company name. */
export function resolveTradingName(input: {
  schemaName?: string;
  ogSiteName?: string;
  pageTitle?: string;
  companyName: string;
}): string {
  const company = input.companyName.trim();
  if (input.schemaName?.trim() && !looksLikeSeoTagline(input.schemaName, company)) {
    return input.schemaName.trim();
  }
  if (
    input.ogSiteName?.trim() &&
    !looksLikeSeoTagline(input.ogSiteName, company)
  ) {
    return input.ogSiteName.trim();
  }
  const fromTitle = titleTradingName(input.pageTitle ?? "");
  if (fromTitle && !looksLikeSeoTagline(fromTitle, company)) {
    return fromTitle;
  }
  return company || fromTitle;
}

function cleanNatureCandidate(text: string | undefined, trading: string): string | undefined {
  if (!text?.trim()) return undefined;
  let t = stripUiChrome(text);
  if (!t) return undefined;
  const name = trading.trim();
  if (name.length >= 2) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const dup = new RegExp(`^${escaped}\\s+${escaped}\\b`, "i");
    t = t.replace(dup, name).trim();
    const brandFirst = name.split(/\s+/)[0]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Drop trailing " - Brand Delivering…" mashups after a solid tagline
    const dashParts = t.split(/\s*[—–-]\s*/);
    if (dashParts.length > 1) {
      const head = dashParts[0].trim();
      const tail = dashParts.slice(1).join(" — ");
      const tailIsBrandDelivery =
        /^(delivering|welcome)\b/i.test(tail) ||
        (brandFirst != null &&
          brandFirst.length >= 2 &&
          new RegExp(`^${brandFirst}\\b`, "i").test(tail) &&
          /\b(delivering|welcome|all\s+over)\b/i.test(tail)) ||
        new RegExp(`\\b${escaped}\\b`, "i").test(tail);
      if (
        head.length >= 24 &&
        /\b(grocery|store|retail|cafe|restaurant|wholesale|import|clinic|hotel|online)\b/i.test(
          head,
        ) &&
        tailIsBrandDelivery
      ) {
        t = head;
      }
    }
  }
  t = t.replace(/\s+/g, " ").trim();
  if (hasUiChromeResidue(t)) return undefined;
  return t || undefined;
}

/**
 * Build a clean 1–2 sentence nature from title/meta when scrape blobs are junk.
 * Exported for verify-scrape-mapping.
 */
export function synthesizeNatureOfBusiness(input: {
  title?: string;
  metaDescription?: string;
  schemaDescription?: string;
  aboutBlurb?: string;
  tradingName: string;
  industry?: string;
}): string | undefined {
  const trading = input.tradingName.trim();
  const industry = input.industry?.trim();
  const title = stripUiChrome(input.title ?? "");

  // When industry already encodes the vertical, prefer crisp synthesized copy
  // over a raw title mashup (even after chrome strip).
  if (industry && /\b(grocery|retail|cafe|hotel|wholesale)\b/i.test(industry)) {
    const au = /\baustralia\b/i.test(`${title} ${industry}`);
    const indian = /\bindian\b/i.test(`${title} ${industry}`);
    const online = /\bonline\b/i.test(`${title} ${industry}`);
    if (indian && /grocery/i.test(industry)) {
      return online || /online/i.test(title)
        ? "Online Indian grocery store delivering across Australia."
        : `Indian grocery retailer serving shoppers${au ? " across Australia" : ""}.`;
    }
    if (/grocery/i.test(industry)) {
      return au
        ? "Grocery retailer delivering across Australia."
        : "Grocery retailer serving local shoppers.";
    }
  }

  const candidates = [
    input.schemaDescription,
    input.metaDescription,
    input.aboutBlurb,
    input.title,
  ];
  for (const raw of candidates) {
    const cleaned = cleanNatureCandidate(raw, trading);
    if (cleaned && !isWeakNatureText(cleaned)) {
      return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
    }
  }
  const fromTitle = cleanNatureCandidate(
    title.split(/\s*[—–-]\s*/)[0],
    trading,
  );
  if (fromTitle && fromTitle.length >= 28) {
    return /[.!?]$/.test(fromTitle) ? fromTitle : `${fromTitle}.`;
  }
  return undefined;
}

export function isWeakNatureText(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const v = stripUiChrome(value);
  if (v.length < 28) return true;
  if (hasUiChromeResidue(value)) return true;
  if (/serves \w+ with friendly, professional/i.test(v)) return true;
  if (/book online today/i.test(v) && v.length < 140) return true;
  // Truncated mid-phrase (e.g. ends with "with friendly.")
  if (/\bwith\s+\w+\.$/i.test(v) && v.length < 120) return true;
  if (/retail retailer/i.test(v)) return true;
  return false;
}

/** Tautological / placeholder audience lines that need rewriting. */
export function isWeakTargetCustomers(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const v = value.trim();
  if (/^locals and visitors in /i.test(v) && v.length < 80) return true;
  if (/need what .+ offers\.?$/i.test(v)) return true;
  if (/people who live,\s*work,\s*or visit/i.test(v)) return true;
  if (/looking for reliable products and service\.?$/i.test(v) && v.length < 90) {
    return true;
  }
  return false;
}

/**
 * Common-sense audience from industry/nature cues (no LLM required).
 */
export function synthesizeTargetCustomers(input: {
  natureOfBusiness?: string;
  industry?: string;
  tradingName?: string;
  serviceAreas?: string[];
  title?: string;
}): string | undefined {
  const blob = [
    input.natureOfBusiness,
    input.industry,
    input.title,
    input.tradingName,
  ]
    .filter(Boolean)
    .join(" ");
  const lower = blob.toLowerCase();
  const area =
    (input.serviceAreas ?? []).map((a) => a.trim()).filter(Boolean)[0] ||
    (/\baustralia\b/i.test(blob) ? "Australia" : "the local area");

  if (/\bindian\b/.test(lower) && /\b(grocery|supermarket|food|pantry|snacks?)\b/.test(lower)) {
    return `Indian diaspora households and shoppers seeking Indian groceries across ${area}.`;
  }
  if (/\b(grocery|supermarket)\b/.test(lower)) {
    return `Households and busy locals across ${area} who want convenient grocery shopping and delivery.`;
  }
  if (/\b(wholesale|import|distributor|b2b|trade)\b/.test(lower) && !/\bgrocery\b/.test(lower)) {
    return `Independent retailers, hospitality buyers, and distributors in ${area}.`;
  }
  if (/\b(cafe|café|restaurant|brunch)\b/.test(lower)) {
    return `Locals and visitors in ${area} looking for a meal out, takeaway, or a casual catch-up.`;
  }
  if (/\b(hotel|motel|accommodation)\b/.test(lower)) {
    return `Leisure travellers, couples, and families visiting ${area}, plus midweek business stays.`;
  }
  if (/\b(retail|online\s+store|shop)\b/.test(lower)) {
    return `Households and busy locals in ${area} who want convenient specialty shopping.`;
  }
  return undefined;
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
  const trading = resolveTradingName({
    schemaName: web?.schemaName,
    ogSiteName: meta["og:site_name"],
    pageTitle: websitePage?.title ?? meta["og:title"] ?? meta.title,
    companyName,
  });

  if (web?.schemaName && !looksLikeSeoTagline(web.schemaName, companyName)) {
    setHint("tradingNames", "high", webUrl);
  } else if (
    meta["og:site_name"] &&
    !looksLikeSeoTagline(meta["og:site_name"], companyName)
  ) {
    setHint("tradingNames", "high", webUrl);
  } else if (trading === companyName) {
    setHint("tradingNames", "medium", webUrl);
  } else {
    setHint("tradingNames", "medium", webUrl);
  }

  // Prefer real schema / ABR legal names — never invent "X Pty Ltd".
  const legalName = web?.schemaLegalName?.trim() || undefined;
  if (legalName) {
    setHint("legalName", "medium", webUrl);
  }

  const industry =
    industryFromTitle(meta["og:title"] ?? websitePage?.title ?? "") ||
    industryFromTitle(websitePage?.title ?? "") ||
    industryFromBody(combined) ||
    web?.schemaTypes?.find((t) => /business|restaurant|store|import|wholesale/i.test(t)) ||
    undefined;
  if (industryFromTitle(meta["og:title"] ?? websitePage?.title ?? "")) {
    setHint("industry", "high", webUrl);
  } else if (industryFromBody(combined)) setHint("industry", "medium", webUrl);
  else if (web?.schemaTypes?.length) setHint("industry", "medium", webUrl);
  else if (industry) setHint("industry", "low", webUrl);

  const aboutBlurb = extractAboutBlurb(combined, trading || companyName);
  const pageTitle = meta["og:title"] ?? websitePage?.title ?? "";
  // Prefer schema/meta when strong; else about blurb; synthesize from title when chrome junk
  const natureRaw =
    (web?.schemaDescription && !isWeakNatureText(web.schemaDescription)
      ? web.schemaDescription
      : undefined) ||
    (meta["og:description"] && !isWeakNatureText(meta["og:description"])
      ? meta["og:description"]
      : undefined) ||
    (meta["twitter:description"] && !isWeakNatureText(meta["twitter:description"])
      ? meta["twitter:description"]
      : undefined) ||
    aboutBlurb ||
    (websitePage?.description && !isWeakNatureText(websitePage.description)
      ? websitePage.description
      : undefined);
  const natureCleaned = cleanNatureCandidate(natureRaw, trading || companyName);
  const natureFinal =
    synthesizeNatureOfBusiness({
      title: pageTitle,
      metaDescription: meta["og:description"] || meta["twitter:description"] || natureCleaned,
      schemaDescription: web?.schemaDescription,
      aboutBlurb,
      tradingName: trading || companyName,
      industry,
    }) || natureCleaned;
  if (web?.schemaDescription && !isWeakNatureText(web.schemaDescription)) {
    setHint("natureOfBusiness", "high", webUrl);
  } else if (meta["og:description"] && !isWeakNatureText(meta["og:description"])) {
    setHint("natureOfBusiness", "medium", webUrl);
  } else if (aboutBlurb && natureFinal) {
    setHint("natureOfBusiness", "medium", webUrl);
  } else if (natureFinal) {
    setHint("natureOfBusiness", "medium", webUrl);
  }

  const area =
    web?.schemaLocality ||
    extractArea(combined) ||
    (/\baustralia\b/i.test(`${pageTitle} ${combined}`) ? "Australia" : undefined);
  if (web?.schemaLocality) setHint("serviceAreas", "high", webUrl);
  else if (area) setHint("serviceAreas", "medium", webUrl);

  const navRaw = filterServiceLabels(web?.navServices ?? []);
  const textRaw = extractServices(combined);
  const contextSignal = [industry, natureFinal, pageTitle, trading || companyName]
    .filter(Boolean)
    .join(" · ");
  const partitioned = partitionServicesAndProductCategories(
    navRaw.length > 0 ? navRaw : textRaw,
    contextSignal,
  );
  let services = partitioned.services;
  const productCategories = partitioned.productCategories;
  if (services.length === 0 && productCategories.length > 0) {
    services = inferRetailServicesFromContext(contextSignal);
  }
  if (services.length > 0) setHint("services", "medium", webUrl);
  else if (navRaw.length > 0 || textRaw.length > 0) {
    // Categories-only retail scrape — leave services empty for enrich/templates
  }

  const scrapedAudience = extractTargetCustomers(combined);
  const targetCustomers =
    (scrapedAudience && !isWeakTargetCustomers(scrapedAudience)
      ? scrapedAudience
      : undefined) ||
    synthesizeTargetCustomers({
      natureOfBusiness: natureFinal,
      industry,
      tradingName: trading || companyName,
      serviceAreas: area ? [area] : undefined,
      title: pageTitle,
    });
  if (targetCustomers) setHint("targetCustomers", "medium", webUrl);

  const brandVoice = extractBrandVoice(combined);
  if (brandVoice) setHint("brandVoice", "medium", webUrl);

  const telCtas =
    web?.telHrefs?.map((t) => `Call ${t}`) ??
    (web?.schemaTelephone ? [`Call ${web.schemaTelephone}`] : []);
  const mailCtas = web?.mailtoHrefs?.map(() => "Email us") ?? [];
  const textCtas = extractCtas(combined);
  const callsToAction = [...new Set([...textCtas, ...telCtas, ...mailCtas])].slice(0, 6);
  if (telCtas.length || web?.schemaTelephone) setHint("callsToAction", "high", webUrl);
  else if (callsToAction.length) setHint("callsToAction", "medium", webUrl);

  // Only when an explicit offer signal exists — never invent offers.
  const currentOffers = extractOffer(combined);
  if (currentOffers) setHint("currentOffers", "medium", webUrl);

  const requiredDisclaimers = extractDisclaimersFromText(combined);
  const approvedClaims = extractApprovedClaimCandidates(combined);

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
  if (socialLinks.length) {
    setHint("socialLinks", "high", socialSource);
  }

  setHint("website", "high", urls.website);

  return {
    fields: {
      ...(legalName ? { legalName } : {}),
      tradingNames: trading,
      industry,
      website: urls.website,
      natureOfBusiness: natureFinal,
      serviceAreas: area ? [area] : undefined,
      services: services.length ? services : undefined,
      productCategories: productCategories.length ? productCategories : undefined,
      targetCustomers,
      brandVoice,
      callsToAction: callsToAction.length ? callsToAction : undefined,
      currentOffers,
      socialLinks,
      ...(approvedClaims.length ? { approvedClaims } : {}),
      ...(requiredDisclaimers.length ? { requiredDisclaimers } : {}),
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

  const loaded = await Promise.all(urlsToFetch.map((u) => loadPageContent(u)));
  const pages = loaded.map((l) => l.content);
  const websiteFetchedLive = loaded.some(
    (l, i) => l.fetchedLive && pages[i]?.kind === "website",
  );
  const anyFetchedLive = loaded.some((l) => l.fetchedLive);
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
    // Only report live when we actually fetched (not soft-sim fallback)
    mode: websiteFetchedLive || anyFetchedLive ? "live" : "simulated",
    consent: true,
    urls: input.urls,
    fields: fieldPreviews,
    sources,
    extras: {
      ...(extracted.productCategories?.length
        ? { productCategories: extracted.productCategories }
        : {}),
      ...(extracted.approvedClaims?.length
        ? { approvedClaims: extracted.approvedClaims }
        : {}),
      ...(extracted.requiredDisclaimers?.length
        ? { requiredDisclaimers: extracted.requiredDisclaimers }
        : {}),
    },
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
  if (extracted.productCategories?.length) {
    const existingCats = next.retail?.productCategories ?? [];
    if (overwrite || existingCats.length === 0) {
      next.retail = {
        productCategories: extracted.productCategories,
        heroProducts: next.retail?.heroProducts ?? [],
        promotions: next.retail?.promotions ?? [],
        seasons: next.retail?.seasons ?? [],
        pricePositioning: next.retail?.pricePositioning,
      };
      if (!next.businessType || next.businessType === "other") {
        next.businessType = "retail";
      }
    }
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
  if (
    extracted.approvedClaims?.length &&
    (overwrite || next.approvedClaims.length === 0)
  ) {
    next.approvedClaims = extracted.approvedClaims;
  }
  if (
    extracted.requiredDisclaimers?.length &&
    (overwrite || next.requiredDisclaimers.length === 0)
  ) {
    next.requiredDisclaimers = extracted.requiredDisclaimers;
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

  if (!next.businessType || next.businessType === "other") {
    const signal = [next.industry, extracted.industry, next.natureOfBusiness, extracted.natureOfBusiness]
      .filter(Boolean)
      .join(" · ");
    const { businessType } = enrichExtractedWithBusinessType({
      industry: signal || next.industry || extracted.industry,
    });
    if (!next.businessType || businessType !== "other") {
      next.businessType = businessType;
    }
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
  if (preview.extras?.productCategories?.length) {
    out.productCategories = preview.extras.productCategories;
  }
  if (preview.extras?.approvedClaims?.length) {
    out.approvedClaims = preview.extras.approvedClaims;
  }
  if (preview.extras?.requiredDisclaimers?.length) {
    out.requiredDisclaimers = preview.extras.requiredDisclaimers;
  }
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
