import { createHash, randomBytes } from "node:crypto";
import type {
  Asset,
  CompanyServiceBillingState,
  ManagedApprovalRequest,
  ManagedChannelKey,
  ManagedContentConcept,
  ManagedEngagementRoute,
  ManagedPaidAuthorization,
  ManagedPlannedSlot,
  ManagedStrategyCycle,
} from "@/lib/types";
import { MANAGED_CHANNELS } from "@/lib/types";

export const MANAGED_CHANNEL_LABELS: Record<ManagedChannelKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube_shorts: "YouTube / Shorts",
  linkedin: "LinkedIn",
  threads: "Threads",
  x: "X",
  pinterest: "Pinterest",
  google_business_profile: "Google Business Profile",
  website_blog_cms: "Website / blog / CMS",
  email: "Email",
  sms: "SMS",
  whatsapp_rcs: "WhatsApp / RCS",
  reviews_engagement: "Reviews and engagement",
  local_technical_seo: "Local and technical SEO",
  aeo_geo: "AEO / GEO",
  analytics: "Analytics",
  paid_media: "Paid media",
};

export const ROLLING_HORIZON_DAYS = 30;
export const FINAL_CONTENT_LEAD_DAYS = 14;
export const CLIENT_REVISION_LIMIT = 2;

export function assertCompleteTaxonomy(): void {
  for (const channel of MANAGED_CHANNELS) {
    if (!MANAGED_CHANNEL_LABELS[channel]) throw new Error(`Missing channel label: ${channel}`);
  }
}

export function managedChannelKeyFromLabel(label: string): ManagedChannelKey {
  const normalised = label.trim().toLowerCase();
  const entry = (Object.entries(MANAGED_CHANNEL_LABELS) as [ManagedChannelKey, string][])
    .find(([, display]) => display.toLowerCase() === normalised);
  if (entry) return entry[0];
  if (normalised === "gbp") return "google_business_profile";
  if (normalised === "youtube") return "youtube_shorts";
  return MANAGED_CHANNELS.find((channel) => channel === normalised) ?? "facebook";
}

export function finalContentDueAt(plannedPublishAt: string): string {
  const publish = Date.parse(plannedPublishAt);
  if (!Number.isFinite(publish)) throw new Error("A valid planned publish date is required.");
  return new Date(publish - FINAL_CONTENT_LEAD_DAYS * 86_400_000).toISOString();
}

export function isInsideRollingHorizon(
  plannedPublishAt: string,
  nowIso: string,
): boolean {
  const delta = Date.parse(plannedPublishAt) - Date.parse(nowIso);
  return delta >= 0 && delta <= ROLLING_HORIZON_DAYS * 86_400_000;
}

/** Package accounting counts concepts, never their channel adaptations. */
export function consumedConceptUnits(concepts: ManagedContentConcept[]): number {
  return new Set(
    concepts
      .filter((concept) => concept.quotaConsumedAt && concept.status !== "cancelled")
      .map((concept) => concept.id),
  ).size;
}

export function strategyInputsConfirmed(
  cycle: Pick<ManagedStrategyCycle, "confirmedInputs">,
): boolean {
  const input = cycle.confirmedInputs;
  return Boolean(
    input.profileConfirmedAt &&
      input.packageId &&
      input.goals.length &&
      input.locations.length &&
      input.seasonalInputs.length,
  );
}

export function assessOptimisationChange(args: {
  cycle: Pick<ManagedStrategyCycle, "guardrails">;
  channel: ManagedChannelKey;
  theme: string;
  publishWindow: string;
  changesBudgetOrGoal?: boolean;
}): { allowed: boolean; escalate: boolean; reason: string } {
  if (args.changesBudgetOrGoal) {
    return { allowed: false, escalate: true, reason: "Budget or goal changes require staff approval." };
  }
  const within =
    args.cycle.guardrails.channels.includes(args.channel) &&
    args.cycle.guardrails.themes.includes(args.theme) &&
    args.cycle.guardrails.publishWindows.includes(args.publishWindow);
  if (within) {
    return {
      allowed: true,
      escalate: false,
      reason: "Timing, channel and theme remain within approved guardrails.",
    };
  }
  return {
    allowed: false,
    escalate: true,
    reason: "The proposed optimisation is outside approved guardrails.",
  };
}

function isReusableVisual(asset: Asset): boolean {
  return asset.assetType === "image" || asset.assetType === "graphic";
}

export function standardConceptVisualGate(args: {
  concept: ManagedContentConcept;
  assets: Asset[];
  adaptationCopies: string[];
  atIso?: string;
}): { ok: boolean; reason?: string } {
  if (args.adaptationCopies.length === 0 || args.adaptationCopies.some((copy) => !copy.trim())) {
    return { ok: false, reason: "Every channel adaptation requires completed copy." };
  }
  const selected = args.assets.filter((asset) => asset.id === args.concept.reusableAssetId);
  const asset = selected[0];
  if (selected.length !== 1 || !asset || !isReusableVisual(asset)) {
    return { ok: false, reason: "Exactly one reusable image or graphic is required." };
  }
  if (asset.status !== "approved") return { ok: false, reason: "The reusable visual is not approved." };
  const at = (args.atIso ?? new Date().toISOString()).slice(0, 10);
  if (asset.usageRights.expiryDate && asset.usageRights.expiryDate <= at) {
    return { ok: false, reason: "The reusable visual rights have expired." };
  }
  if (asset.source === "upload" && (!asset.rightsConfirmedAt || !asset.rightsConfirmationEmail)) {
    return { ok: false, reason: "Client-provided visual rights require email confirmation." };
  }
  if (asset.source === "ai_generated" && !asset.privateProvenance) {
    return { ok: false, reason: "Generated visual provenance is incomplete." };
  }
  return { ok: true };
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueApprovalSecret(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashApprovalToken(token) };
}

export type ApprovalReminderKind = "client_7d" | "client_3d" | "staff_1d";
export function dueApprovalReminders(
  request: ManagedApprovalRequest,
  atIso: string,
): { kind: ApprovalReminderKind; idempotencyKey: string }[] {
  if (request.status !== "pending") return [];
  const days = (Date.parse(request.dueAt) - Date.parse(atIso)) / 86_400_000;
  const due: { kind: ApprovalReminderKind; idempotencyKey: string }[] = [];
  if (days <= 7 && !request.reminder7dAt) {
    due.push({ kind: "client_7d", idempotencyKey: `approval:${request.id}:client_7d` });
  }
  if (days <= 3 && !request.reminder3dAt) {
    due.push({ kind: "client_3d", idempotencyKey: `approval:${request.id}:client_3d` });
  }
  if (days <= 1 && !request.staffEscalationAt) {
    due.push({ kind: "staff_1d", idempotencyKey: `approval:${request.id}:staff_1d` });
  }
  return due;
}

export function nextRevisionRoute(
  request: Pick<ManagedApprovalRequest, "revisionRound">,
): { revisionRound: 1 | 2; route: "client" } | { revisionRound: 2; route: "staff_exception" } {
  if (request.revisionRound >= CLIENT_REVISION_LIMIT) {
    return { revisionRound: 2, route: "staff_exception" };
  }
  return {
    revisionRound: (request.revisionRound + 1) as 1 | 2,
    route: "client",
  };
}

export function approvalSchedulesExistingSlot(
  request: ManagedApprovalRequest,
  slots: ManagedPlannedSlot[],
): ManagedPlannedSlot {
  if (!request.plannedSlotId) throw new Error("Approval has no explicit planned slot.");
  const slot = slots.find((item) => item.id === request.plannedSlotId);
  if (!slot || slot.status === "cancelled") throw new Error("The explicit planned slot is unavailable.");
  return slot;
}

export function paidAuthorizationGate(args: {
  authorization: ManagedPaidAuthorization;
  creativeApproval?: ManagedApprovalRequest;
  budgetTargetingApproval?: ManagedApprovalRequest;
  approvedMonthTotalAud: number;
  billing?: CompanyServiceBillingState;
}): { ok: boolean; reason?: string } {
  if (args.billing && !["active", "cancel_at_period_end"].includes(args.billing.status)) {
    return { ok: false, reason: "Paid activity is paused while payment is unresolved." };
  }
  if (args.creativeApproval?.status !== "approved") {
    return { ok: false, reason: "Paid creative approval is required." };
  }
  if (args.budgetTargetingApproval?.status !== "approved") {
    return { ok: false, reason: "Budget and targeting approval is required." };
  }
  if (!args.authorization.disclosureAcceptedAt) {
    return { ok: false, reason: "Direct platform charge disclosure must be accepted." };
  }
  if (
    args.approvedMonthTotalAud + args.authorization.requestedBudgetAud >
    args.authorization.clientMonthlyCapAud
  ) {
    return { ok: false, reason: "The client-authorised monthly cap would be exceeded." };
  }
  return { ok: true };
}

export function routeEngagementRisk(input: {
  riskLevel: ManagedEngagementRoute["riskLevel"];
  sentiment: ManagedEngagementRoute["sentiment"];
  confidence: number;
}): Pick<ManagedEngagementRoute, "decision" | "reason"> {
  const lowRisk =
    input.riskLevel === "low" &&
    input.sentiment !== "negative" &&
    input.sentiment !== "uncertain" &&
    input.confidence >= 0.8;
  if (lowRisk) {
    return {
      decision: "auto_publish",
      reason: "Low-risk response with high confidence.",
    };
  }
  return {
    decision: "staff_review",
    reason: "Negative, sensitive or uncertain engagement requires staff review.",
  };
}
