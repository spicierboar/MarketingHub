// Self-tests for managed auto-progress (critique-gated schedule_approved).

import {
  addMembership,
  createCampaign,
  createCampaignDraftScheduleItem,
  createCompany,
  createContent,
  createTenant,
  createUser,
  getCompany,
  purgeTenant,
  updateCompany,
  updateContent,
} from "@/lib/db";
import {
  canAutoExecuteLowRisk,
} from "@/lib/managed-service/authority";
import {
  listApprovedCampaignPlannedReadyToSchedule,
  progressManagedSchedulesForCompany,
} from "@/lib/managed-service/auto-progress";
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

/** schedule_approved at managed levels; material kinds stay blocked. */
export async function checkScheduleApprovedAuthorityOnlyFullyManaged(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const scheduleOk =
    canAutoExecuteLowRisk("fully_managed", "schedule_approved") &&
    canAutoExecuteLowRisk("managed_exceptions", "schedule_approved") &&
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
      managedService: { serviceLevel: "approval" },
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

/** Approved campaign draft-schedule rows surface as schedule candidates. */
export async function checkAutoProgressListsCampaignPlannedReady(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Auto Progress Planned ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `ap-planned-${Date.now()}@example.dev`,
    name: "Planned Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const company = await createCompany({
    tenantId: t.id,
    name: "Planned Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      managedService: { serviceLevel: "fully_managed" },
    },
  });

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  try {
    const campaign = await createCampaign({
      companyId: company.id,
      name: "Planned Pack",
      objective: "awareness",
      audience: "locals",
      serviceFocus: "social",
      channels: ["Facebook"],
      durationDays: 30,
      startDate: tomorrow,
      offerId: null,
      keyMessage: "Hello",
      status: "draft",
      requestId: null,
      createdById: userRow.id,
      approvedById: null,
      approvedAt: null,
    });
    const content = await createContent({
      companyId: company.id,
      requestId: null,
      type: "social_post",
      title: "Planned post",
      body: "A short approved post for the calendar.",
      status: "ai_draft",
      createdById: userRow.id,
      campaignId: campaign.id,
    });
    await updateContent(content.id, {
      status: "approved",
      approvedById: userRow.id,
      approvedAt: new Date().toISOString(),
    });
    await createCampaignDraftScheduleItem({
      campaignId: campaign.id,
      companyId: company.id,
      campaignItemId: null,
      contentId: content.id,
      planVersionId: null,
      scheduledDate: tomorrow,
      scheduledTime: "11:00",
      platform: "Facebook",
      title: content.title,
      status: "draft",
      createdById: userRow.id,
    });

    const ready = await listApprovedCampaignPlannedReadyToSchedule(
      t.id,
      company.id,
      8,
    );
    const listOk =
      ready.length === 1 &&
      ready[0]!.contentId === content.id &&
      ready[0]!.source === "campaign_planned" &&
      ready[0]!.date === tomorrow;

    // managed_exceptions may also schedule when ready rows exist (C P1)
    const refreshed = await getCompany(company.id);
    await updateCompany(company.id, {
      profile: {
        ...refreshed!.profile,
        managedService: { serviceLevel: "managed_exceptions" },
      },
    });
    const user = acting(userRow, t.id);
    const meResult = await progressManagedSchedulesForCompany(user, company.id);
    const levelOk = meResult.scheduled >= 1 || meResult.blocked >= 1;

    return {
      ok: listOk && levelOk,
      detail: `ready=${ready.length} date=${ready[0]?.date ?? "none"} meScheduled=${meResult.scheduled} meBlocked=${meResult.blocked}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}
