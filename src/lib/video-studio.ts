// W7 M55 — Video studio: templates, script packs, and channel variants.
// Produces governed draft specs; rendering stays placeholder until VISUALS_LIVE.

import { visualsLive } from "@/lib/visuals-connectors";
import type {
  Company,
  VideoScriptPack,
  VideoStudioChannel,
  VideoStudioDraftSpec,
  VideoStudioTemplate,
  VideoStudioTemplateId,
} from "@/lib/types";

export const VIDEO_STUDIO_TEMPLATES: VideoStudioTemplate[] = [
  {
    id: "service_spotlight",
    label: "Service spotlight",
    description: "Hero a core service with proof and a direct CTA.",
    defaultDurationSec: 25,
    hookStyle: "problem → solution",
  },
  {
    id: "offer_promo",
    label: "Offer / promo",
    description: "Time-bound offer with urgency and clear redemption path.",
    defaultDurationSec: 20,
    hookStyle: "urgency hook",
  },
  {
    id: "testimonial_hook",
    label: "Testimonial hook",
    description: "Social proof lead-in with a customer outcome story.",
    defaultDurationSec: 30,
    hookStyle: "quote → result",
  },
  {
    id: "how_to_tip",
    label: "How-to tip",
    description: "Quick educational tip that positions the brand as helpful.",
    defaultDurationSec: 25,
    hookStyle: "tip teaser",
  },
  {
    id: "seasonal",
    label: "Seasonal moment",
    description: "Seasonal or event tie-in with timely relevance.",
    defaultDurationSec: 22,
    hookStyle: "seasonal opener",
  },
];

export const VIDEO_SCRIPT_PACKS: VideoScriptPack[] = [
  {
    id: "sp_default",
    templateId: "service_spotlight",
    label: "Standard spotlight",
    beats: ["Hook — name the pain", "Introduce service", "Proof point", "CTA"],
  },
  {
    id: "sp_fast",
    templateId: "service_spotlight",
    label: "Fast cut",
    beats: ["Bold hook", "One-line benefit", "Logo + CTA"],
  },
  {
    id: "op_flash",
    templateId: "offer_promo",
    label: "Flash sale",
    beats: ["Offer headline", "What you get", "Deadline", "Redeem CTA"],
  },
  {
    id: "th_quote",
    templateId: "testimonial_hook",
    label: "Quote lead",
    beats: ["Customer quote overlay", "Before/after", "Star rating", "Book CTA"],
  },
  {
    id: "ht_tip",
    templateId: "how_to_tip",
    label: "Quick tip",
    beats: ["Did you know?", "Tip in 3 steps", "Why us", "Follow CTA"],
  },
  {
    id: "se_moment",
    templateId: "seasonal",
    label: "Seasonal beat",
    beats: ["Season hook", "Timely offer", "Local tie-in", "CTA"],
  },
];

export const VIDEO_STUDIO_CHANNELS: Record<
  VideoStudioChannel,
  { label: string; maxDurationSec: number; captionHint: string; aspect: "9:16" }
> = {
  facebook: {
    label: "Facebook Reels",
    maxDurationSec: 30,
    captionHint: "Keep captions short; link in first comment if needed.",
    aspect: "9:16",
  },
  instagram: {
    label: "Instagram Reels",
    maxDurationSec: 30,
    captionHint: "Front-load hook in first 2s; use on-screen text beats.",
    aspect: "9:16",
  },
  tiktok: {
    label: "TikTok",
    maxDurationSec: 25,
    captionHint: "Trend-native pacing; punchy VO and text overlays.",
    aspect: "9:16",
  },
  gbp: {
    label: "Google Business Profile",
    maxDurationSec: 20,
    captionHint: "Local proof + service area; no unapproved claims.",
    aspect: "9:16",
  },
};

export const ALL_VIDEO_CHANNELS: VideoStudioChannel[] = [
  "facebook",
  "instagram",
  "tiktok",
  "gbp",
];

export function listVideoTemplates(): VideoStudioTemplate[] {
  return VIDEO_STUDIO_TEMPLATES;
}

export function getVideoTemplate(id: VideoStudioTemplateId): VideoStudioTemplate | undefined {
  return VIDEO_STUDIO_TEMPLATES.find((t) => t.id === id);
}

export function listScriptPacks(templateId?: VideoStudioTemplateId): VideoScriptPack[] {
  if (!templateId) return VIDEO_SCRIPT_PACKS;
  return VIDEO_SCRIPT_PACKS.filter((p) => p.templateId === templateId);
}

export function getScriptPack(id: string): VideoScriptPack | undefined {
  return VIDEO_SCRIPT_PACKS.find((p) => p.id === id);
}

function brandCta(company: Company): string {
  return company.profile.callsToAction[0] || `Contact ${company.name}`;
}

function brandService(company: Company): string {
  return company.profile.services[0] || company.name;
}

export function buildScriptFromPack(
  company: Company,
  pack: VideoScriptPack,
  topic: string,
): string {
  const template = getVideoTemplate(pack.templateId);
  const cta = brandCta(company);
  const service = brandService(company);
  const area = company.profile.serviceAreas[0] || "your area";
  const duration = template?.defaultDurationSec ?? 25;
  const lines = [
    `VIDEO SCRIPT (${duration}s) — ${topic}`,
    `Template: ${template?.label ?? pack.templateId} · Pack: ${pack.label}`,
    "",
  ];
  const beatScripts: Record<string, string> = {
    "Hook — name the pain": `[0-3s] Still struggling with ${topic.toLowerCase()}?`,
    "Introduce service": `[3-10s] At ${company.name}, our ${service} helps locals in ${area}.`,
    "Proof point": `[10-18s] ${company.profile.approvedClaims[0] || "Trusted by neighbours like you."}`,
    "CTA": `[18-${duration}s] ${cta} — tap to learn more.`,
    "Bold hook": `[0-2s] ${topic} — solved.`,
    "One-line benefit": `[2-12s] ${service} from ${company.name}.`,
    "Logo + CTA": `[12-${duration}s] ${cta}.`,
    "Offer headline": `[0-4s] ${topic} — limited time.`,
    "What you get": `[4-12s] ${service} with clear value for ${area}.`,
    Deadline: `[12-18s] Ends soon — don't miss out.`,
    "Redeem CTA": `[18-${duration}s] ${cta}.`,
    "Customer quote overlay": `[0-5s] "Great experience" — happy customer`,
    "Before/after": `[5-15s] See the difference with ${company.name}.`,
    "Star rating": `[15-22s] Rated highly in ${area}.`,
    "Book CTA": `[22-${duration}s] ${cta}.`,
    "Did you know?": `[0-3s] Quick tip: ${topic}`,
    "Tip in 3 steps": `[3-15s] 1) Know your need 2) Choose ${service} 3) ${cta}`,
    "Why us": `[15-22s] ${company.name} — local and on-brand.`,
    "Follow CTA": `[22-${duration}s] Save this & ${cta.toLowerCase()}.`,
    "Season hook": `[0-4s] ${topic} — perfect timing.`,
    "Timely offer": `[4-12s] ${service} for ${area} this season.`,
    "Local tie-in": `[12-18s] Proudly serving ${area}.`,
  };
  for (const beat of pack.beats) {
    lines.push(beatScripts[beat] ?? `[beat] ${beat}: ${topic} — ${company.name}.`);
  }
  lines.push("", `CTA: ${cta}`);
  if (company.profile.prohibitedClaims.length) {
    lines.push(`Avoid: ${company.profile.prohibitedClaims.join("; ")}`);
  }
  return lines.join("\n");
}

function channelScriptVariant(
  baseScript: string,
  channel: VideoStudioChannel,
  company: Company,
): string {
  const meta = VIDEO_STUDIO_CHANNELS[channel];
  return [
    baseScript,
    "",
    `--- ${meta.label} variant ---`,
    meta.captionHint,
    `Aspect: ${meta.aspect} · Max ${meta.maxDurationSec}s`,
    `Brand: ${company.name}`,
  ].join("\n");
}

export function buildDraftSpec(input: {
  company: Company;
  templateId: VideoStudioTemplateId;
  scriptPackId: string;
  channel: VideoStudioChannel;
  topic: string;
  script?: string;
}): VideoStudioDraftSpec {
  const template = getVideoTemplate(input.templateId);
  const pack = getScriptPack(input.scriptPackId);
  if (!template) throw new Error("Unknown video template.");
  if (!pack || pack.templateId !== input.templateId) {
    throw new Error("Script pack does not match template.");
  }
  const channelMeta = VIDEO_STUDIO_CHANNELS[input.channel];
  const baseScript =
    input.script?.trim() || buildScriptFromPack(input.company, pack, input.topic);
  const script = channelScriptVariant(baseScript, input.channel, input.company);
  const durationSec = Math.min(
    template.defaultDurationSec,
    channelMeta.maxDurationSec,
  );

  return {
    templateId: input.templateId,
    scriptPackId: input.scriptPackId,
    channel: input.channel,
    topic: input.topic,
    script,
    topicLabel: input.topic,
    channelLabel: channelMeta.label,
    durationSec,
    onScreenBeats: pack.beats,
    cta: brandCta(input.company),
    renderMode: visualsLive() ? "live" : "placeholder",
  };
}

export function buildChannelVariants(input: {
  company: Company;
  templateId: VideoStudioTemplateId;
  scriptPackId: string;
  topic: string;
  script?: string;
  channels?: VideoStudioChannel[];
}): VideoStudioDraftSpec[] {
  const channels = input.channels?.length ? input.channels : ALL_VIDEO_CHANNELS;
  return channels.map((channel) =>
    buildDraftSpec({ ...input, channel }),
  );
}
