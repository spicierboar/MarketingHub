// Operating authority for managed-service levels.
//
// Publish / spend / promotion activation ALWAYS require the existing human path
// (critique via scheduleOne, approval policies, spend gates) — even at
// fully_managed. These helpers describe which *low-risk* work the delivery
// runner may create without an extra client click, plus schedule_approved:
// calling scheduleOne on already-approved content under pre-granted authority
// (critique still runs inside scheduleOne).

import type { ManagedServiceLevel } from "@/lib/types";

export type ManagedAuthorityKind =
  | "draft_content"
  | "calendar_suggest"
  | "rolling_plan"
  | "schedule_approved"
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

/** New clients default to managed_exceptions — client still Approves; system drafts/schedules. */
export function defaultServiceLevel(): ManagedServiceLevel {
  return "managed_exceptions";
}

/**
 * Whether the delivery runner may auto-create low-risk drafts/suggestions, or
 * call scheduleOne on already-approved content (managed levels).
 *
 * Always false for publish | spend | promotion_activate — those still need
 * scheduleOne critique + existing approval / spend policies.
 *
 * schedule_approved: true at fully_managed | managed_exceptions. Means call
 * scheduleOne on pre-approved content under pre-granted authority; critique
 * still runs inside scheduleOne — never bypassed.
 */
export function canAutoExecuteLowRisk(
  level: ManagedServiceLevel,
  kind: ManagedAuthorityKind,
): boolean {
  if (MATERIAL.has(kind) || kind === "publish" || kind === "spend" || kind === "promotion_activate") {
    return false;
  }
  if (kind === "schedule_approved") {
    return level === "fully_managed" || level === "managed_exceptions";
  }
  if (!LOW_RISK.has(kind)) return false;
  return level === "fully_managed" || level === "managed_exceptions";
}

/**
 * Whether a client (or admin) approval is required before the kind proceeds.
 * Inverse of canAutoExecuteLowRisk for low-risk / schedule_approved kinds;
 * always true for publish/spend/promotion.
 */
export function requiresClientApproval(
  level: ManagedServiceLevel,
  kind: ManagedAuthorityKind,
): boolean {
  if (MATERIAL.has(kind)) return true;
  if (kind === "schedule_approved" || LOW_RISK.has(kind)) {
    // approval level: everything needs a human; managed levels may draft and
    // schedule already-approved content without an extra click.
    return !canAutoExecuteLowRisk(level, kind);
  }
  return true;
}
