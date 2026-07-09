// Thin wrapper over the Anthropic SDK. Returns null when no key is configured
// or the call fails, so callers can fall back to deterministic templates and
// the app stays runnable with zero external accounts.

import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = process.env.CC_AI_MODEL || "claude-sonnet-5";

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function callClaude(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string | null> {
  const result = await callClaudeDetailed(system, user, maxTokens);
  return result?.text ?? null;
}

export interface ClaudeResult {
  text: string;
  usage: ClaudeUsage;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

export async function callClaudeDetailed(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<ClaudeResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const inputTokens = msg.usage?.input_tokens ?? charsToEstimatedTokens(system.length + user.length);
    const outputTokens = msg.usage?.output_tokens ?? charsToEstimatedTokens(text.length);
    return { text, usage: { inputTokens, outputTokens } };
  } catch (err) {
    console.error("[ai] Claude call failed, falling back to template:", err);
    return null;
  }
}

function charsToEstimatedTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}
