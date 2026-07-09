// Centralised AI usage metering (Module 3). Single place for cost estimation,
// token accounting, and ai_runs logging — keeps every AI entry point consistent.

import { logAiRun } from "@/lib/db";
import type { AiRun } from "@/lib/types";

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
}

// Sonnet-class pricing heuristic (USD per million tokens). Template mode = $0.
const INPUT_USD_PER_M = 3;
const OUTPUT_USD_PER_M = 15;

export function charsToEstimatedTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!model.startsWith("claude")) return 0;
  const cost =
    (inputTokens / 1e6) * INPUT_USD_PER_M + (outputTokens / 1e6) * OUTPUT_USD_PER_M;
  return Number(cost.toFixed(6));
}

export function estimateCostFromChars(model: string, outputChars: number, contextChars = 0): {
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
} {
  const inputTokens = charsToEstimatedTokens(contextChars + 200);
  const outputTokens = charsToEstimatedTokens(outputChars);
  return {
    inputTokens,
    outputTokens,
    estCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
  };
}

export interface RecordAiUsageInput {
  tenantId: string;
  companyId?: string;
  userId: string;
  kind: AiRun["kind"];
  model: string;
  promptSummary: string;
  sourcesUsed: string[];
  outputChars: number;
  inputTokens?: number;
  outputTokens?: number;
  contextChars?: number;
}

export async function recordAiUsage(input: RecordAiUsageInput): Promise<AiRun> {
  const inputTokens =
    input.inputTokens ??
    charsToEstimatedTokens((input.contextChars ?? 0) + input.promptSummary.length);
  const outputTokens = input.outputTokens ?? charsToEstimatedTokens(input.outputChars);
  const estCostUsd =
    input.inputTokens !== undefined || input.outputTokens !== undefined
      ? estimateCostUsd(input.model, inputTokens, outputTokens)
      : estimateCostFromChars(input.model, input.outputChars, input.contextChars).estCostUsd;

  return logAiRun({
    tenantId: input.tenantId,
    companyId: input.companyId,
    userId: input.userId,
    kind: input.kind,
    model: input.model,
    promptSummary: input.promptSummary.slice(0, 120),
    outputChars: input.outputChars,
    sourcesUsed: input.sourcesUsed,
    estCostUsd,
    inputTokens,
    outputTokens,
    contextChars: input.contextChars,
  });
}
