// AI content drafting (master prompt §24), grounded in the company Brand Brain
// (Phase 2): profile + knowledge-base snippets + service catalogue + Local Area
// Intelligence Profile + Claims Library + local-manager answers. Returns the
// draft plus structured source references so provenance is auditable.
// Falls back to a deterministic template when no API key is configured.

import { AI_MODEL } from "@/lib/ai/claude";
import { guardedClaudeCall, sanitizeAiUserInput } from "@/lib/security-slice";
import { buildBusinessProfileAiContext } from "@/lib/business-profiles";
import { buildLocalIntelAiContext } from "@/lib/local-area-intel";
import {
  applyCitationsToBody,
  retrieveApprovedSnippets,
} from "@/lib/brand-brain-rag";
import { dishDeliveryPrompt } from "@/lib/ai/cook-family-prompts";
import { getLocalProfile, listClaims, listServices, liveOffers } from "@/lib/db";
import { titleCase } from "@/lib/utils";
import type { Company, DraftTone, RequestType, SourceRef } from "@/lib/types";

export interface DraftInput {
  company: Company;
  requestType: RequestType;
  topic: string;
  objective: string;
  platform?: string;
  audience?: string;
  offer?: string;
  callToAction?: string;
  notes?: string;
  // Answered "Ask the Local Manager" questions for this request (Phase 2).
  managerAnswers?: { question: string; answer: string }[];
  // Phase 5 — Content Studio:
  tone?: DraftTone; // draft-comparison variants (§24)
  briefMode?: boolean; // landing_page → structured local landing page brief (§47)
  /** Exact Extras / recipe dish name for professional format matching */
  dishLabel?: string;
  /** Cook family for format guidance */
  cookFamily?: string;
  /** Optimise-for axes (seo, aeo, geo, llmo, …) */
  optimiseFor?: string[];
}

export const TONE_INSTRUCTIONS: Record<DraftTone, string> = {
  brand_default: "Use the company's brand voice exactly as described.",
  friendly: "Lean warm and neighbourly — first names, contractions, light emoji where the platform suits.",
  professional: "Polished and businesslike — no emoji, precise wording, complete sentences.",
  urgent: "Time-sensitive and action-first — lead with the deadline or scarcity, short sentences.",
  short_punchy: "As short as possible — headline energy, every word earns its place.",
};

export interface DraftResult {
  title: string;
  body: string;
  model: string;
  sources: string[];
  sourceRefs: SourceRef[];
}

function brandBrainContext(c: Company): string {
  const p = c.profile;
  const lines = [
    `Company: ${c.name}`,
    p.industry && `Industry: ${p.industry}`,
    p.natureOfBusiness && `Business: ${p.natureOfBusiness}`,
    p.services.length && `Services: ${p.services.join(", ")}`,
    p.serviceAreas.length && `Service areas: ${p.serviceAreas.join(", ")}`,
    p.targetCustomers && `Target customers: ${p.targetCustomers}`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.callsToAction.length && `Approved CTAs: ${p.callsToAction.join(" | ")}`,
    p.prohibitedClaims.length &&
      `PROHIBITED claims (never use): ${p.prohibitedClaims.join(" | ")}`,
    p.requiredDisclaimers.length &&
      `Required disclaimers: ${p.requiredDisclaimers.join(" | ")}`,
    p.currentOffers && `Current offers: ${p.currentOffers}`,
    p.localMarketNotes && `Local context: ${p.localMarketNotes}`,
    buildBusinessProfileAiContext(c),
  ].filter(Boolean);
  return lines.join("\n");
}

// Gather grounding material and the source list it implies (Phase 2).
async function gatherGrounding(input: DraftInput): Promise<{
  contextBlocks: string[];
  sources: string[];
  sourceRefs: SourceRef[];
}> {
  const { company } = input;
  const contextBlocks: string[] = [];
  const sources: string[] = ["Brand Brain: company profile"];
  const query = [input.topic, input.objective, input.offer, input.audience]
    .filter(Boolean)
    .join(" ");

  // Knowledge-base snippets (retrieved by relevance).
  const sourceRefs = await retrieveApprovedSnippets(company.id, query, 3);
  if (sourceRefs.length) {
    contextBlocks.push(
      "APPROVED SOURCE MATERIAL (ground the draft in this; cite nothing else):\n" +
        sourceRefs
          .map((r, i) => `[S${i + 1}] ${r.title}: ${r.snippet}`)
          .join("\n"),
    );
    sources.push(...sourceRefs.map((r) => `Knowledge base: ${r.title}`));
  }

  // Service catalogue records relevant to the topic (or the top active ones).
  const services = await listServices(company.id);
  const queryLower = query.toLowerCase();
  const matched = services.filter((s) =>
    s.name
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.length >= 4 && queryLower.includes(w)),
  );
  const chosen = (matched.length ? matched : services).slice(0, 3);
  if (chosen.length) {
    contextBlocks.push(
      "SERVICE CATALOGUE (use approved prices only where marked approved):\n" +
        chosen
          .map(
            (s) =>
              `- ${s.name}: ${s.description}` +
              (s.priceRange && s.priceApproved
                ? ` Price (approved): ${s.priceRange}.`
                : "") +
              (s.requiredDisclaimer ? ` Disclaimer: ${s.requiredDisclaimer}` : "") +
              (s.restrictions ? ` Restrictions: ${s.restrictions}` : ""),
          )
          .join("\n"),
    );
    sources.push(...chosen.map((s) => `Service catalogue: ${s.name}`));
  }

  // Local Area Intelligence Profile.
  const local = await getLocalProfile(company.id);
  const localCtx = buildLocalIntelAiContext(local);
  if (localCtx) {
    contextBlocks.push(localCtx);
    sources.push("Local Area Intelligence Profile");
  }

  // Claims Library — the only claims the AI may assert.
  const claims = await listClaims(company.id);
  if (claims.length) {
    contextBlocks.push(
      "APPROVED CLAIMS (the ONLY claims you may make, word-for-word):\n" +
        claims.map((c) => `- ${c.claimText}`).join("\n"),
    );
    sources.push("Claims Library");
  }

  // Offer & Promotion Manager (§30): the AI may only promote live approved
  // offers, using their approved wording. Channel-restricted offers are only
  // included when the target platform matches — never on unknown channels.
  const offers = (await liveOffers(company.id)).filter(
    (o) =>
      o.channelsAllowed.length === 0 ||
      (!!input.platform &&
        o.channelsAllowed.some(
          (c) => c.toLowerCase() === input.platform!.toLowerCase(),
        )),
  );
  if (offers.length) {
    contextBlocks.push(
      "LIVE APPROVED OFFERS (the ONLY offers you may promote, using this wording):\n" +
        offers
          .map(
            (o) =>
              `- ${o.name}: ${o.approvedWording}` +
              (o.endDate ? ` (ends ${o.endDate})` : "") +
              (o.requiredDisclaimer ? ` Disclaimer: ${o.requiredDisclaimer}` : ""),
          )
          .join("\n"),
    );
    sources.push(...offers.map((o) => `Offer: ${o.name}`));
  } else if (company.profile.currentOffers) {
    sources.push("Offer & Promotion Manager");
  }

  // Answered local-manager questions for this request.
  if (input.managerAnswers?.length) {
    contextBlocks.push(
      "LOCAL MANAGER ANSWERS (authoritative for this request):\n" +
        input.managerAnswers
          .map((g) => `Q: ${g.question}\nA: ${g.answer}`)
          .join("\n"),
    );
    sources.push("Local manager answers");
  }

  return { contextBlocks, sources, sourceRefs };
}

const TYPE_LABEL: Record<RequestType, string> = {
  social_post: "social media post",
  campaign: "campaign concept",
  blog_article: "blog article",
  email_newsletter: "email newsletter",
  ad_copy: "advertisement",
  landing_page: "landing page copy",
  creative_request: "creative brief",
  website_copy: "website page copy",
  faq: "FAQ section",
  video_script: "short video script",
  brochure_copy: "brochure copy",
  proposal: "proposal text",
  seo_meta: "SEO meta title and description set",
};

export async function draftContent(input: DraftInput): Promise<DraftResult> {
  const { company, requestType } = input;
  const topic = sanitizeAiUserInput(input.topic).text;
  const objective = sanitizeAiUserInput(input.objective).text;
  const platform = input.platform;
  const audience = sanitizeOptional(input.audience);
  const offer = sanitizeOptional(input.offer);
  const callToAction = sanitizeOptional(input.callToAction);
  const notes = sanitizeOptional(input.notes);
  const managerAnswers = input.managerAnswers?.map((g) => ({
    question: sanitizeAiUserInput(g.question).text,
    answer: sanitizeAiUserInput(g.answer).text,
  }));
  const groundedInput: DraftInput = {
    ...input,
    topic,
    objective,
    audience,
    offer,
    callToAction,
    notes,
    managerAnswers,
  };
  const label = input.briefMode
    ? "structured local landing page brief"
    : input.dishLabel || TYPE_LABEL[requestType];
  const title = `${input.briefMode ? "Landing Page Brief" : input.dishLabel || titleCase(requestType)} — ${topic}`.slice(0, 120);
  const { contextBlocks, sources, sourceRefs } = await gatherGrounding(groundedInput);
  const dishPrompt = dishDeliveryPrompt({
    dishLabel: input.dishLabel,
    cookFamily: input.cookFamily,
    optimiseFor: input.optimiseFor,
  });

  const system = [
    "You are the senior in-house marketing copywriter for a group of companies.",
    "Draft marketing content grounded ONLY in the approved company information below (the Brand Brain).",
    "Rules: match the brand voice; use only approved CTAs; NEVER use any prohibited claim;",
    "only make claims listed in the approved claims; do not invent statistics, prices, guarantees or testimonials;",
    "include any required disclaimer; keep it ready for human review. Return only the content itself, no preamble.",
    "Deliver the exact dish professionally and competently — agency-quality, publish-ready after human review.",
    dishPrompt,
    input.tone && input.tone !== "brand_default"
      ? `Tone for this variant: ${TONE_INSTRUCTIONS[input.tone]}`
      : "",
    input.briefMode
      ? "Return a STRUCTURED BRIEF with these exact headed sections: Page objective, Target audience, Headline, Sections, FAQ, Call to action, Proof points, Images needed, Compliance issues, SEO keywords, Form fields, Tracking requirements."
      : "",
    "",
    brandBrainContext(company),
    "",
    ...contextBlocks,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Draft a ${label}.`,
    `Objective: ${objective}`,
    `Topic / message: ${topic}`,
    platform && `Platform: ${platform}`,
    audience && `Audience: ${audience}`,
    offer && `Offer: ${offer}`,
    callToAction && `Preferred call to action: ${callToAction}`,
    notes && `Notes: ${notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await guardedClaudeCall({
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.name,
    system,
    user,
    maxTokens: input.cookFamily === "long_editorial" || input.cookFamily === "sales_doc" ? 2400 : 1600,
  });
  if (ai) {
    return {
      title,
      body: applyCitationsToBody(ai, sourceRefs),
      model: AI_MODEL,
      sources,
      sourceRefs,
    };
  }

  return {
    title,
    body: applyCitationsToBody(await templateDraft(groundedInput, sourceRefs), sourceRefs),
    model: "template (no API key)",
    sources,
    sourceRefs,
  };
}

// Apply a tone variant to a template draft (deterministic so comparison
// variants differ visibly without an API key).
function applyTone(body: string, tone?: DraftTone): string {
  switch (tone) {
    case "professional":
      return body.replace(/[\u{1F300}-\u{1FAFF}☀-➿]\s?/gu, "");
    case "urgent":
      return `Don't wait — this one's time-sensitive.\n\n${body}`;
    case "short_punchy": {
      const lines = body.split("\n").filter(Boolean);
      return lines.slice(0, Math.max(2, Math.ceil(lines.length / 2))).join("\n");
    }
    case "friendly":
      return `${body}\n\nSee you soon! 👋`;
    default:
      return body;
  }
}

// Deterministic fallback so the workflow is demonstrable without a key.
// Weaves in the top knowledge-base snippet so grounding is still visible.
async function templateDraft(input: DraftInput, refs: SourceRef[]): Promise<string> {
  return applyTone(await templateBody(input, refs), input.tone);
}

async function templateBody(input: DraftInput, refs: SourceRef[]): Promise<string> {
  const { company, requestType, topic, objective } = input;
  const p = company.profile;
  const cta = input.callToAction || p.callsToAction[0] || "Get in touch today";
  const area = p.serviceAreas[0] || "your area";
  const disc = p.requiredDisclaimers[0] ? `\n\n${p.requiredDisclaimers[0]}` : "";
  const offerLine = input.offer ? ` ${input.offer}.` : "";
  const grounding = refs[0]
    ? `\n\n${refs[0].snippet.split(". ").slice(0, 2).join(". ")}${refs[0].snippet.includes(".") ? "." : ""}`
    : "";

  // Local landing page brief (§47) — structured, regardless of type.
  if (input.briefMode) {
    const local = await getLocalProfile(company.id);
    return [
      `# Landing page brief: ${topic}`,
      `\n## Page objective\n${objective}`,
      `\n## Target audience\n${input.audience || p.targetCustomers || "Local customers"}`,
      `\n## Headline\n${topic} — ${company.name}, ${area}`,
      `\n## Sections\n1. Hero with headline + ${cta}\n2. Why ${company.name} (${p.approvedClaims.slice(0, 2).join("; ") || "our difference"})\n3. Services: ${p.services.slice(0, 3).join(", ")}\n4. Local proof (${area})\n5. FAQ\n6. Contact / booking form`,
      `\n## FAQ\nUse approved FAQ material from the Brand Brain.`,
      `\n## Call to action\n${cta}`,
      `\n## Proof points\n${p.approvedClaims.join("; ") || "Approved claims only — see Claims Library"}`,
      `\n## Images needed\nHero image, 2–3 service/location photos (check usage rights).`,
      `\n## Compliance issues\nAvoid all ${p.prohibitedClaims.length} prohibited claim rules in the Brand Brain; include disclaimer${disc ? `: ${p.requiredDisclaimers[0]}` : "s as required"}.`,
      `\n## SEO keywords\n${(local?.searchTerms ?? []).join(", ") || `${company.name.toLowerCase()}, ${area.toLowerCase()}`}`,
      `\n## Form fields\nName, phone/email, suburb, message.`,
      `\n## Tracking requirements\nUTM-tagged links; form-submit conversion event.`,
    ].join("\n");
  }

  switch (requestType) {
    case "social_post":
      return `${topic} 🛒\n\nAt ${company.name}, we help ${p.targetCustomers || "local customers"} across ${area}.${grounding}${offerLine}\n\n👉 ${cta}${disc}\n\n[AI draft for review — objective: ${objective}]`;
    case "email_newsletter":
      return `Subject: ${topic}\n\nHi there,\n\n${objective}. ${company.name} has you covered across ${area}.${grounding}${offerLine}\n\n${cta}.\n\nWarm regards,\nThe ${company.name} team${disc}`;
    case "blog_article":
      return `# ${topic}\n\n## Introduction\nWhy this matters for ${p.targetCustomers || "our customers"} in ${area}.${grounding}\n\n## What ${company.name} recommends\n${objective}.\n\n## Next steps\n${cta}.${disc}`;
    case "ad_copy":
      return `Headline: ${topic}\nBody: ${objective}.${offerLine}\nCTA: ${cta}${disc}`;
    case "landing_page":
      return `Hero: ${topic}\nSubhead: ${objective}\nSections: About ${company.name} · Services (${p.services.slice(0, 3).join(", ")}) · Why choose us · FAQ${grounding ? `\nProof points: ${grounding.trim()}` : ""}\nCTA: ${cta}${disc}`;
    case "campaign":
      return `Campaign concept: ${topic}\nObjective: ${objective}\nAudience: ${input.audience || p.targetCustomers}\nSuggested channels: Facebook, Instagram, Google Business Profile, Email\nKey message: ${topic}${grounding ? `\nSupporting detail: ${grounding.trim()}` : ""}\nCTA: ${cta}${disc}`;
    case "creative_request":
      return `Creative brief: ${topic}\nObjective: ${objective}\nDeliverable: ${input.platform || "brand/motion asset"}\nBrand voice: ${p.brandVoice || "on brand"}\nMust include: concepts, usage contexts, do/don’t, file types expected from studio.\nNote: This is the brief — final rendered files are studio fulfilment after approval.\nCTA: ${cta}${disc}`;
    case "website_copy":
      return `# ${topic}\n\n${company.name} — ${p.natureOfBusiness || objective}${grounding}\n\n## Why choose us\n${p.approvedClaims.slice(0, 3).map((c) => `- ${c}`).join("\n") || `- Serving ${area} with pride`}\n\n## What we offer\n${p.services.slice(0, 4).map((s) => `- ${s}`).join("\n")}\n\n${cta}.${disc}`;
    case "faq":
      return `# FAQ: ${topic}\n\nQ: ${topic}?\nA: ${objective}.${grounding}\n\nQ: Where do you operate?\nA: We serve ${p.serviceAreas.join(", ") || area}.\n\nQ: How do I get started?\nA: ${cta}.${disc}`;
    case "video_script":
      return `VIDEO SCRIPT (30s): ${topic}\n\n[0-5s HOOK] ${topic} — on screen: ${company.name} logo.\n[5-15s BODY] ${objective}.${grounding ? ` VO: ${grounding.trim()}` : ""}\n[15-25s PROOF] ${p.approvedClaims[0] || `Locals in ${area} trust us`}.${offerLine}\n[25-30s CTA] ${cta} — on screen: contact details.${disc}`;
    case "brochure_copy":
      return `BROCHURE: ${topic}\n\nCover: ${topic}\nInside left — About us: ${p.natureOfBusiness || `${company.name}, serving ${area}`}.${grounding}\nInside right — Services: ${p.services.join(" · ")}\nBack — ${p.approvedClaims[0] || "Get in touch"}.${offerLine} ${cta}.${disc}`;
    case "proposal":
      return `PROPOSAL: ${topic}\n\nPrepared by ${company.name}\n\n1. Understanding your needs\n${objective}.\n\n2. Our approach\n${grounding.trim() || `${p.natureOfBusiness || "Tailored service from a local team."}`}\n\n3. Why ${company.name}\n${p.approvedClaims.map((c) => `- ${c}`).join("\n") || `- Local, trusted, ${area}`}\n\n4. Next steps\n${cta}.${disc}`;
    case "seo_meta":
      return `META TITLE (≤60 chars):\n${`${topic} | ${company.name} ${area}`.slice(0, 60)}\n\nMETA DESCRIPTION (≤155 chars):\n${`${objective}. ${cta}.`.slice(0, 155)}\n\nALTERNATES:\n1. ${`${company.name}: ${topic}`.slice(0, 60)}\n2. ${`${topic} in ${area} — ${company.name}`.slice(0, 60)}`;
  }
}

function sanitizeOptional(value?: string): string | undefined {
  if (!value) return undefined;
  return sanitizeAiUserInput(value).text;
}

// Basic campaign idea generator (Phase 1 feature, kept current with grounding).
export async function generateCampaignIdeas(
  company: Company,
  objective: string,
): Promise<string[]> {
  const safeObjective = sanitizeAiUserInput(objective).text;
  const system = [
    "You generate concise marketing campaign ideas for a specific company.",
    "Ground every idea in the approved company information. Return 5 ideas, one per line, no numbering.",
    "",
    brandBrainContext(company),
  ].join("\n");
  const ai = await guardedClaudeCall({
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.name,
    system,
    user: `Objective: ${safeObjective}`,
    maxTokens: 400,
  });
  if (ai) {
    return ai
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  const p = company.profile;
  const svc = p.services;
  return [
    `Seasonal push on ${svc[0] || "core services"} for ${p.serviceAreas[0] || "the local area"}`,
    `Customer reactivation email: "${safeObjective}"`,
    `Local awareness campaign highlighting ${p.approvedClaims[0] || "what makes us different"}`,
    `Google Business Profile weekly tips series on ${svc[1] || svc[0] || "our services"}`,
    `Referral / review-request campaign tied to ${p.currentOffers || "a limited offer"}`,
  ];
}
