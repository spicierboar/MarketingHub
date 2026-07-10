import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const STATUS_TONE: Record<string, Tone> = {
  // company
  draft_onboarding: "neutral",
  pending_review: "warning",
  approved: "success",
  ai_ready: "success",
  needs_update: "warning",
  responded: "success",
  // reviews (M33)
  archived: "neutral",
  // requests
  submitted: "info",
  needs_more_information: "warning",
  ai_drafting: "info",
  draft_ready: "primary",
  pending_approval: "warning",
  changes_required: "warning",
  scheduled: "primary",
  published: "success",
  cancelled: "neutral",
  completed: "success",
  // content
  ai_draft: "info",
  user_edited: "primary",
  rejected: "danger",
  analysed: "neutral",
  // social
  ai_drafted: "info",
  escalated: "danger",
  no_response_required: "neutral",
  closed: "neutral",
  // campaigns & offers (P4)
  draft: "neutral",
  planned: "info",
  drafted: "primary",
  skipped: "neutral",
  // publishing (P7; queue states from the scale pass)
  failed: "danger",
  publishing: "info", // claimed by a queue worker, in-flight to the platform
  dead: "danger", // out of retries — requeue or cancel in the Publishing Centre
  // Module 6 paid advertising — ad-campaign + lead statuses
  active: "success",
  paused: "warning",
  ended: "neutral",
  new: "info",
  qualified: "primary",
  won: "success",
  lost: "danger",
  // Phase 4 photo shoots
  requested: "info",
  confirmed: "success",
  seated: "primary",
  checked_in: "primary",
  no_show: "danger",
  in_progress: "info",
  delivered: "warning",
  // Module 5 orders
  pending_payment: "warning",
  paid: "success",
  accepted: "primary",
  preparing: "info",
  ready: "success",
  in_design: "info",
  client_review: "warning",
  opted_in: "success",
  opted_out: "danger",
  pending: "warning",
  sending: "info",
  sent: "success",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

const RISK_TONE: Record<RiskLevel, Tone> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge tone={RISK_TONE[level]}>{titleCase(level)} risk</Badge>;
}
