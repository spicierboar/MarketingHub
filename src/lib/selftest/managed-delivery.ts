// Self-tests for managed-service delivery (drafts/suggestions only — never publish).

import {
  addMembership,
  createCompany,
  createContent,
  createTenant,
  createUser,
  getManagedDeliveryRun,
  listCalendarAssistSuggestions,
  listScheduledPosts,
  purgeTenant,
  updateCompany,
  updateContent,
  updateManagedDeliveryRun,
} from "@/lib/db";
import {
  canAutoExecuteLowRisk,
  defaultServiceLevel,
} from "@/lib/managed-service/authority";
import {
  enqueueManagedDeliveryForCompany,
  isStrategyEligible,
  maybePromoteManagedDeliveryToActive,
  processDueManagedDeliveries,
  processManagedDeliveryRun,
  shouldPromoteAwaitingApprovalToActive,
} from "@/lib/managed-service/delivery-runner";
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

/** Enqueue stamps strategyEligibleAt = +6h and strategyDueAt = +24h. */
export async function checkManagedDeliveryEnqueueDueWithin24h(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Managed Delivery ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `md-${Date.now()}@example.dev`,
    name: "Managed Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const company = await createCompany({
    tenantId: t.id,
    name: "Managed Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      natureOfBusiness: "Local cafe",
      services: ["Coffee", "Brunch"],
      serviceAreas: ["Wattle Valley"],
      industry: "restaurant",
    },
  });

  try {
    const onboardedAt = new Date().toISOString();
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: onboardedAt,
      serviceLevel: defaultServiceLevel(),
    });
    const eligibleMs =
      new Date(run.strategyEligibleAt).getTime() - new Date(onboardedAt).getTime();
    const dueMs = new Date(run.strategyDueAt).getTime() - new Date(onboardedAt).getTime();
    const floor6h =
      eligibleMs > 5.9 * 3_600_000 && eligibleMs <= 6 * 3_600_000 + 60_000;
    const ceiling24h = dueMs > 23 * 3_600_000 && dueMs <= 24 * 3_600_000 + 60_000;
    const notYetEligible = !isStrategyEligible(run, onboardedAt);
    const ok = run.phase === "queued" && floor6h && ceiling24h && notYetEligible;
    return {
      ok,
      detail: `phase=${run.phase} eligibleH=${(eligibleMs / 3_600_000).toFixed(2)} dueH=${(dueMs / 3_600_000).toFixed(2)} notYet=${notYetEligible}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

/** processDue must not start generating before strategyEligibleAt. */
export async function checkManagedDeliveryRespects6hFloor(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Managed Floor ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `md-floor-${Date.now()}@example.dev`,
    name: "Floor Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Floor Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      natureOfBusiness: "Cafe",
      services: ["Coffee"],
      serviceAreas: ["Town"],
      industry: "cafe",
      approvalContact: "owner@example.dev",
    },
  });

  try {
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: new Date().toISOString(),
    });
    const processed = await processDueManagedDeliveries(user, t.id);
    const after = await getManagedDeliveryRun(run.id);
    const stillQueued = after?.phase === "queued";
    const ok = processed === 0 && stillQueued && !isStrategyEligible(run);
    return {
      ok,
      detail: `processed=${processed} phase=${after?.phase} eligible=${isStrategyEligible(run)}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

export async function checkManagedDeliveryProcessNoSchedule(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Managed Process ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `mdp-${Date.now()}@example.dev`,
    name: "Managed Process Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Process Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      natureOfBusiness: "Boutique motel",
      services: ["Rooms", "Breakfast"],
      serviceAreas: ["Coastal"],
      industry: "hotel",
      targetCustomers: "Weekend travellers",
      approvalContact: "owner@example.dev",
      managedService: {
        serviceLevel: defaultServiceLevel(),
        marketingPackageId: "pro",
      },
    },
  });

  try {
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: new Date().toISOString(),
    });
    // Direct process bypasses the 6h floor (tick gate is processDue only).
    const after = await processManagedDeliveryRun(run.id, user);
    const scheduled = await listScheduledPosts(t.id);
    const live = scheduled.filter(
      (p) => p.status === "scheduled" || p.status === "published",
    );
    const assists = await listCalendarAssistSuggestions(t.id, [company.id], "open");
    const planAssists = assists.filter((s) => s.kind === "implementation_plan");
    const phaseOk =
      after?.phase === "awaiting_approval" ||
      after?.phase === "strategy" ||
      after?.phase === "calendar" ||
      after?.phase === "content" ||
      after?.phase === "analysing";
    // Must not have published; ideally reaches awaiting_approval with a campaign.
    const ok =
      Boolean(after) &&
      phaseOk &&
      live.length === 0 &&
      after!.phase !== "failed" &&
      (after!.phase !== "awaiting_approval" || Boolean(after!.campaignId)) &&
      (after!.phase !== "awaiting_approval" || Boolean(after!.implementationPlanEmailedAt));
    return {
      ok,
      detail: `phase=${after?.phase} campaign=${after?.campaignId ?? "none"} livePosts=${live.length} planAssists=${planAssists.length} emailedAt=${after?.implementationPlanEmailedAt ? "yes" : "no"}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

/** Implementation plan email stamp is idempotent across ticks. */
export async function checkManagedDeliveryPlanEmailIdempotent(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Managed Email ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `md-email-${Date.now()}@example.dev`,
    name: "Email Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Email Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      natureOfBusiness: "Bakery",
      services: ["Bread"],
      serviceAreas: ["Suburb"],
      industry: "retail",
      approvalContact: "owner@example.dev",
    },
  });

  try {
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: new Date().toISOString(),
    });
    const first = await processManagedDeliveryRun(run.id, user);
    const stamped = first?.implementationPlanEmailedAt;
    const second = await processManagedDeliveryRun(run.id, user);
    const ok =
      Boolean(stamped) &&
      second?.implementationPlanEmailedAt === stamped &&
      (first?.phase === "awaiting_approval" || Boolean(stamped));
    return {
      ok,
      detail: `stamp1=${stamped ?? "none"} stamp2=${second?.implementationPlanEmailedAt ?? "none"} phase=${second?.phase}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

export async function checkManagedDeliveryNeverAutoPublish(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const levels = ["approval", "managed_exceptions", "fully_managed"] as const;
  const blocked = levels.every(
    (level) =>
      !canAutoExecuteLowRisk(level, "publish") &&
      !canAutoExecuteLowRisk(level, "spend") &&
      !canAutoExecuteLowRisk(level, "promotion_activate"),
  );
  const draftsOk =
    canAutoExecuteLowRisk("fully_managed", "draft_content") &&
    canAutoExecuteLowRisk("managed_exceptions", "calendar_suggest") &&
    !canAutoExecuteLowRisk("approval", "draft_content");
  const ok = blocked && draftsOk;
  return {
    ok,
    detail: `publishBlocked=${blocked} draftsOk=${draftsOk}`,
  };
}

/** Threshold helper: one scheduled OR majority approved. */
export async function checkManagedDeliveryPromoteThreshold(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const byScheduled = shouldPromoteAwaitingApprovalToActive({
    pipelineCount: 4,
    approvedOrScheduledCount: 0,
    scheduledPostCount: 1,
  });
  const byMajority = shouldPromoteAwaitingApprovalToActive({
    pipelineCount: 4,
    approvedOrScheduledCount: 2,
    scheduledPostCount: 0,
  });
  const notYet = shouldPromoteAwaitingApprovalToActive({
    pipelineCount: 4,
    approvedOrScheduledCount: 1,
    scheduledPostCount: 0,
  });
  const empty = shouldPromoteAwaitingApprovalToActive({
    pipelineCount: 0,
    approvedOrScheduledCount: 0,
    scheduledPostCount: 0,
  });
  const ok = byScheduled && byMajority && !notYet && empty === false;
  return {
    ok,
    detail: `byScheduled=${byScheduled} byMajority=${byMajority} notYet=${notYet} empty=${empty}`,
  };
}

/** awaiting_approval → active when majority of campaign drafts are approved. */
export async function checkManagedDeliveryPromotesToActive(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Managed Promote ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `mdp-act-${Date.now()}@example.dev`,
    name: "Promote Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Promote Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      natureOfBusiness: "Cafe",
      services: ["Coffee"],
      serviceAreas: ["Town"],
      industry: "cafe",
    },
  });

  try {
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: new Date().toISOString(),
    });
    const campaignId = "cmp_promote_test";
    await updateManagedDeliveryRun(run.id, {
      phase: "awaiting_approval",
      campaignId,
      statusMessageKey: "approval_required",
    });

    const c1 = await createContent({
      companyId: company.id,
      requestId: null,
      type: "social_post",
      title: "Draft A",
      body: "Body A",
      status: "ai_draft",
      createdById: userRow.id,
      campaignId,
    });
    const c2 = await createContent({
      companyId: company.id,
      requestId: null,
      type: "social_post",
      title: "Draft B",
      body: "Body B",
      status: "ai_draft",
      createdById: userRow.id,
      campaignId,
    });
    await updateContent(c1.id, {
      status: "approved",
      approvedById: userRow.id,
      approvedAt: new Date().toISOString(),
    });
    await updateContent(c2.id, {
      status: "approved",
      approvedById: userRow.id,
      approvedAt: new Date().toISOString(),
    });

    const after = await maybePromoteManagedDeliveryToActive(run.id, user);
    const ok = after?.phase === "active";
    return {
      ok,
      detail: `phase=${after?.phase} key=${after?.statusMessageKey}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

/** Exception notify must not throw when Resend is unset (soft no-op). */
export async function checkManagedExceptionNotifyNoThrow(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const { notifyClientException } = await import(
    "@/lib/managed-service/exception-notify"
  );
  const t = await createTenant({
    name: `Exception Notify ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  try {
    const company = await createCompany({
      tenantId: t.id,
      name: "Notify Co",
      createdBy: "selftest",
    });
    await updateCompany(company.id, {
      profile: {
        ...company.profile,
        approvalContact: "owner@example.dev",
      },
    });
    const result = await notifyClientException({
      tenantId: t.id,
      companyId: company.id,
      kind: "blocked",
      subject: "Test exception",
      body: "We need a bit more information to continue.",
    });
    const ok = typeof result.ok === "boolean" && typeof result.detail === "string";
    return { ok, detail: `ok=${result.ok} detail=${result.detail}` };
  } finally {
    await purgeTenant(t.id);
  }
}
