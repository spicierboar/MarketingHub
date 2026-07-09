// AI short-form video generation (Phase 4 — Module 2, video-first). Vertical
// 9:16 output for Reels / TikTok / Shorts. Combines a script (from Studio or
// inline) with brand context; live rendering is env-gated (VISUALS_LIVE).

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { visualsLive, visualsProviderConfigured } from "@/lib/visuals-connectors";
import { placeholderMp4 } from "@/lib/visuals-placeholders";
import type { Company } from "@/lib/types";

export interface VideoGenInput {
  company: Company;
  topic: string;
  script: string;
  channel?: string;
}

export interface VideoGenResult {
  name: string;
  description: string;
  width: number;
  height: number;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  model: string;
  durationSec: number;
}

const VERTICAL = { width: 1080, height: 1920 };

function brandContext(c: Company): string {
  const p = c.profile;
  return [
    `Company: ${c.name}`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.services.length && `Services: ${p.services.join(", ")}`,
    p.prohibitedClaims.length &&
      `NEVER depict: ${p.prohibitedClaims.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function buildVideoPrompt(input: VideoGenInput): Promise<string> {
  const { company, topic, script, channel } = input;
  const system = [
    "You are a short-form video director. Summarise how to render this as a 15–30s vertical video.",
    "Include pacing, on-screen text beats, and b-roll suggestions. Ground in the brand.",
    brandContext(company),
  ].join("\n");
  const user = [
    `Topic: ${topic}`,
    channel && `Channel: ${channel}`,
    `Script:\n${script}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ai = await callClaude(system, user, 500);
  if (ai) return ai.trim();
  return `Vertical video for ${company.name}: ${topic}. ${script.slice(0, 200)}`;
}

async function dispatchLiveVideo(
  prompt: string,
  script: string,
): Promise<Buffer | null> {
  if (!visualsLive() || !visualsProviderConfigured()) return null;
  void prompt;
  void script;
  return null;
}

export async function generateVideo(input: VideoGenInput): Promise<VideoGenResult> {
  const prompt = await buildVideoPrompt(input);
  const seed = `${input.company.id}:${input.topic}:video`;
  const name = `AI video — ${input.topic}`.slice(0, 120);
  const durationSec = Math.min(30, Math.max(15, Math.ceil(input.script.length / 40)));

  const liveBytes = await dispatchLiveVideo(prompt, input.script);
  const bytes = liveBytes ?? placeholderMp4(seed);
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
      `Simulated short-form vertical video for "${input.topic}" (${durationSec}s target).`,
      input.channel ? `Channel: ${input.channel}.` : "",
      `Direction: ${prompt.slice(0, 350)}${prompt.length > 350 ? "…" : ""}`,
      visualsLive()
        ? ""
        : "Enable VISUALS_LIVE + a provider key for live video generation.",
    ]
      .filter(Boolean)
      .join(" "),
    ...VERTICAL,
    mimeType: "video/mp4",
    bytes,
    prompt,
    model,
    durationSec,
  };
}
