// AI voice / TTS (Content hub). No live TTS provider yet — polishes a
// voiceover script via Claude/template and returns placeholder WAV bytes so
// the DAM + approval path works end-to-end. Wire a provider behind the same
// VISUALS_LIVE gate pattern when keys are available (do not flip flags here).

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { visualsLive } from "@/lib/visuals-connectors";
import { placeholderWav } from "@/lib/visuals-placeholders";
import type { Company } from "@/lib/types";

export type VoiceStyle = "warm" | "professional" | "energetic" | "calm";

export interface VoiceGenInput {
  company: Company;
  script: string;
  voiceStyle?: VoiceStyle;
  topic?: string;
}

export interface VoiceGenResult {
  name: string;
  /** Polished voiceover script (for content draft). */
  scriptBody: string;
  description: string;
  mimeType: string;
  bytes: Buffer;
  prompt: string;
  model: string;
  voiceStyle: VoiceStyle;
  durationSec: number;
  /** True when bytes are a placeholder (no TTS provider). */
  audioPlaceholder: boolean;
}

const STYLE_HINT: Record<VoiceStyle, string> = {
  warm: "warm, friendly, conversational",
  professional: "clear, confident, professional",
  energetic: "upbeat, punchy, engaging",
  calm: "calm, reassuring, measured pace",
};

function brandContext(c: Company): string {
  const p = c.profile;
  return [
    `Company: ${c.name}`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.prohibitedClaims.length &&
      `NEVER claim: ${p.prohibitedClaims.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function polishScript(input: VoiceGenInput, style: VoiceStyle): Promise<string> {
  const system = [
    "You are a voiceover writer. Polish the script for spoken delivery.",
    `Delivery style: ${STYLE_HINT[style]}.`,
    "Keep it concise (15–45 seconds spoken). No stage directions unless helpful.",
    "Ground in the brand. No prohibited claims.",
    brandContext(input.company),
  ].join("\n");
  const user = [
    input.topic && `Topic: ${input.topic}`,
    `Draft script:\n${input.script}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const ai = await callClaude(system, user, 500);
  if (ai) return ai.trim();
  return [
    `VOICEOVER (${STYLE_HINT[style]}) — ${input.company.name}`,
    input.topic ? `Topic: ${input.topic}` : null,
    "",
    input.script.trim(),
    "",
    `[AI draft for review — audio synthesis when a TTS provider is configured.]`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export async function generateVoice(input: VoiceGenInput): Promise<VoiceGenResult> {
  const voiceStyle = input.voiceStyle ?? "warm";
  const scriptBody = await polishScript(input, voiceStyle);
  const topic = (input.topic || input.script.slice(0, 60)).trim() || "Voiceover";
  const name = `AI voiceover — ${topic}`.slice(0, 120);
  const durationSec = Math.min(45, Math.max(8, Math.ceil(scriptBody.length / 14)));
  const seed = `${input.company.id}:${topic}:voice:${voiceStyle}`;
  // Live TTS not wired — always placeholder until a provider lands (VISUALS_LIVE
  // is the same gate family as image/video; do not flip it here).
  const bytes = placeholderWav(seed, Math.min(3, durationSec / 10));
  const prompt = `Voiceover (${voiceStyle}): ${topic}`;

  return {
    name,
    scriptBody,
    description: [
      `Voiceover script + ${visualsLive() ? "placeholder" : "simulated"} audio for "${topic}" (${durationSec}s target, ${STYLE_HINT[voiceStyle]}).`,
      "Audio synthesis when a TTS provider is configured — script is ready for review/approval now.",
    ].join(" "),
    mimeType: "audio/wav",
    bytes,
    prompt,
    model: AI_MODEL.startsWith("claude")
      ? `${AI_MODEL} script + simulated TTS`
      : "template (simulated TTS)",
    voiceStyle,
    durationSec,
    audioPlaceholder: true,
  };
}
