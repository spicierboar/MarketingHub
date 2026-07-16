// Self-tests for managed-service rolling 30-day calendar maintainer.
// Suggestions only at approval level; managed levels may auto-draft (never publish).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  listCalendarAssistSuggestions,
  listContent,
  listScheduledPosts,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  companyNeedsCalendarTopUp,
  maintainRollingCalendarForCompany,
} from "@/lib/managed-service/rolling-calendar";
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkRollingCalendarNeedsTopUpWhenEmpty(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Rolling Cal Empty ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `rc-empty-${Date.now()}@example.dev`,
    name: "Rolling Empty Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const company = await createCompany({
    tenantId: t.id,
    name: "Empty Horizon Co",
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
    const needs = await companyNeedsCalendarTopUp(t.id, company.id, todayIso());
    const ok = needs === true;
    return { ok, detail: `needsTopUp=${needs}` };
  } finally {
    await purgeTenant(t.id);
  }
}

export async function checkRollingCalendarMaintainAddsSuggestionsOnly(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Rolling Cal Maintain ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `rc-maint-${Date.now()}@example.dev`,
    name: "Rolling Maintain Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Maintain Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      industry: "cafe",
      natureOfBusiness: "Local cafe",
      services: ["Coffee"],
      serviceAreas: ["Town"],
      managedService: { serviceLevel: "approval" },
    },
  });

  try {
    const beforePosts = await listScheduledPosts(t.id);
    const result = await maintainRollingCalendarForCompany(user, company.id);
    const afterPosts = await listScheduledPosts(t.id);
    const open = await listCalendarAssistSuggestions(t.id, [company.id], "open");
    const live = afterPosts.filter(
      (p) => p.status === "scheduled" || p.status === "published",
    );
    // approval level: suggestions only — no auto-draft
    const ok =
      result.suggestionsAdded >= 1 &&
      result.draftsCreated === 0 &&
      open.length >= result.suggestionsAdded &&
      live.length === 0 &&
      afterPosts.length === beforePosts.length;
    return {
      ok,
      detail: `added=${result.suggestionsAdded} drafts=${result.draftsCreated} open=${open.length} livePosts=${live.length}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}

/** managed_exceptions may auto-accept assists into drafts (never scheduled posts). */
export async function checkRollingCalendarAutoDraftsWhenManaged(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Rolling Cal AutoDraft ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `rc-ad-${Date.now()}@example.dev`,
    name: "Rolling AutoDraft Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "AutoDraft Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      industry: "cafe",
      natureOfBusiness: "Local cafe",
      services: ["Coffee"],
      serviceAreas: ["Town"],
      approvalContact: "owner@example.dev",
      managedService: { serviceLevel: "managed_exceptions" },
    },
  });

  try {
    const result = await maintainRollingCalendarForCompany(user, company.id);
    const open = await listCalendarAssistSuggestions(t.id, [company.id], "open");
    const accepted = await listCalendarAssistSuggestions(t.id, [company.id], "accepted");
    const content = (await listContent(t.id)).filter((c) => c.companyId === company.id);
    const live = (await listScheduledPosts(t.id)).filter(
      (p) => p.status === "scheduled" || p.status === "published",
    );
    const ok =
      result.suggestionsAdded >= 1 &&
      result.draftsCreated >= 1 &&
      accepted.length >= result.draftsCreated &&
      content.length >= result.draftsCreated &&
      open.length === 0 &&
      live.length === 0;
    return {
      ok,
      detail: `added=${result.suggestionsAdded} drafts=${result.draftsCreated} accepted=${accepted.length} content=${content.length} open=${open.length} live=${live.length}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}
