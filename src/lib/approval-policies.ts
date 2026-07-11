// Configurable human approval gates for the AI campaign layer.
// Uses tenant DB policies when present; otherwise safe defaults that never
// auto-publish, auto-change budget, or auto-activate promotions.

import { listApprovalPolicies } from "@/lib/db";
import type {
  ApprovalLevel,
  ApprovalPolicy,
  ApprovalPolicyEntityType,
  CampaignType,
} from "@/lib/types";

export type ApprovalEntityType =
  | ApprovalPolicyEntityType
  | "publish"
  | "content"
  | "budget"
  | "promotion"
  | "complaint"
  | "crisis"
  | "campaign"
  | "spend"
  | "regulated_claim"
  | string;

export interface ResolveApprovalRequiredInput {
  tenantId?: string;
  entityType: ApprovalEntityType;
  campaignType?: CampaignType | string;
  budget?: number;
  riskScore?: number;
  platform?: string;
  /** Optional pre-loaded policies (avoids a DB round-trip in batch callers). */
  policies?: ApprovalPolicy[];
}

export interface ResolveApprovalRequiredResult {
  approvalRequired: boolean;
  approvalLevel: ApprovalLevel | string;
  reason: string;
  matchedPolicyId?: string;
  source: "policy" | "default";
}

/** Entity types that always require a human gate under default rules. */
export const ALWAYS_REQUIRE_APPROVAL_TYPES: ReadonlySet<string> = new Set([
  "publish",
  "content",
  "budget",
  "promotion",
  "complaint",
  "crisis",
  "campaign",
  "spend",
  "regulated_claim",
]);

/**
 * Entity types allowed to resolve to approval_level `none` when riskScore < 0.2
 * under default (no-DB) rules. Intentionally narrow — publish / budget /
 * promotion / complaint / crisis are never listed here.
 */
export const NONE_LEVEL_ALLOWLIST: ReadonlySet<string> = new Set([
  // Low-risk content *suggestions* only — still never auto-publishes.
  "content",
]);

export const LOW_RISK_NONE_THRESHOLD = 0.2;

function policyMatches(
  policy: ApprovalPolicy,
  input: ResolveApprovalRequiredInput,
): boolean {
  if (!policy.active) return false;
  if (policy.entityType !== input.entityType) return false;
  const rules = policy.triggerRules ?? {};
  if (
    rules.campaignTypes?.length &&
    input.campaignType &&
    !rules.campaignTypes.includes(input.campaignType)
  ) {
    return false;
  }
  if (
    typeof rules.minBudget === "number" &&
    (input.budget === undefined || input.budget < rules.minBudget)
  ) {
    return false;
  }
  if (
    typeof rules.minRiskScore === "number" &&
    (input.riskScore === undefined || input.riskScore < rules.minRiskScore)
  ) {
    return false;
  }
  if (
    rules.platforms?.length &&
    input.platform &&
    !rules.platforms.map((p) => p.toLowerCase()).includes(input.platform.toLowerCase())
  ) {
    return false;
  }
  return true;
}

function defaultResolution(
  input: ResolveApprovalRequiredInput,
): ResolveApprovalRequiredResult {
  const risk = input.riskScore ?? 1;
  const entity = input.entityType;

  if (
    risk < LOW_RISK_NONE_THRESHOLD &&
    NONE_LEVEL_ALLOWLIST.has(entity) &&
    !["publish", "budget", "promotion", "complaint", "crisis", "spend"].includes(entity)
  ) {
    return {
      approvalRequired: false,
      approvalLevel: "none",
      reason: `Default: riskScore ${risk.toFixed(2)} < ${LOW_RISK_NONE_THRESHOLD} and entityType "${entity}" is on the none-level allowlist.`,
      source: "default",
    };
  }

  if (ALWAYS_REQUIRE_APPROVAL_TYPES.has(entity) || entity === "publish") {
    return {
      approvalRequired: true,
      approvalLevel: "single",
      reason: `Default: entityType "${entity}" always requires human approval.`,
      source: "default",
    };
  }

  // Unknown entity types still require a human gate.
  return {
    approvalRequired: true,
    approvalLevel: "single",
    reason: `Default: unknown entityType "${entity}" requires human approval.`,
    source: "default",
  };
}

/**
 * Resolve whether human approval is required for an AI-proposed action.
 * Prefers active tenant policies; falls back to safe defaults.
 */
export async function resolveApprovalRequired(
  input: ResolveApprovalRequiredInput,
): Promise<ResolveApprovalRequiredResult> {
  let policies = input.policies;
  if (!policies && input.tenantId) {
    policies = await listApprovalPolicies(input.tenantId, input.entityType);
  }

  const active = (policies ?? []).filter((p) => p.active && p.entityType === input.entityType);
  const matched = active.find((p) => policyMatches(p, input));

  if (matched) {
    const level = (matched.approvalLevel || "single") as ApprovalLevel | string;
    const approvalRequired = level !== "none";
    return {
      approvalRequired,
      approvalLevel: level,
      reason: `Matched policy "${matched.name}" → level ${level}.`,
      matchedPolicyId: matched.id,
      source: "policy",
    };
  }

  return defaultResolution(input);
}
