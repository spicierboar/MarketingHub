/**
 * Client-facing Extra explainers: what it is, how to use it, how we deploy it.
 * Category defaults + item overrides (AEO/GEO/LLMO and other specialised packs).
 */

import type { ClientMenuSku } from "@/lib/client-order-catalogue-data";
import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

export type ExtraOrderExplainer = {
  about: string;
  usedFor: string;
  deployed: string;
};

const DEPLOY_DEFAULT =
  "You fill in the brief → we draft → you (or your agency) review and approve → we publish or hand over the finished asset. Nothing goes live without approval.";

const BY_CATEGORY: Record<
  ClientMenuCategoryId,
  ExtraOrderExplainer
> = {
  social: {
    about:
      "Short-form copy written for a social platform (posts, captions, threads, carousels, and similar).",
    usedFor:
      "Keep your feed active, announce offers, answer questions, or support a campaign without writing every post yourself.",
    deployed:
      "Draft is prepared for the platform you brief. After approval we schedule or publish to your connected social accounts, or export copy for your team to post.",
  },
  editorial: {
    about:
      "Longer written content — articles, guides, reviews, and thought leadership — shaped for your brand voice.",
    usedFor:
      "Build trust, rank for topics people search, educate buyers, or support sales with shareable articles.",
    deployed:
      "We draft the piece against your brief. After approval it is published to your blog/CMS or delivered as final copy for your site.",
  },
  website: {
    about:
      "On-site page and listing copy (home, about, services, products, locations, and related pages).",
    usedFor:
      "Clarify what you do, improve conversion on key pages, and keep public information accurate.",
    deployed:
      "Approved copy is applied to the relevant website page (or handed over for your developer/CMS). We do not change live pages without approval.",
  },
  landing: {
    about:
      "Conversion-focused page or section copy built around one offer and one clear next step.",
    usedFor:
      "Campaigns, ads, promotions, and lead capture where you want visitors to book, buy, or enquire.",
    deployed:
      "After approval we publish to a landing page / hosted page where set up, or deliver paste-ready copy for your site builder.",
  },
  email: {
    about:
      "Email copy — single sends, newsletters, or multi-message sequences — with subject and body.",
    usedFor:
      "Nurture leads, welcome new contacts, promote offers, or keep customers informed.",
    deployed:
      "Approved emails are loaded into your email tool or sent via connected email marketing where available. Sequences go out on the schedule you approve.",
  },
  advertising: {
    about:
      "Paid-media copy (search, social, display) — headlines, descriptions, and offer lines within platform limits.",
    usedFor:
      "Drive traffic and enquiries from ads when organic reach alone is not enough.",
    deployed:
      "After approval we supply ad-ready copy (and structure) for your ads account, or load it where media access is connected. You control budget and go-live.",
  },
  video: {
    about:
      "Scripts, captions, and AV support copy for video or audio — not the filmed production unless separately scoped.",
    usedFor:
      "Reels, YouTube, training clips, podcasts, and ads that need a clear spoken or on-screen narrative.",
    deployed:
      "You receive an approved script/caption pack. Your team or production partner films; we can also supply captions for upload after approval.",
  },
  sales: {
    about:
      "Sales-enablement writing — proposals, one-pagers, pitch support, and leave-behinds.",
    usedFor:
      "Help your team win deals with clear, on-brand materials for prospects.",
    deployed:
      "Approved documents are delivered as final copy (and formatted files where applicable) for your sales team to send or present.",
  },
  pr: {
    about:
      "Public and media communications — releases, statements, and press-facing materials.",
    usedFor:
      "Announce news, manage reputation moments, and brief journalists consistently.",
    deployed:
      "After approval we deliver wire-ready copy. Distribution to media lists is done by you or by the agency if that service is included.",
  },
  reports: {
    about:
      "Structured written reports and summaries of performance, research, or progress.",
    usedFor:
      "Share results with stakeholders, clients, or leadership in plain language.",
    deployed:
      "Approved report is delivered as a document (and can be attached to your portal results where relevant).",
  },
  proof: {
    about:
      "Evidence assets — case studies, testimonials, and proof points you are allowed to publish.",
    usedFor:
      "Build credibility on the website, in sales decks, and in campaigns.",
    deployed:
      "After approval we publish to agreed channels (site, PDF, sales pack) or hand over final copy. Named clients only appear with your consent.",
  },
  education: {
    about:
      "Learning materials — outlines, modules, worksheets, quizzes, and training guides.",
    usedFor:
      "Train staff or customers, run workshops, or package knowledge as a course.",
    deployed:
      "Approved materials are delivered as structured documents ready for your LMS, workshop, or print. We do not enrol learners unless that is a separate service.",
  },
  internal: {
    about:
      "Internal staff communications — updates, memos, agendas, and change messages.",
    usedFor:
      "Keep teams aligned without writing every announcement from scratch.",
    deployed:
      "Approved copy is delivered for intranet, email, or messaging tools your team uses. Internal send is usually by you or HR.",
  },
  hr: {
    about:
      "People and hiring copy — job ads, role profiles, careers messaging, and related HR communications.",
    usedFor:
      "Attract the right candidates and communicate clearly with applicants and staff.",
    deployed:
      "Approved copy is published to careers pages / job boards you use, or handed to HR to post. Applications still flow through your hiring process.",
  },
  legal: {
    about:
      "Plain-language policies and compliance-oriented copy. We clarify wording; we are not your lawyers.",
    usedFor:
      "Make rules readable for customers and staff while keeping obligations accurate.",
    deployed:
      "Approved text is delivered for your website or handbook. Legal sign-off remains with you (and your counsel) before publish when required.",
  },
  events: {
    about:
      "Event and webinar copy — pages, invites, agendas, and supporting messages.",
    usedFor:
      "Fill seats, set expectations, and make attendance easy.",
    deployed:
      "After approval we publish event pages / emails where connected, or deliver copy for your ticketing and invite tools.",
  },
  print: {
    about:
      "Copy for physical or PDF collateral — flyers, brochures, posters, and leave-behinds.",
    usedFor:
      "Local awareness, in-store information, letterbox drops, and sales meetings.",
    deployed:
      "Approved copy (and layout notes) is delivered for your printer or design partner. Print production and distribution are usually separate.",
  },
  support: {
    about:
      "Help and service content — FAQs, help articles, and support macros.",
    usedFor:
      "Reduce repeat questions and give customers clear self-serve answers.",
    deployed:
      "Approved content is published to your help centre / FAQ page or loaded into support tools where connected.",
  },
  product: {
    about:
      "Product and software copy — descriptions, release notes, and UX microcopy.",
    usedFor:
      "Explain features, updates, and flows so users understand what changed.",
    deployed:
      "Approved copy is handed to your product/web team for release, or published to agreed product pages after approval.",
  },
  messaging: {
    about:
      "Very short messages — SMS, push, taglines, and other microcopy.",
    usedFor:
      "Reminders, alerts, and punchy lines where every character counts.",
    deployed:
      "Approved messages are delivered for your SMS/push tools, or sent via connected channels on the schedule you approve.",
  },
  discovery: {
    about:
      "Search and AI-discovery content — so people (and AI assistants) can find and correctly describe your business.",
    usedFor:
      "Improve visibility in Google, Maps, and answer engines (ChatGPT, Perplexity, Google AI Overviews, and similar).",
    deployed:
      "Approved answer blocks and page copy are published to your site / profiles where we have access, or delivered for your team to paste. Discovery improves over time as engines re-crawl.",
  },
};

/** Item-level overrides for specialised or jargon-heavy Extras. */
function itemOverride(sku: ClientMenuSku): ExtraOrderExplainer | null {
  const h = `${sku.id} ${sku.title}`.toLowerCase();

  if (h.includes("aeo") || sku.id === "aeo_answer_pack") {
    return {
      about:
        "AEO means Answer Engine Optimisation. AI assistants and AI search (for example ChatGPT, Perplexity, and Google AI Overviews) prefer short, clear answers they can quote. This pack creates those extractable Q&A blocks about your business — not a traditional blog post.",
      usedFor:
        "When customers ask AI “who’s the best… near me?”, “do they offer…?”, or similar. Use it for high-intent services, locations, and FAQs you want assistants to get right.",
      deployed:
        "We draft answer-ready FAQ and short answer blocks. After your approval we publish them to your site (FAQ / service pages) or Profiles where connected, so crawlers and answer engines can reuse them. Results build as engines refresh — not overnight ads.",
    };
  }

  if (h.includes("geo_authority") || sku.id.includes("geo_")) {
    return {
      about:
        "GEO means Generative Engine Optimisation. It is evidence-led, citation-friendly content so generative AI systems can trust and reference what you say about your brand.",
      usedFor:
        "Authority topics where AI might summarise your industry — and you want your facts, not vague claims, in those summaries.",
      deployed:
        "We draft citation-ready articles or sections with clear entities and evidence. After approval they go on your site (or library). Generative engines may cite them when they re-index — we do not “submit” to ChatGPT directly.",
    };
  }

  if (h.includes("llmo") || sku.id.includes("llmo")) {
    return {
      about:
        "LLMO means Large Language Model Optimisation. Copy is chunked and entity-clear so AI retrieval and assistants can parse who you are, what you offer, and where you operate.",
      usedFor:
        "Businesses that want AI tools to describe them accurately in chats, copilots, and internal assistants.",
      deployed:
        "We deliver machine-readable, well-structured page sections. After approval they are published to your website. Assistants improve as they ingest updated public pages.",
    };
  }

  if (h.includes("seo_on_page") || h.includes("on-page seo") || sku.id === "seo_on_page_pack") {
    return {
      about:
        "On-page SEO is the titles, meta descriptions, headings, and snippet-ready copy search engines read on each page.",
      usedFor:
        "Pages you want to rank or click through better in Google — services, locations, and key offers.",
      deployed:
        "After approval we update (or hand over) titles, metas, and heading copy on the agreed pages. Rankings move gradually as Google recrawls.",
    };
  }

  if (h.includes("local_seo") || h.includes("local pack")) {
    return {
      about:
        "Local SEO content for Maps and “near me” search — location pages and Google Business–oriented copy.",
      usedFor:
        "Multi-location or suburb-focused businesses that need clear local landing content and consistent NAP-style facts.",
      deployed:
        "Approved copy is published to location pages and/or Google Business Profile where connected. Visibility improves as Google refreshes local results.",
    };
  }

  if (h.includes("featured_snippet")) {
    return {
      about:
        "Featured snippet packs are tight question-and-answer blocks shaped so Google can lift them into position-zero style results.",
      usedFor:
        "Common customer questions where a direct answer can win more clicks from search.",
      deployed:
        "Approved Q&A blocks are published on relevant site pages. Snippet eligibility depends on Google — we structure for it; we cannot guarantee a featured slot.",
    };
  }

  if (h.includes("course") || h.includes("workshop_outline") || h.includes("lesson_plan")) {
    return {
      about: BY_CATEGORY.education.about,
      usedFor:
        "Run internal training, customer education, or a paid workshop with a clear structure before you build slides or film.",
      deployed:
        "You receive an approved outline/module pack. Your facilitators deliver the session; we can later add worksheets or scripts as separate Extras.",
    };
  }

  if (h.includes("press_release")) {
    return {
      about: BY_CATEGORY.pr.about,
      usedFor:
        "Announce openings, awards, partnerships, or other newsworthy moments to media and stakeholders.",
      deployed:
        "Wire-ready release after approval. You (or PR) send to media; we can publish a news version on your site if requested.",
    };
  }

  if (h.includes("job_ad") || h.includes("job_advertisement")) {
    return {
      about: BY_CATEGORY.hr.about,
      usedFor:
        "Attract applicants with clear duties, must-haves, pay band, and how to apply.",
      deployed:
        "Approved ad copy is posted to careers / job boards you use, or handed to HR. Screening and interviews stay with you.",
    };
  }

  return null;
}

export function getExtraOrderExplainer(sku: ClientMenuSku): ExtraOrderExplainer {
  const override = itemOverride(sku);
  if (override) return override;

  const base = BY_CATEGORY[sku.categoryId];
  // Prefer catalogue blurb when it adds specificity, but keep structured trio
  const about =
    sku.blurb && !/professional .+ drafted to your brand/i.test(sku.blurb)
      ? `${sku.blurb.replace(/\.$/, "")}. ${base.about}`
      : `${sku.title}: ${base.about}`;

  return {
    about,
    usedFor: base.usedFor,
    deployed: base.deployed || DEPLOY_DEFAULT,
  };
}
