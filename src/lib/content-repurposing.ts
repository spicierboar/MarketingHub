// V1 content repurposing — one source brief → platform-specific variants
// (Facebook, Instagram, Google Business Profile, TikTok). Deterministic
// templates when ANTHROPIC_API_KEY is unset; live Claude when configured.
// New variants always start as ai_draft — never auto-published.

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { draftContent } from "@/lib/ai/draft";
import { getLocalProfile } from "@/lib/db";
import type {
  Company,
  ContentItem,
  SourceRef,
  V1ConnectPlatform,
} from "@/lib/types";
import { V1_CONNECT_PLATFORMS } from "@/lib/types";

export const V1_REPURPOSE_PLATFORMS = V1_CONNECT_PLATFORMS;

export type RepurposePlatform = V1ConnectPlatform;

export interface PlatformSpec {
  platform: RepurposePlatform;
  charLimit: number;
  tone: string;
  formatHint: string;
  ctaStyle: string;
}

export const PLATFORM_SPECS: Record<RepurposePlatform, PlatformSpec> = {
  Facebook: {
    platform: "Facebook",
    charLimit: 500,
    tone: "Warm and community-minded — conversational, invite comments and shares.",
    formatHint:
      "Single post with a strong opening line, 1–2 short paragraphs, optional light emoji.",
    ctaStyle: "Comment, message us, or visit — community engagement first.",
  },
  Instagram: {
    platform: "Instagram",
    charLimit: 2200,
    tone: "Visual-first and punchy — short lines, personality, hashtag-friendly.",
    formatHint:
      "Hook in the first line, line breaks for readability, 3–8 relevant hashtags at the end.",
    ctaStyle: "Link in bio, DM us, or tap to book — action-oriented.",
  },
  "Google Business Profile": {
    platform: "Google Business Profile",
    charLimit: 1500,
    tone: "Local and trustworthy — no slang, no hashtags, neighbourhood-focused.",
    formatHint:
      "Local update or offer post: what, where, when. Mention suburb/service area.",
    ctaStyle: "Call, get directions, book online, or visit us today.",
  },
  TikTok: {
    platform: "TikTok",
    charLimit: 2200,
    tone: "Video-first script energy — hook in 3 seconds, casual, trend-aware.",
    formatHint:
      "Write as a short video script: [HOOK], [SCENE/B-ROLL cues], on-screen text, voiceover lines, caption.",
    ctaStyle: "Follow for more, link in bio, or comment to learn more.",
  },
};

/** Statuses eligible as a repurpose source (draft or approved — never published). */
export const REPURPOSE_SOURCE_STATUSES: ContentItem["status"][] = [
  "ai_draft",
  "user_edited",
  "changes_required",
  "approved",
];

export function canRepurposeSource(content: ContentItem): boolean {
  return REPURPOSE_SOURCE_STATUSES.includes(content.status);
}

export function normalizePlatformKey(platform: string): RepurposePlatform | null {
  const key = platform.toLowerCase().trim();
  if (key === "facebook" || key === "fb") return "Facebook";
  if (key === "instagram" || key === "ig") return "Instagram";
  if (key === "google business profile" || key === "gbp" || key === "google_business")
    return "Google Business Profile";
  if (key === "tiktok") return "TikTok";
  return null;
}

export interface PlatformVariantResult {
  platform: RepurposePlatform;
  title: string;
  body: string;
  model: string;
  sources: string[];
  sourceRefs: SourceRef[];
  formatHint: string;
}

export interface RepurposeInput {
  company: Company;
  source: ContentItem;
  platform: RepurposePlatform;
}

function trimToLimit(body: string, limit: number): string {
  if (body.length <= limit) return body;
  const cut = body.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function sourceSnippet(source: ContentItem): string {
  return source.body.slice(0, 1200);
}

/** Generate one platform-specific variant from a source content item. */
export async function generatePlatformVariant(
  input: RepurposeInput,
): Promise<PlatformVariantResult> {
  const { company, source, platform } = input;
  const spec = PLATFORM_SPECS[platform];
  const topic = source.title.replace(/^[^—]+— /, "").slice(0, 80);
  const objective = [
    `Repurpose this source content for ${platform}.`,
    `Tone: ${spec.tone}`,
    `Format: ${spec.formatHint}`,
    `CTA style: ${spec.ctaStyle}`,
    `Stay within ~${spec.charLimit} characters.`,
    `Keep all claims and meaning from the source — do not invent new facts.`,
    "",
    "SOURCE:",
    sourceSnippet(source),
  ].join("\n");

  const draft = await draftContent({
    company,
    requestType: "social_post",
    topic,
    objective,
    platform,
    callToAction: company.profile.callsToAction[0],
    tone: platformTone(platform),
  });

  const aiBody = await callClaude(
    [
      "You are a senior social copywriter adapting one piece of content for a specific platform.",
      `Platform rules: ${spec.tone} ${spec.formatHint}`,
      `CTA: ${spec.ctaStyle}`,
      `Max length: ${spec.charLimit} characters.`,
      "Ground only in the source — no new claims.",
      "",
      `Company: ${company.name}`,
      company.profile.brandVoice && `Brand voice: ${company.profile.brandVoice}`,
      company.profile.prohibitedClaims.length &&
        `NEVER use: ${company.profile.prohibitedClaims.join(" | ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
    [
      `Adapt for ${platform}:`,
      `Source title: ${source.title}`,
      `Source body:\n${sourceSnippet(source)}`,
      draft.body !== source.body ? `\nDraft starting point:\n${draft.body}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    900,
  );

  const body = trimToLimit(aiBody ?? (await templatePlatformVariant(input)), spec.charLimit);
  const title = `${source.title} — ${platform}`.slice(0, 120);

  return {
    platform,
    title,
    body,
    model: aiBody ? AI_MODEL : draft.model.includes("template") ? "template (no API key)" : draft.model,
    sources: [`Source content: ${source.title}`, ...draft.sources],
    sourceRefs: [
      {
        sourceId: source.id,
        title: `Repurposed from: ${source.title}`,
        snippet: source.body.slice(0, 200),
      },
      ...draft.sourceRefs,
    ],
    formatHint: spec.formatHint,
  };
}

function platformTone(platform: RepurposePlatform): import("@/lib/types").DraftTone {
  switch (platform) {
    case "Facebook":
      return "friendly";
    case "Instagram":
      return "short_punchy";
    case "Google Business Profile":
      return "professional";
    case "TikTok":
      return "short_punchy";
    default:
      return "brand_default";
  }
}

/** Deterministic platform variant when no API key (or as Claude fallback base). */
export async function templatePlatformVariant(input: RepurposeInput): Promise<string> {
  const { company, source, platform } = input;
  const spec = PLATFORM_SPECS[platform];
  const p = company.profile;
  const area = p.serviceAreas[0] || "your area";
  const cta = p.callsToAction[0] || "Get in touch today";
  const disc = p.requiredDisclaimers[0] ? `\n\n${p.requiredDisclaimers[0]}` : "";
  const core = source.body.split("\n").filter(Boolean).slice(0, 4).join("\n");
  const local = await getLocalProfile(company.id);
  const suburb = local?.suburbs[0] || area;

  switch (platform) {
    case "Facebook":
      return trimToLimit(
        `${source.title}\n\n${core}\n\nWe love serving ${area} — tell us what you think in the comments! 💬\n\n${cta}${disc}`,
        spec.charLimit,
      );
    case "Instagram":
      return trimToLimit(
        `${core.split("\n")[0] || source.title} ✨\n\n${core}\n\n📍 ${suburb}\n👉 ${cta}\n\n#${company.name.replace(/\s+/g, "")} #${suburb.replace(/\s+/g, "")} #local${disc}`,
        spec.charLimit,
      );
    case "Google Business Profile":
      return trimToLimit(
        `Update from ${company.name} — ${suburb}\n\n${core}\n\nServing customers across ${area}. ${cta}.${disc}`,
        spec.charLimit,
      );
    case "TikTok": {
      const hook = core.split("\n")[0] || source.title;
      return trimToLimit(
        `[HOOK — 0:00] "${hook}"\n[SCENE] B-roll: ${company.name}, ${suburb}\n[VO] ${core.replace(/\n/g, " ")}\n[ON-SCREEN] ${cta}\n\nCaption: ${hook.slice(0, 100)} #${company.name.replace(/\s+/g, "")} #fyp${disc}`,
        spec.charLimit,
      );
    }
    default:
      return trimToLimit(core, spec.charLimit);
  }
}

export interface RepurposeBatchInput {
  company: Company;
  source: ContentItem;
  platforms: RepurposePlatform[];
}

/** Generate variants for all requested platforms. */
export async function repurposeForPlatforms(
  input: RepurposeBatchInput,
): Promise<PlatformVariantResult[]> {
  const unique = [...new Set(input.platforms)];
  const results: PlatformVariantResult[] = [];
  for (const platform of unique) {
    results.push(
      await generatePlatformVariant({
        company: input.company,
        source: input.source,
        platform,
      }),
    );
  }
  return results;
}
