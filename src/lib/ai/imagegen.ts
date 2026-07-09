// AI image generation (Phase 4 — Module 2). Produces image bytes for the DAM,
// grounded in the Brand Brain. Live provider dispatch lives in
// visuals-connectors.ts (VISUALS_LIVE); without it, a deterministic placeholder
// PNG is returned so the approval + attach pipeline is fully testable.

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { visualsLive, visualsProviderConfigured } from "@/lib/visuals-connectors";
import { placeholderPng } from "@/lib/visuals-placeholders";
import type { Company } from "@/lib/types";

export interface ImageGenInput {
  company: Company;
  topic: string;
  objective: string;
  channel?: string;
  format?: "square" | "vertical" | "landscape";
}

export interface ImageGenResult {
  name: string;
  description: string;
  width: number;
  height: number;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  model: string;
}

function dimensions(format: ImageGenInput["format"]): { width: number; height: number } {
  switch (format) {
    case "vertical":
      return { width: 1080, height: 1920 };
    case "landscape":
      return { width: 1920, height: 1080 };
    case "square":
    default:
      return { width: 1080, height: 1080 };
  }
}

function brandContext(c: Company): string {
  const p = c.profile;
  return [
    `Company: ${c.name}`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.approvedClaims.length && `Approved claims: ${p.approvedClaims.join("; ")}`,
    p.prohibitedClaims.length &&
      `NEVER depict: ${p.prohibitedClaims.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildPrompt(input: ImageGenInput): Promise<string> {
  const { company, topic, objective, channel } = input;
  const system = [
    "You are an art director. Write a ONE-paragraph image-generation prompt for an AI image model.",
    "Ground it in the brand. No prohibited claims. Local, authentic, not stock-photo glossy.",
    brandContext(company),
  ].join("\n");
  const user = [`Topic: ${topic}`, `Objective: ${objective}`, channel && `Channel: ${channel}`]
    .filter(Boolean)
    .join("\n");
  const ai = await callClaude(system, user, 300);
  if (ai) return ai.trim();
  return `Hero image for ${company.name}: ${topic}. ${objective}. Warm, authentic, local feel matching ${company.profile.brandVoice ?? "the brand"}.`;
}

async function dispatchLiveImage(
  prompt: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  if (!visualsLive() || !visualsProviderConfigured()) return null;
  // Production drop-in: call Replicate / Runway / etc. and return image bytes.
  // Keys are batched — until wired, fall through to the deterministic placeholder.
  void prompt;
  void width;
  void height;
  return null;
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  const { width, height } = dimensions(input.format);
  const prompt = await buildPrompt(input);
  const seed = `${input.company.id}:${input.topic}:${width}x${height}`;
  const name = `AI image — ${input.topic}`.slice(0, 120);

  const liveBytes = await dispatchLiveImage(prompt, width, height);
  const bytes =
    liveBytes ?? placeholderPng(seed, Math.min(width, 512), Math.min(height, 512));
  const model = liveBytes
    ? "live-provider"
    : visualsLive()
      ? "simulated (provider not wired)"
      : AI_MODEL.startsWith("claude")
        ? `${AI_MODEL} prompt + simulated render`
        : "template (simulated render)";

  return {
    name,
    description: [
      `Simulated AI image for "${input.topic}".`,
      input.channel ? `Channel: ${input.channel}.` : "",
      `Prompt: ${prompt.slice(0, 400)}${prompt.length > 400 ? "…" : ""}`,
      visualsLive()
        ? ""
        : "Enable VISUALS_LIVE + a provider key for live image generation.",
    ]
      .filter(Boolean)
      .join(" "),
    width,
    height,
    mimeType: "image/png",
    bytes,
    prompt,
    model,
  };
}
