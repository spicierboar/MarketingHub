/**
 * Professional cook-family instructions for Extras / Hub drafts.
 * Shared guidance so every dish type is delivered competently.
 */

import type { CookFamilyId } from "@/lib/content-recipe";

const FAMILY_PROMPTS: Record<CookFamilyId, string> = {
  short_social: [
    "Format: short-form social copy for the named platform.",
    "Lead with a hook in the first line; one idea; one clear CTA.",
    "Respect platform norms (length, hashtags, tone). No long-form essays.",
  ].join(" "),
  long_editorial: [
    "Format: long-form editorial with a clear headline, short intro, scannable sections, and a closing CTA.",
    "Use H2/H3 structure where helpful. Ground claims in Brand Brain only.",
    "Write as a competent journalist/editor — specific, useful, publish-ready.",
  ].join(" "),
  web_page: [
    "Format: website page copy with page purpose, hero/headline, body sections, and CTA.",
    "Scannable paragraphs; benefit-led; SEO-aware without stuffing keywords.",
    "Include placeholder notes for images only when useful (in brackets).",
  ].join(" "),
  landing_conversion: [
    "Format: conversion landing copy — headline, subhead, benefits, proof, objection handling, CTA.",
    "Primary goal is conversion. Keep friction low; one dominant CTA.",
    "If briefMode is not set, still structure with clear section labels.",
  ].join(" "),
  email: [
    "Format: email with Subject line, Preview text, then body.",
    "Subject ≤ 9 words when possible; body scannable; single primary CTA.",
    "Match the email purpose (promo, nurture, transactional, etc.) in the dish name.",
  ].join(" "),
  ad: [
    "Format: paid ad variants — Primary text / Headlines / Descriptions / CTA as appropriate.",
    "Provide 3–5 headline options and 2–3 body variants when the dish is an ad set.",
    "Stay within typical ad length limits; no invented social proof.",
  ].join(" "),
  script_av: [
    "Format: AV script with Hook, Beats/Scenes, On-screen text, Voice-over, CTA.",
    "Spoken-word friendly; timing notes in brackets (e.g. [0–3s]).",
    "Match short-form vs long-form expectations from the dish name.",
  ].join(" "),
  sales_doc: [
    "Format: sales document — executive summary, offer/value, proof, next steps.",
    "Professional and client-facing; no fluff; clear commercial narrative.",
    "For brochures/one-pagers: tight sections suitable for print/PDF layout.",
  ].join(" "),
  support: [
    "Format: Q&A or help-centre style answers.",
    "Direct, extractable answers first; then short supporting detail.",
    "Ideal for FAQ, AEO, and featured-snippet shapes.",
  ].join(" "),
  meta_seo: [
    "Format: SEO/meta pack — Title tags, Meta descriptions, H1 suggestions, optional OG title/description.",
    "Titles ~50–60 chars; descriptions ~140–160 chars; no clickbait falsehoods.",
    "Include primary keyword naturally when provided in notes/topic.",
  ].join(" "),
};

/** Extra guidance when optimising for search / AI discovery. */
export function discoveryOptimisePrompt(
  optimiseFor: string[] | undefined,
): string {
  if (!optimiseFor?.length) return "";
  const bits: string[] = [];
  if (optimiseFor.includes("seo")) {
    bits.push(
      "SEO: clear entities, descriptive headings, search-intent match, snippet-ready first paragraph.",
    );
  }
  if (optimiseFor.includes("aeo") || optimiseFor.includes("ai_discovery")) {
    bits.push(
      "AEO: lead with a direct answer; use question-shaped headings; keep answers extractable and self-contained.",
    );
  }
  if (optimiseFor.includes("geo") || optimiseFor.includes("ai_discovery")) {
    bits.push(
      "GEO: authoritative tone; cite only Brand Brain sources; quotable sentences; entity clarity for AI summaries.",
    );
  }
  if (optimiseFor.includes("llmo") || optimiseFor.includes("ai_discovery")) {
    bits.push(
      "LLMO: semantic chunks; unambiguous entity names; machine-readable structure; avoid vague pronouns for key facts.",
    );
  }
  if (optimiseFor.includes("conversion")) {
    bits.push("Conversion: single dominant CTA; reduce friction; benefit before feature.");
  }
  if (optimiseFor.includes("trust")) {
    bits.push("Trust: evidence-led; no invented credentials; transparent sourcing.");
  }
  if (optimiseFor.includes("engagement")) {
    bits.push("Engagement: hook early; invite a response or save/share without gimmicks.");
  }
  return bits.length ? `Optimisation requirements:\n- ${bits.join("\n- ")}` : "";
}

export function cookFamilyPrompt(family: CookFamilyId | string | undefined): string {
  if (!family) return "";
  return FAMILY_PROMPTS[family as CookFamilyId] ?? "";
}

export function dishDeliveryPrompt(input: {
  dishLabel?: string;
  cookFamily?: CookFamilyId | string;
  optimiseFor?: string[];
}): string {
  const parts = [
    input.dishLabel
      ? `Exact deliverable to produce: "${input.dishLabel}". Match that format professionally — not a generic substitute.`
      : "",
    cookFamilyPrompt(input.cookFamily),
    discoveryOptimisePrompt(input.optimiseFor),
  ].filter(Boolean);
  return parts.join("\n");
}
