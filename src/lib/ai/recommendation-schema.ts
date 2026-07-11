// Hand validation for brief §17 AI recommendation payloads — no new npm deps.

import type { AiRecommendationPayload, AiRecommendedAction } from "@/lib/types";

export type AiRecommendationValidationError = {
  path: string;
  message: string;
};

export type ValidateAiRecommendationResult =
  | { ok: true; payload: AiRecommendationPayload }
  | { ok: false; errors: AiRecommendationValidationError[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function optionalScore(v: unknown, path: string, errors: AiRecommendationValidationError[]): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isFiniteNumber(v)) {
    errors.push({ path, message: "must be a finite number" });
    return undefined;
  }
  if (v < 0 || v > 1) {
    errors.push({ path, message: "must be between 0 and 1 inclusive" });
  }
  return v;
}

function validateAction(
  raw: unknown,
  index: number,
  errors: AiRecommendationValidationError[],
): AiRecommendedAction | null {
  const path = `recommended_actions[${index}]`;
  if (!isPlainObject(raw)) {
    errors.push({ path, message: "must be an object" });
    return null;
  }
  if (typeof raw.action_type !== "string" || !raw.action_type.trim()) {
    errors.push({ path: `${path}.action_type`, message: "required non-empty string" });
  }
  const confidence = optionalScore(raw.confidence_score, `${path}.confidence_score`, errors);
  const risk = optionalScore(raw.risk_score, `${path}.risk_score`, errors);
  if (raw.approval_required !== undefined && typeof raw.approval_required !== "boolean") {
    errors.push({ path: `${path}.approval_required`, message: "must be a boolean" });
  }

  return {
    action_type: typeof raw.action_type === "string" ? raw.action_type : "",
    entity_id: optionalString(raw.entity_id),
    current_value: optionalString(raw.current_value),
    proposed_value: optionalString(raw.proposed_value),
    reason: optionalString(raw.reason),
    expected_impact: optionalString(raw.expected_impact),
    confidence_score: confidence,
    risk_score: risk,
    approval_required:
      typeof raw.approval_required === "boolean" ? raw.approval_required : undefined,
  };
}

/**
 * Validate a raw AI recommendation payload (brief §17 shape).
 * Returns a typed payload on success, or a list of path/message errors.
 */
export function validateAiRecommendationPayload(raw: unknown): ValidateAiRecommendationResult {
  const errors: AiRecommendationValidationError[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ path: "", message: "payload must be an object" }] };
  }

  if (typeof raw.recommendation_type !== "string" || !raw.recommendation_type.trim()) {
    errors.push({ path: "recommendation_type", message: "required non-empty string" });
  }
  if (raw.campaign_id !== undefined && typeof raw.campaign_id !== "string") {
    errors.push({ path: "campaign_id", message: "must be a string when present" });
  }
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    errors.push({ path: "summary", message: "required non-empty string" });
  }
  if (!Array.isArray(raw.recommended_actions)) {
    errors.push({ path: "recommended_actions", message: "must be an array" });
  }
  if (!isStringArray(raw.data_sources)) {
    errors.push({ path: "data_sources", message: "must be an array of strings" });
  }
  if (!isStringArray(raw.assumptions)) {
    errors.push({ path: "assumptions", message: "must be an array of strings" });
  }
  if (!isStringArray(raw.compliance_flags)) {
    errors.push({ path: "compliance_flags", message: "must be an array of strings" });
  }
  if (typeof raw.generated_at !== "string" || !raw.generated_at.trim()) {
    errors.push({ path: "generated_at", message: "required ISO-8601 string" });
  }
  if (typeof raw.model_version !== "string" || !raw.model_version.trim()) {
    errors.push({ path: "model_version", message: "required non-empty string" });
  }
  if (typeof raw.prompt_version !== "string" || !raw.prompt_version.trim()) {
    errors.push({ path: "prompt_version", message: "required non-empty string" });
  }

  const actions: AiRecommendedAction[] = [];
  if (Array.isArray(raw.recommended_actions)) {
    for (let i = 0; i < raw.recommended_actions.length; i++) {
      const action = validateAction(raw.recommended_actions[i], i, errors);
      if (action) actions.push(action);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const payload: AiRecommendationPayload = {
    recommendation_type: raw.recommendation_type as string,
    campaign_id: optionalString(raw.campaign_id),
    summary: raw.summary as string,
    recommended_actions: actions,
    data_sources: raw.data_sources as string[],
    assumptions: raw.assumptions as string[],
    compliance_flags: raw.compliance_flags as string[],
    generated_at: raw.generated_at as string,
    model_version: raw.model_version as string,
    prompt_version: raw.prompt_version as string,
  };

  return { ok: true, payload };
}
