// Self-tests for managed-service delivery (drafts/suggestions only — never publish).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  listScheduledPosts,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  canAutoExecuteLowRisk,
  defaultServiceLevel,
} from "@/lib/managed-service/authority";
import {
  enqueueManagedDeliveryForCompany,
  processManagedDeliveryRun,
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
    const dueMs = new Date(run.strategyDueAt).getTime() - new Date(onboardedAt).getTime();
    const within24h = dueMs > 23 * 3_600_000 && dueMs <= 24 * 3_600_000 + 60_000;
    const ok = run.phase === "queued" && within24h;
    return {
      ok,
      detail: `phase=${run.phase} dueDeltaH=${(dueMs / 3_600_000).toFixed(2)}`,
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
    },
  });

  try {
    const run = await enqueueManagedDeliveryForCompany({
      tenantId: t.id,
      companyId: company.id,
      onboardingCompletedAt: new Date().toISOString(),
    });
    const after = await processManagedDeliveryRun(run.id, user);
    const scheduled = await listScheduledPosts(t.id);
    const live = scheduled.filter(
      (p) => p.status === "scheduled" || p.status === "published",
    );
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
      (after!.phase !== "awaiting_approval" || Boolean(after!.campaignId));
    return {
      ok,
      detail: `phase=${after?.phase} campaign=${after?.campaignId ?? "none"} livePosts=${live.length}`,
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
