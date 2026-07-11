// Self-tests for managed auto-progress (critique-gated schedule_approved).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  canAutoExecuteLowRisk,
  defaultServiceLevel,
} from "@/lib/managed-service/authority";
import { progressManagedSchedulesForCompany } from "@/lib/managed-service/auto-progress";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, User } from "@/lib/types";

function acting(user: User, tenantId: string): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole: "owner",
    role: TENANT_ROLE_TIER.owner,
  };
}

/** schedule_approved is true only at fully_managed; material kinds stay blocked. */
export async function checkScheduleApprovedAuthorityOnlyFullyManaged(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const scheduleOk =
    canAutoExecuteLowRisk("fully_managed", "schedule_approved") &&
    !canAutoExecuteLowRisk("managed_exceptions", "schedule_approved") &&
    !canAutoExecuteLowRisk("approval", "schedule_approved");
  const materialBlocked =
    !canAutoExecuteLowRisk("fully_managed", "publish") &&
    !canAutoExecuteLowRisk("fully_managed", "spend") &&
    !canAutoExecuteLowRisk("fully_managed", "promotion_activate");
  const ok = scheduleOk && materialBlocked;
  return {
    ok,
    detail: `scheduleOk=${scheduleOk} materialBlocked=${materialBlocked}`,
  };
}

/** approval-level company must schedule 0 via auto-progress. */
export async function checkAutoProgressSkipsApprovalLevel(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Auto Progress Approval ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `ap-approval-${Date.now()}@example.dev`,
    name: "Auto Progress Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Approval Level Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      industry: "cafe",
      managedService: { serviceLevel: defaultServiceLevel() },
    },
  });

  try {
    const result = await progressManagedSchedulesForCompany(user, company.id);
    const ok =
      result.scheduled === 0 && result.blocked === 0 && result.skipped === 0;
    return {
      ok,
      detail: `scheduled=${result.scheduled} blocked=${result.blocked} skipped=${result.skipped}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}
