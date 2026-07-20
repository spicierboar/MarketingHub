// Thin wrapper over the Anthropic SDK. Returns null when no key is configured
// or the call fails, so callers can fall back to deterministic templates and
// the app stays runnable with zero external accounts.

import Anthropic from "@anthropic-ai/sdk";
import {
  liveIntegrationsAllowed,
  providerLiveFlagEnabled,
} from "@/lib/env";
import {
  currentScheduledExecution,
  remainingScheduledMs,
  throwIfScheduledAborted,
} from "@/lib/scheduled-execution";

export const AI_MODEL = process.env.CC_AI_MODEL || "claude-sonnet-5";

export function aiConfigured(): boolean {
  return (
    providerLiveFlagEnabled(process.env.CC_AI_LIVE) &&
    liveIntegrationsAllowed() &&
    Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  );
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
  if (!aiConfigured()) return null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) return null;
  const execution = currentScheduledExecution();
  let requestSignal = execution?.signal;
  try {
    throwIfScheduledAborted(execution, 250);
    if (execution) {
      requestSignal = AbortSignal.any([
        execution.signal,
        AbortSignal.timeout(Math.max(1, remainingScheduledMs(execution))),
      ]);
    }
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create(
      {
        model: AI_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      },
      requestSignal ? { signal: requestSignal } : undefined,
    );
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const inputTokens = msg.usage?.input_tokens ?? charsToEstimatedTokens(system.length + user.length);
    const outputTokens = msg.usage?.output_tokens ?? charsToEstimatedTokens(text.length);
    return { text, usage: { inputTokens, outputTokens } };
  } catch (err) {
    if (
      requestSignal?.aborted ||
      (execution && Date.now() >= execution.deadlineMs)
    ) throw err;
    console.error("[ai] Claude call failed, falling back to template:", err);
    return null;
  }
}

function charsToEstimatedTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}
