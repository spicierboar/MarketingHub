// Operating authority for managed-service levels.
//
// Publish / spend / promotion activation ALWAYS require the existing human path
// (critique via scheduleOne, approval policies, spend gates) — even at
// fully_managed. These helpers only describe which *low-risk draft* work the
// delivery runner may create without an extra client click.

import type { ManagedServiceLevel } from "@/lib/types";

export type ManagedAuthorityKind =
  | "draft_content"
  | "calendar_suggest"
  | "rolling_plan"
  | "publish"
  | "spend"
  | "promotion_activate";

const LOW_RISK: ReadonlySet<ManagedAuthorityKind> = new Set([
  "draft_content",
  "calendar_suggest",
  "rolling_plan",
]);

const MATERIAL: ReadonlySet<ManagedAuthorityKind> = new Set([
  "publish",
  "spend",
  "promotion_activate",
]);

export function defaultServiceLevel(): ManagedServiceLevel {
  return "approval";
}

/**
 * Whether the delivery runner may auto-create low-risk drafts/suggestions.
 * Always false for publish | spend | promotion_activate — those still need
 * scheduleOne critique + existing approval / spend policies.
 */
export function canAutoExecuteLowRisk(
  level: ManagedServiceLevel,
  kind: ManagedAuthorityKind,
): boolean {
  if (MATERIAL.has(kind) || kind === "publish" || kind === "spend" || kind === "promotion_activate") {
    return false;
  }
  if (!LOW_RISK.has(kind)) return false;
  return level === "fully_managed" || level === "managed_exceptions";
}

/**
 * Whether a client (or admin) approval is required before the kind proceeds.
 * Inverse of canAutoExecuteLowRisk for material kinds; always true for publish/spend/promotion.
 */
export function requiresClientApproval(
  level: ManagedServiceLevel,
  kind: ManagedAuthorityKind,
): boolean {
  if (MATERIAL.has(kind)) return true;
  if (LOW_RISK.has(kind)) {
    // approval level: everything needs a human; managed levels may draft without a click
    return !canAutoExecuteLowRisk(level, kind);
  }
  return true;
}
