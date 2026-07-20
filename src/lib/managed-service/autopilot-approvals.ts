/**
 * Autopilot client-approval scaffolding (T−7 / T−3 reminders + publish-day
 * system auto-approve). Live email and live auto-approve stay gated off.
 *
 * Reminder due-detection already lives in `dueApprovalReminders`
 * (`client_7d` / `client_3d`). This module centralises schedule constants,
 * the system autopilot actor, and a no-op-gated auto-approve helper.
 */

import { logAction } from "@/lib/audit";
import { respondManagedApprovalWithToken } from "@/lib/db";
import {
  hashApprovalToken,
  type ApprovalReminderKind,
} from "@/lib/managed-service/workflow";
import type { ActingUser, ManagedApprovalRequest } from "@/lib/types";

/** Days before dueAt when client reminders fire (negative = before deadline). */
export const AUTOPILOT_CLIENT_REMINDER_SCHEDULE = [
  { offsetDays: -7, kind: "client_7d" as const satisfies ApprovalReminderKind },
  { offsetDays: -3, kind: "client_3d" as const satisfies ApprovalReminderKind },
] as const;

/**
 * PLACEHOLDER: reviewed client email subject/body for T−7 and T−3 reminders.
 * Do not send live copy until product signs off and AUTOPILOT_EMAIL_LIVE is true.
 */
export const AUTOPILOT_REMINDER_EMAIL_COPY_PLACEHOLDER: Record<
  "client_7d" | "client_3d",
  { subject: string; html: string }
> = {
  client_7d: {
    subject: "PLACEHOLDER: Approval reminder (7 days)",
    html: "<p>PLACEHOLDER — T−7 client approval reminder copy.</p>",
  },
  client_3d: {
    subject: "PLACEHOLDER: Approval reminder (3 days)",
    html: "<p>PLACEHOLDER — T−3 client approval reminder copy.</p>",
  },
};

/** Keep false — live Reminder/auto-approve email must not send from stubs. */
export const AUTOPILOT_EMAIL_LIVE = false;

/**
 * When true on publish day, system autopilot may auto-approve pending client
 * approvals (NOT staff). Remains false until product enables the path.
 */
export const AUTOPILOT_PUBLISH_DAY_AUTO_APPROVE_LIVE = false;

/** Synthetic actor for system autopilot actions — distinct from staff and cron. */
export function systemAutopilotActor(tenantId: string): ActingUser {
  return {
    id: "system:autopilot",
    email: "autopilot@marketing-command-centre.system",
    // PLACEHOLDER: confirm display name shown in audit / client history.
    name: "System Autopilot",
    role: "super_admin",
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

export function isPublishDayForApproval(
  request: Pick<ManagedApprovalRequest, "dueAt">,
  atIso: string,
): boolean {
  const dueDay = request.dueAt.slice(0, 10);
  const atDay = atIso.slice(0, 10);
  return dueDay === atDay;
}

/**
 * Publish-day auto-approve for client approvals only.
 * Always logs the system autopilot actor; never attributes to staff.
 * Gated by AUTOPILOT_PUBLISH_DAY_AUTO_APPROVE_LIVE (default false).
 */
export async function maybeAutopilotAutoApproveOnPublishDay(args: {
  tenantId: string;
  request: ManagedApprovalRequest;
  /** Raw approval secret (not hash) already issued for this request, if available. */
  approvalToken?: string | null;
  atIso?: string;
}): Promise<{ attempted: boolean; approved: boolean; reason: string }> {
  const atIso = args.atIso ?? new Date().toISOString();
  if (args.request.status !== "pending") {
    return { attempted: false, approved: false, reason: "not_pending" };
  }
  if (!isPublishDayForApproval(args.request, atIso)) {
    return { attempted: false, approved: false, reason: "not_publish_day" };
  }
  if (!AUTOPILOT_PUBLISH_DAY_AUTO_APPROVE_LIVE) {
    return {
      attempted: false,
      approved: false,
      reason: "autopilot_auto_approve_flag_off",
    };
  }
  if (!args.approvalToken) {
    return {
      attempted: true,
      approved: false,
      reason: "missing_approval_token",
    };
  }

  const actor = systemAutopilotActor(args.tenantId);
  const accepted = await respondManagedApprovalWithToken(
    hashApprovalToken(args.approvalToken),
    args.request.companyId,
    "approved",
    { actorId: actor.id, source: "system_autopilot" },
  );
  await logAction(actor, "managed_approval.autopilot_auto_approved", {
    targetType: "managed_approval_request",
    targetId: args.request.id,
    companyId: args.request.companyId,
    detail: accepted
      ? "System autopilot auto-approved on publish day (not staff)."
      : "System autopilot attempted publish-day auto-approve; token rejected.",
  });
  return {
    attempted: true,
    approved: Boolean(accepted),
    reason: accepted ? "approved" : "token_rejected",
  };
}
