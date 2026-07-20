import { logAction } from "@/lib/audit";
import {
  claimManagedApprovalReminder,
  completeManagedApprovalReminderClaim,
  createManagedChannelAdaptation,
  createManagedContentConcept,
  createManagedEngagementRoute,
  createManagedPlannedSlot,
  createManagedApprovalRequest,
  createManagedPaidAuthorization,
  createManagedStrategyCycle,
  getAsset,
  getCompany,
  listManagedApprovalRequests,
  listManagedStrategyCycles,
  respondManagedApprovalWithToken,
  updateManagedChannelAdaptation,
  updateManagedContentConcept,
  updateManagedPlannedSlot,
  updateAsset,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  dueApprovalReminders,
  assessOptimisationChange,
  finalContentDueAt,
  routeEngagementRisk,
  strategyInputsConfirmed,
  issueApprovalSecret,
  hashApprovalToken,
} from "@/lib/managed-service/workflow";
import {
  AUTOPILOT_EMAIL_LIVE,
  AUTOPILOT_REMINDER_EMAIL_COPY_PLACEHOLDER,
  maybeAutopilotAutoApproveOnPublishDay,
} from "@/lib/managed-service/autopilot-approvals";
import type {
  ActingUser,
  Company,
  CurrentMarketingPackageId,
  ManagedChannelKey,
  ManagedContentConcept,
  ManagedEngagementRoute,
  ManagedStrategyCycle,
} from "@/lib/types";

function quarterStart(atIso: string): string {
  const date = new Date(atIso);
  const month = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), month, 1)).toISOString().slice(0, 10);
}

export async function ensureQuarterlyStrategyCycle(args: {
  company: Company;
  packageId: CurrentMarketingPackageId;
  goals: string[];
  seasonalInputs: string[];
  profileConfirmedAt: string;
  channels: ManagedChannelKey[];
  themes: string[];
  publishWindows: string[];
  atIso?: string;
}): Promise<ManagedStrategyCycle> {
  const start = quarterStart(args.atIso ?? new Date().toISOString());
  const existing = (await listManagedStrategyCycles(args.company.tenantId, args.company.id))
    .find((cycle) => cycle.quarterStart === start);
  if (existing) return existing;
  const cycle = await createManagedStrategyCycle({
    tenantId: args.company.tenantId,
    companyId: args.company.id,
    quarterStart: start,
    status: "draft",
    confirmedInputs: {
      profileConfirmedAt: args.profileConfirmedAt,
      goals: args.goals,
      packageId: args.packageId,
      locations: args.company.profile.serviceAreas,
      seasonalInputs: args.seasonalInputs,
    },
    guardrails: {
      channels: args.channels,
      themes: args.themes,
      publishWindows: args.publishWindows,
    },
    approvedAt: null,
    supersededAt: null,
  });
  if (!strategyInputsConfirmed(cycle)) {
    throw new Error("Confirmed profile, goals, package, location and seasonal inputs are required.");
  }
  return cycle;
}

export async function createManagedConceptBundle(args: {
  tenantId: string;
  companyId: string;
  strategyCycleId: string;
  campaignId?: string | null;
  packagePeriod: string;
  unitKey: string;
  title: string;
  theme: string;
  adaptations: {
    channelKey: ManagedChannelKey;
    copy: string;
    plannedPublishAt: string;
  }[];
}): Promise<ManagedContentConcept> {
  if (!args.adaptations.length) throw new Error("At least one channel adaptation is required.");
  const concept = await createManagedContentConcept({
    tenantId: args.tenantId,
    companyId: args.companyId,
    strategyCycleId: args.strategyCycleId,
    campaignId: args.campaignId ?? null,
    packagePeriod: args.packagePeriod,
    unitKey: args.unitKey,
    title: args.title,
    theme: args.theme,
    status: "planned",
    reusableAssetId: null,
    quotaConsumedAt: new Date().toISOString(),
  });
  for (const item of args.adaptations) {
    const adaptation = await createManagedChannelAdaptation({
      tenantId: args.tenantId,
      companyId: args.companyId,
      conceptId: concept.id,
      channelKey: item.channelKey,
      copy: item.copy,
      status: item.copy.trim() ? "ready" : "draft",
    });
    await createManagedPlannedSlot({
      tenantId: args.tenantId,
      companyId: args.companyId,
      conceptId: concept.id,
      adaptationId: adaptation.id,
      plannedPublishAt: item.plannedPublishAt,
      status: "planned",
      scheduledPostId: null,
    });
  }
  return concept;
}

export async function processManagedApprovalReminders(
  actor: ActingUser,
  atIso = new Date().toISOString(),
  options: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const pending = (await listManagedApprovalRequests(actor.tenantId))
    .filter((request) => request.status === "pending");
  let sent = 0;
  const claimOwner = `${actor.id}:${atIso}`;
  requests: for (const request of pending) {
    for (const reminder of dueApprovalReminders(request, atIso)) {
      if (
        options.signal?.aborted ||
        (options.deadlineMs && Date.now() >= options.deadlineMs)
      ) break requests;
      const claimed = await claimManagedApprovalReminder(
        request.id,
        reminder.kind,
        claimOwner,
        atIso,
      );
      if (!claimed) continue;
      const staff = reminder.kind === "staff_1d";
      const clientCopy =
        reminder.kind === "client_7d" || reminder.kind === "client_3d"
          ? AUTOPILOT_REMINDER_EMAIL_COPY_PLACEHOLDER[reminder.kind]
          : null;
      // Autopilot client reminder email stays off until AUTOPILOT_EMAIL_LIVE + copy review.
      // Release the claim without stamping so reminders remain due when the flag flips on.
      if (clientCopy && !AUTOPILOT_EMAIL_LIVE) {
        await completeManagedApprovalReminderClaim(
          request.id,
          reminder.kind,
          claimOwner,
          reminder.idempotencyKey,
        );
        continue;
      }
      const result = await sendEmail({
        to: staff ? actor.email : request.recipientEmail,
        subject: staff
          ? "Approval requires staff follow-up"
          : (clientCopy?.subject ?? "Approval reminder"),
        html: staff
          ? "<p>An approval is due within one day and requires staff follow-up.</p>"
          : (clientCopy?.html ??
            "<p>Your approval is still pending. Please review it by the due date.</p>"),
        idempotencyKey: reminder.idempotencyKey,
      });
      if (!result.ok) {
        await completeManagedApprovalReminderClaim(
          request.id,
          reminder.kind,
          claimOwner,
          reminder.idempotencyKey,
        );
        continue;
      }
      const stamp = new Date().toISOString();
      await completeManagedApprovalReminderClaim(
        request.id,
        reminder.kind,
        claimOwner,
        reminder.idempotencyKey,
        stamp,
      );
      await logAction(actor, "managed_approval.reminder_sent", {
        targetType: "managed_approval_request",
        targetId: request.id,
        companyId: request.companyId,
        detail: reminder.kind,
      });
      sent += 1;
    }
    // Publish-day system autopilot auto-approve (NOT staff). No-op while flag off.
    await maybeAutopilotAutoApproveOnPublishDay({
      tenantId: actor.tenantId,
      request,
      atIso,
    });
  }
  return sent;
}

export async function recordManagedEngagementRisk(args: {
  tenantId: string;
  companyId: string;
  sourceKind: ManagedEngagementRoute["sourceKind"];
  sourceId: string;
  riskLevel: ManagedEngagementRoute["riskLevel"];
  sentiment: ManagedEngagementRoute["sentiment"];
  confidence: number;
}): Promise<ManagedEngagementRoute> {
  const route = routeEngagementRisk(args);
  return createManagedEngagementRoute({
    ...args,
    ...route,
    publishedAt: null,
  });
}

export async function confirmClientAssetRights(args: {
  actor: ActingUser;
  assetId: string;
  confirmationEmail: string;
}): Promise<void> {
  const asset = await getAsset(args.assetId);
  if (!asset) throw new Error("Asset not found.");
  if (asset.source !== "upload") {
    throw new Error("Rights email confirmation applies to client-provided assets.");
  }
  const company = await getCompany(asset.companyId);
  if (!company || company.tenantId !== args.actor.tenantId) {
    throw new Error("Asset does not belong to this tenant.");
  }
  const confirmedAt = new Date().toISOString();
  await updateAsset(asset.id, {
    rightsConfirmedAt: confirmedAt,
    rightsConfirmationEmail: args.confirmationEmail.trim().toLowerCase(),
  });
  await logAction(args.actor, "managed_asset.rights_confirmed", {
    targetType: "asset",
    targetId: asset.id,
    companyId: asset.companyId,
    detail: `Rights confirmed by email from ${args.confirmationEmail.trim().toLowerCase()}`,
  });
}

export async function applyManagedPerformanceOptimisation(args: {
  actor: ActingUser;
  cycle: ManagedStrategyCycle;
  conceptId: string;
  adaptationId: string;
  slotId: string;
  channel: ManagedChannelKey;
  theme: string;
  publishWindow: string;
  plannedPublishAt: string;
  changesBudgetOrGoal?: boolean;
}): Promise<"adjusted" | "staff_exception"> {
  const assessment = assessOptimisationChange(args);
  if (!assessment.allowed) {
    await logAction(args.actor, "managed_optimisation.staff_exception", {
      targetType: "managed_strategy_cycle",
      targetId: args.cycle.id,
      companyId: args.cycle.companyId,
      detail: assessment.reason,
    });
    return "staff_exception";
  }
  await updateManagedContentConcept(args.conceptId, { theme: args.theme });
  await updateManagedChannelAdaptation(args.adaptationId, {
    channelKey: args.channel,
  });
  await updateManagedPlannedSlot(args.slotId, {
    plannedPublishAt: args.plannedPublishAt,
    finalContentDueAt: finalContentDueAt(args.plannedPublishAt),
  });
  await logAction(args.actor, "managed_optimisation.adjusted", {
    targetType: "managed_strategy_cycle",
    targetId: args.cycle.id,
    companyId: args.cycle.companyId,
    detail: assessment.reason,
  });
  return "adjusted";
}

export async function createPaidApprovalPair(args: {
  tenantId: string;
  companyId: string;
  adCampaignId: string;
  recipientEmail: string;
  dueAt: string;
  monthKey: string;
  requestedBudgetAud: number;
  clientMonthlyCapAud: number;
  directChargeDisclosureAcceptedAt: string;
}): Promise<{
  creativeToken: string;
  budgetTargetingToken: string;
  authorizationId: string;
}> {
  if (args.requestedBudgetAud > args.clientMonthlyCapAud) {
    throw new Error("Requested paid budget exceeds the client-authorised monthly cap.");
  }
  const creativeSecret = issueApprovalSecret();
  const budgetSecret = issueApprovalSecret();
  const base = {
    tenantId: args.tenantId,
    companyId: args.companyId,
    contentId: null,
    conceptId: null,
    plannedSlotId: null,
    adCampaignId: args.adCampaignId,
    recipientEmail: args.recipientEmail.trim().toLowerCase(),
    status: "pending" as const,
    dueAt: args.dueAt,
    revisionRound: 0 as const,
    supersededById: null,
    reminder7dAt: null,
    reminder3dAt: null,
    staffEscalationAt: null,
    reminder7dKey: null,
    reminder3dKey: null,
    staffEscalationKey: null,
    respondedAt: null,
    directChargeDisclosureAcceptedAt: args.directChargeDisclosureAcceptedAt,
  };
  const creative = await createManagedApprovalRequest({
    ...base,
    scope: "paid_creative",
    tokenHash: creativeSecret.tokenHash,
  });
  const budget = await createManagedApprovalRequest({
    ...base,
    scope: "paid_budget_targeting",
    tokenHash: budgetSecret.tokenHash,
  });
  const authorization = await createManagedPaidAuthorization({
    tenantId: args.tenantId,
    companyId: args.companyId,
    adCampaignId: args.adCampaignId,
    monthKey: args.monthKey,
    requestedBudgetAud: args.requestedBudgetAud,
    clientMonthlyCapAud: args.clientMonthlyCapAud,
    creativeApprovalId: creative.id,
    budgetTargetingApprovalId: budget.id,
    disclosureAcceptedAt: args.directChargeDisclosureAcceptedAt,
    status: "pending",
  });
  return {
    creativeToken: creativeSecret.token,
    budgetTargetingToken: budgetSecret.token,
    authorizationId: authorization.id,
  };
}

export async function approveManagedRequestBySecret(args: {
  tenantId: string;
  companyId: string;
  requestId: string;
  token: string;
  acceptDirectChargeDisclosure?: boolean;
}): Promise<void> {
  const accepted = await respondManagedApprovalWithToken(
    hashApprovalToken(args.token),
    args.companyId,
    "approved",
    { requestId: args.requestId },
    args.acceptDirectChargeDisclosure,
  );
  if (!accepted) {
    throw new Error("This approval link is invalid, expired or superseded.");
  }
}
