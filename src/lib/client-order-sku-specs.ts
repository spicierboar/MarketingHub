/**
 * Curated deliverable specs for important Extras — exactly what a client receives.
 * Sibling to the generated catalogue (do not hand-edit client-order-catalogue-data.ts —
 * add/adjust curated specs here instead).
 */

import {
  CLIENT_ORDER_CATEGORIES,
  type ClientMenuSku,
  type ClientMenuSkuId,
} from "@/lib/client-order-catalogue-data";

export type ExtraSkuSpec = {
  /** One-line description of the finished deliverable. */
  deliverable: string;
  /** What is included, as concrete bullet points. */
  includes: string[];
  /** What is explicitly out of scope, to avoid over-promising. */
  excludes?: string[];
  /** Typical word count / quantity, where useful to set expectations. */
  typicalLength?: string;
  /** Where the finished asset is meant to live. */
  channels?: string[];
};

const SPECS: Partial<Record<ClientMenuSkuId, ExtraSkuSpec>> = {
  aeo_answer_pack: {
    deliverable:
      "Answer-ready FAQ block written to be quoted directly by AI assistants and answer engines.",
    includes: [
      "5–8 question-and-answer pairs on your top customer questions",
      "Short, direct answers (typically 40–60 words) written to be quoted verbatim",
      "Structured headings so answers can be lifted cleanly by crawlers",
      "FAQ schema-ready formatting for your developer to add markup",
    ],
    excludes: [
      "FAQ schema markup / JSON-LD implementation (copy is structured for it; code is not included)",
      "Submission to ChatGPT, Perplexity, or other AI tools — there is no such thing as “submitting”",
    ],
    typicalLength: "5–8 Q&A pairs, ~40–60 words per answer",
    channels: ["Website FAQ / service pages", "Google Business Profile Q&A"],
  },
  geo_authority_pack: {
    deliverable:
      "Citation-ready authority article with clear entities and evidence for generative AI systems to reference.",
    includes: [
      "800–1,200 word article with named entities and specific facts, not vague claims",
      "Clear sourcing/evidence backing each key claim",
      "Structured subheadings for easy machine parsing",
    ],
    excludes: [
      "Guaranteed citation by any specific AI tool",
      "Backlink or PR outreach",
    ],
    typicalLength: "800–1,200 words",
    channels: ["Website blog / resource library"],
  },
  llmo_machine_readable_pack: {
    deliverable:
      "Chunked, entity-clear website copy structured for LLM retrieval and AI assistants.",
    includes: [
      "Page copy broken into clearly-labelled, self-contained sections (chunks)",
      "Consistent entity naming (business name, services, locations) throughout",
      "Heading hierarchy that supports retrieval-style parsing",
    ],
    excludes: [
      "Vector database or embeddings setup",
      "Any AI plug-in / assistant integration",
    ],
    typicalLength: "1 page, section-based",
    channels: ["Website page copy"],
  },
  seo_on_page_pack: {
    deliverable:
      "Titles, meta descriptions, headings, and snippet-ready on-page copy for the pages you nominate.",
    includes: [
      "SEO title tag + meta description per page (character-limit checked)",
      "H1/H2 heading structure with target keywords",
      "Snippet-ready summary paragraph",
    ],
    excludes: [
      "Technical SEO fixes (site speed, redirects, schema code)",
      "Link building",
    ],
    typicalLength: "Up to 5 pages per pack (ask if you need more)",
    channels: ["Website page <head> / CMS fields"],
  },
  local_seo_visibility_pack: {
    deliverable:
      "Location-specific page copy and Google Business Profile–oriented content for Maps and “near me” search.",
    includes: [
      "Location/suburb landing copy with consistent name-address-phone (NAP) style facts",
      "Google Business Profile description and post-ready copy",
      "Local FAQ block",
    ],
    excludes: [
      "Google Business Profile account setup or verification",
      "Citations/directory listing submissions",
    ],
    typicalLength: "1 location page + Google Business Profile copy",
    channels: ["Website location page", "Google Business Profile"],
  },
  featured_snippet_pack: {
    deliverable:
      "Tight question-and-answer blocks shaped to win Google's featured-snippet / position-zero style results.",
    includes: [
      "4–6 direct-answer Q&A blocks (definition, list, or table format matched to the question type)",
      "Supporting page copy for context",
    ],
    excludes: [
      "Guaranteed featured-snippet placement — Google decides this",
      "Rank tracking or reporting",
    ],
    typicalLength: "4–6 Q&A blocks",
    channels: ["Website blog / service pages"],
  },
  course_outline: {
    deliverable:
      "Structured course outline — modules, learning objectives, and session flow — ready to build slides or content from.",
    includes: [
      "Module/session breakdown with a learning objective per module",
      "Suggested duration per module",
      "Assessment or activity suggestions",
    ],
    excludes: ["Slide decks, worksheets, or filmed content (separate Extras)", "LMS upload"],
    typicalLength: "1 outline covering the full course",
    channels: ["Document delivered for your LMS or facilitator pack"],
  },
  course_module: {
    deliverable:
      "One fully-written training module — content, structure, and activity prompts for a single session.",
    includes: [
      "Written module content aligned to the stated objective",
      "Activity or discussion prompts",
      "Key-takeaways summary",
    ],
    excludes: ["Slide design", "Facilitation / delivery of the session"],
    typicalLength: "1 module, roughly 800–1,500 words",
    channels: ["Document for your LMS, workshop, or print"],
  },
  lesson_plan: {
    deliverable: "Single-session lesson plan with timing, activities, and a materials list.",
    includes: [
      "Session objective and timing breakdown",
      "Step-by-step activity sequence",
      "Materials / prep checklist",
    ],
    excludes: ["Printed materials or worksheets themselves (order separately if needed)"],
    typicalLength: "1 lesson, timed sequence",
    channels: ["Document for facilitators"],
  },
  job_advertisement: {
    deliverable: "Ready-to-post job ad — role summary, responsibilities, requirements, and how to apply.",
    includes: [
      "Role summary and key responsibilities",
      "Must-have vs nice-to-have requirements",
      "Pay/benefits line (if you provide the detail) and application instructions",
    ],
    excludes: ["Job board posting/publishing itself", "Candidate screening or interviewing"],
    typicalLength: "300–500 words",
    channels: ["Careers page", "Job boards (LinkedIn, Seek, Indeed, and similar)"],
  },
  social_media_post: {
    deliverable: "One platform-ready social media post — caption, structure, and hashtag/CTA suggestions.",
    includes: [
      "Post copy sized for the platform you brief",
      "Suggested hashtags and a call-to-action",
      "Alt-text suggestion for any image",
    ],
    excludes: ["Image/video creation", "Scheduling or publishing (unless connected)"],
    typicalLength: "1 post",
    channels: ["Instagram, Facebook, LinkedIn, X, or the platform you specify"],
  },
  blog_article: {
    deliverable: "One publish-ready blog article on your chosen topic.",
    includes: [
      "800–1,200 word article with intro, subheadings, and conclusion",
      "SEO title and meta description",
      "Suggested internal links / call-to-action",
    ],
    excludes: [
      "Images or graphics (unless separately scoped)",
      "Publishing to a CMS you have not connected",
    ],
    typicalLength: "800–1,200 words",
    channels: ["Blog / CMS"],
  },
  landing_page_copy: {
    deliverable: "Full landing page copy built around one offer and one clear call-to-action.",
    includes: [
      "Headline and subheadline options",
      "Benefit/feature sections and social-proof placeholders",
      "One primary call-to-action, repeated appropriately down the page",
    ],
    excludes: ["Page design/layout or development", "Paid media setup"],
    typicalLength: "1 page, section-by-section copy",
    channels: ["Landing page / hosted page builder"],
  },
  homepage_copy: {
    deliverable: "Full homepage copy — hero, key sections, and navigation-supporting microcopy.",
    includes: [
      "Hero headline and subheadline",
      "Key sections (what you do, who it's for, proof, call-to-action)",
      "Meta title/description for the page",
    ],
    excludes: ["Page design or development", "Site navigation restructuring"],
    typicalLength: "1 page, full section set",
    channels: ["Website homepage"],
  },
  press_release: {
    deliverable: "Wire-ready press release for a specific news moment.",
    includes: [
      "Headline and dateline",
      "Body copy in standard release structure (who/what/why, quote, boilerplate)",
      "Boilerplate company description and media contact line",
    ],
    excludes: ["Distribution to media lists or wire services", "Media follow-up / pitching"],
    typicalLength: "300–500 words",
    channels: ["Email to media list", "News/press page on your site"],
  },
};

export function getExtraSkuSpec(skuId: string): ExtraSkuSpec | undefined {
  return SPECS[skuId as ClientMenuSkuId];
}

/**
 * Thin fallback for the 670+ catalogue items without a curated spec —
 * built from the item's own blurb and category so "You receive" never renders empty.
 */
export function getExtraSkuSpecOrDefault(sku: ClientMenuSku): ExtraSkuSpec {
  const curated = getExtraSkuSpec(sku.id);
  if (curated) return curated;

  const category = CLIENT_ORDER_CATEGORIES.find((c) => c.id === sku.categoryId);
  return {
    deliverable: sku.title,
    includes: [
      sku.blurb.replace(/\.$/, ""),
      category ? `Fits within ${category.label.toLowerCase()}: ${category.blurb.toLowerCase()}` : undefined,
    ].filter((line): line is string => Boolean(line)),
  };
}
