/**
 * Generate src/lib/client-order-catalogue-data.ts from the taxonomy backlog.
 * Run: node scripts/generate-client-order-catalogue.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const md = fs.readFileSync(
  path.join(root, "docs/CONTENT-CREATE-TAXONOMY-BACKLOG.md"),
  "utf8",
);
const start = md.indexOf("### 2. Content Type");
const end = md.indexOf("### 3. Optimise For");
const chunk = md.slice(start, end);
const lines = chunk.split(/\r?\n/);

const SECTION_META = {
  A: {
    id: "social",
    label: "Social media",
    blurb: "Posts, captions, threads, and social formats",
    contentType: "social_post",
    requestType: "social_post",
    primaryChannel: "instagram",
    priceFromAud: 129,
    cookFamily: "short_social",
  },
  B: {
    id: "editorial",
    label: "Articles & editorial",
    blurb: "Blog posts, guides, reviews, and commentary",
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    priceFromAud: 279,
    cookFamily: "long_editorial",
  },
  C: {
    id: "website",
    label: "Website content",
    blurb: "Page copy, listings, and on-site microcopy",
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    priceFromAud: 229,
    cookFamily: "web_page",
  },
  D: {
    id: "landing",
    label: "Landing & conversion",
    blurb: "Landing pages, CTAs, and conversion sections",
    contentType: "landing_page",
    requestType: "landing_page",
    primaryChannel: "website_blog_cms",
    priceFromAud: 349,
    cookFamily: "landing_conversion",
  },
  E: {
    id: "email",
    label: "Email",
    blurb: "Newsletters, sequences, and transactional email",
    contentType: "email_newsletter",
    requestType: "email_newsletter",
    primaryChannel: "email",
    priceFromAud: 149,
    cookFamily: "email",
  },
  F: {
    id: "advertising",
    label: "Advertising",
    blurb: "Paid media copy across search, social, and display",
    contentType: "ad_copy",
    requestType: "ad_copy",
    primaryChannel: "paid_media",
    priceFromAud: 179,
    cookFamily: "ad",
  },
  G: {
    id: "video",
    label: "Video & audio",
    blurb: "Scripts, show notes, and AV copy",
    contentType: "video_script",
    requestType: "video_script",
    primaryChannel: "instagram",
    priceFromAud: 149,
    cookFamily: "script_av",
  },
  H: {
    id: "sales",
    label: "Sales & business development",
    blurb: "Proposals, pitch decks, and sales leave-behinds",
    contentType: "proposal",
    requestType: "proposal",
    primaryChannel: "website_blog_cms",
    priceFromAud: 299,
    cookFamily: "sales_doc",
  },
  I: {
    id: "pr",
    label: "PR & corporate communications",
    blurb: "Press releases, statements, and media kits",
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    priceFromAud: 249,
    cookFamily: "long_editorial",
  },
  J: {
    id: "reports",
    label: "Reports & research",
    blurb: "Reports, summaries, and research write-ups",
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    priceFromAud: 399,
    cookFamily: "long_editorial",
  },
  K: {
    id: "proof",
    label: "Case studies & proof",
    blurb: "Case studies, testimonials, and proof assets",
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    priceFromAud: 299,
    cookFamily: "long_editorial",
  },
  L: {
    id: "education",
    label: "Education & training",
    blurb: "Courses, worksheets, and training materials",
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "website_blog_cms",
    priceFromAud: 249,
    cookFamily: "long_editorial",
  },
  M: {
    id: "internal",
    label: "Internal communications",
    blurb: "Internal memos, updates, and staff messaging",
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "email",
    priceFromAud: 149,
    cookFamily: "web_page",
  },
  N: {
    id: "hr",
    label: "HR & recruitment",
    blurb: "Job ads, careers pages, and employer brand",
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    priceFromAud: 199,
    cookFamily: "web_page",
  },
  O: {
    id: "legal",
    label: "Legal, regulatory & compliance",
    blurb: "Plain-language policies and compliance copy",
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    priceFromAud: 349,
    cookFamily: "web_page",
  },
  P: {
    id: "events",
    label: "Events & webinars",
    blurb: "Event pages, invites, and webinar copy",
    contentType: "landing_page",
    requestType: "landing_page",
    primaryChannel: "website_blog_cms",
    priceFromAud: 229,
    cookFamily: "landing_conversion",
  },
  Q: {
    id: "print",
    label: "Print & promotional",
    blurb: "Brochures, flyers, leave-behinds, and promo materials",
    contentType: "brochure_copy",
    requestType: "brochure_copy",
    primaryChannel: "website_blog_cms",
    priceFromAud: 249,
    cookFamily: "sales_doc",
  },
  R: {
    id: "support",
    label: "Customer service & support",
    blurb: "FAQs, help articles, and support macros",
    contentType: "faq",
    requestType: "faq",
    primaryChannel: "website_blog_cms",
    priceFromAud: 149,
    cookFamily: "support",
  },
  S: {
    id: "product",
    label: "Product & software",
    blurb: "Product copy, release notes, and UX microcopy",
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "website_blog_cms",
    priceFromAud: 229,
    cookFamily: "web_page",
  },
  T: {
    id: "messaging",
    label: "Messaging & short-form",
    blurb: "Taglines, SMS, push, and short messages",
    contentType: "ad_copy",
    requestType: "ad_copy",
    primaryChannel: "paid_media",
    priceFromAud: 99,
    cookFamily: "ad",
  },
};

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

const sections = [];
let cur = null;
for (const line of lines) {
  const h = line.match(/^#### ([A-T])\. (.+)$/);
  if (h) {
    cur = { letter: h[1], title: h[2], items: [] };
    sections.push(cur);
    continue;
  }
  const item = line.match(/^- (.+)$/);
  if (item && cur) cur.items.push(item[1]);
}

function channelFor(title, fallback) {
  const t = title.toLowerCase();
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("tiktok")) return "tiktok";
  if (t.includes("instagram") || t.includes("reel")) return "instagram";
  if (t.includes("youtube short")) return "youtube_shorts";
  if (t.includes("facebook")) return "facebook";
  if (t.includes("google business")) return "google_business_profile";
  if (t.includes("email") || t.includes("newsletter")) return "email";
  if (t.includes("search ad") || t.includes("display ad") || t.includes("paid"))
    return "paid_media";
  return fallback;
}

function contentTypeOverride(title, letter, base) {
  const t = title.toLowerCase();
  if (letter === "H") {
    if (
      t.includes("brochure") ||
      t.includes("one-pager") ||
      t.includes("sheet") ||
      t.includes("battlecard") ||
      t.includes("flyer")
    ) {
      return { contentType: "brochure_copy", requestType: "brochure_copy" };
    }
    return { contentType: "proposal", requestType: "proposal" };
  }
  if (t.includes("faq")) return { contentType: "faq", requestType: "faq" };
  if (
    t.includes("meta title") ||
    t.includes("meta description") ||
    t.includes("seo title")
  ) {
    return { contentType: "seo_meta", requestType: "seo_meta" };
  }
  if (
    t.includes("landing page") ||
    t.includes("squeeze page") ||
    t.includes("sales page")
  ) {
    return { contentType: "landing_page", requestType: "landing_page" };
  }
  return { contentType: base.contentType, requestType: base.requestType };
}

const used = new Set();
const skus = [];
const categories = [];

for (const s of sections) {
  const meta = SECTION_META[s.letter];
  categories.push({ id: meta.id, label: meta.label, blurb: meta.blurb });
  for (const title of s.items) {
    let id = slugify(title);
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    used.add(id);
    const ct = contentTypeOverride(title, s.letter, meta);
    const channel = channelFor(title, meta.primaryChannel);
    let price = meta.priceFromAud;
    if (title.toLowerCase().includes("ultimate") || title.toLowerCase().includes("annual report")) {
      price += 100;
    }
    if (
      title.toLowerCase().includes("caption") ||
      title.toLowerCase().includes("subject line") ||
      title.toLowerCase().includes("tagline")
    ) {
      price = Math.max(79, price - 40);
    }

    skus.push({
      id,
      categoryId: meta.id,
      title,
      blurb: `Professional ${title.toLowerCase()} drafted to your brand, then reviewed before publish.`,
      priceFromAud: price,
      contentType: ct.contentType,
      requestType: ct.requestType,
      primaryChannel: channel,
      cookFamily: meta.cookFamily,
      marker: `menu_order:${id}`,
      dishLabel: title,
    });
  }
}

categories.push({
  id: "discovery",
  label: "SEO, AEO, GEO & LLMO",
  blurb: "Search and AI-discovery optimisation packs",
});

const discovery = [
  {
    id: "aeo_answer_pack",
    title: "AEO answer pack",
    blurb: "Answer-engine ready FAQ and extractable answers.",
    priceFromAud: 249,
    contentType: "faq",
    requestType: "faq",
    primaryChannel: "aeo_geo",
    cookFamily: "support",
    optimiseFor: ["aeo", "ai_discovery"],
  },
  {
    id: "geo_authority_pack",
    title: "GEO authority pack",
    blurb: "Citation-ready, evidence-led content for generative engines.",
    priceFromAud: 349,
    contentType: "blog_article",
    requestType: "blog_article",
    primaryChannel: "aeo_geo",
    cookFamily: "long_editorial",
    optimiseFor: ["geo", "ai_discovery"],
  },
  {
    id: "llmo_machine_readable_pack",
    title: "LLMO machine-readable pack",
    blurb: "Chunked, entity-clear copy for LLM retrieval and assistants.",
    priceFromAud: 329,
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "aeo_geo",
    cookFamily: "web_page",
    optimiseFor: ["llmo", "ai_discovery"],
  },
  {
    id: "seo_on_page_pack",
    title: "On-page SEO pack",
    blurb: "Titles, metas, headings, and snippet-ready on-page copy.",
    priceFromAud: 199,
    contentType: "seo_meta",
    requestType: "seo_meta",
    primaryChannel: "website_blog_cms",
    cookFamily: "meta_seo",
    optimiseFor: ["seo"],
  },
  {
    id: "local_seo_visibility_pack",
    title: "Local SEO visibility pack",
    blurb: "Local pack and Maps-oriented location content.",
    priceFromAud: 229,
    contentType: "website_copy",
    requestType: "website_copy",
    primaryChannel: "google_business_profile",
    cookFamily: "web_page",
    optimiseFor: ["seo"],
  },
  {
    id: "featured_snippet_pack",
    title: "Featured snippet pack",
    blurb: "Question/answer blocks shaped for featured snippets.",
    priceFromAud: 219,
    contentType: "faq",
    requestType: "faq",
    primaryChannel: "website_blog_cms",
    cookFamily: "support",
    optimiseFor: ["seo", "aeo"],
  },
];

for (const d of discovery) {
  skus.push({
    ...d,
    categoryId: "discovery",
    marker: `menu_order:${d.id}`,
    dishLabel: d.title,
  });
}

function tsLiteral(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${pad}  ${tsLiteral(v, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const lines = keys.map(
      (k) => `${pad}  ${k}: ${tsLiteral(value[k], indent + 1)}`,
    );
    return `{\n${lines.join(",\n")},\n${pad}}`;
  }
  return JSON.stringify(value);
}

const categoryIds = categories.map((c) => c.id);
const header = `/**
 * Auto-generated from docs/CONTENT-CREATE-TAXONOMY-BACKLOG.md Content Type catalogue.
 * Do not hand-edit item lists — re-run: node scripts/generate-client-order-catalogue.mjs
 */

import type {
  ContentTypeId,
  CookFamilyId,
  OptimiseForId,
  RecipeChannelId,
} from "@/lib/content-recipe";
import type { RequestType } from "@/lib/types";

export type ClientMenuCategoryId =
${categoryIds.map((id) => `  | "${id}"`).join("\n")};

export type ClientMenuSkuId = string;

export type ClientMenuSku = {
  id: ClientMenuSkuId;
  categoryId: ClientMenuCategoryId;
  title: string;
  blurb: string;
  priceFromAud: number;
  contentType: ContentTypeId;
  requestType: RequestType;
  primaryChannel: RecipeChannelId;
  cookFamily: CookFamilyId;
  /** Exact deliverable name for cook prompts */
  dishLabel: string;
  marker: string;
  optimiseFor?: OptimiseForId[];
};

export const CLIENT_ORDER_CATEGORIES: readonly {
  id: ClientMenuCategoryId;
  label: string;
  blurb: string;
}[] = ${tsLiteral(categories)} as const;

export const CLIENT_ORDER_MENU: readonly ClientMenuSku[] = ${tsLiteral(skus)} as const;
`;

const outPath = path.join(root, "src/lib/client-order-catalogue-data.ts");
fs.writeFileSync(outPath, header);
console.log(
  `Wrote ${skus.length} SKUs across ${categories.length} categories → ${outPath}`,
);
