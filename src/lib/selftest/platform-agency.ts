// Platform agency seat — self-serve clients attach as companies, not new agencies.

import {
  addMembership,
  createUser,
  getTenant,
  updateTenant,
} from "@/lib/db";
import { resolvePlatformAgencyTenant } from "@/lib/platform-agency";
import { canPublishLegalDocs } from "@/lib/terms";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, User } from "@/lib/types";

export async function checkPlatformAgencyResolve() {
  const agency = await resolvePlatformAgencyTenant();
  const ok =
    agency.kind === "agency" &&
    !!agency.onboardingCompletedAt &&
    agency.status === "active";
  return {
    ok,
    detail: `${agency.name} kind=${agency.kind} onboarded=${!!agency.onboardingCompletedAt}`,
  };
}

function acting(user: User, tenantId: string, role: "owner" | "admin" = "owner"): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole: role,
    role: TENANT_ROLE_TIER[role],
  };
}

/**
 * Ops seat with corrupted kind=business_group must still open Legal editors
 * after ensurePlatformAgencyPublisherContext / canPublishLegalDocs.
 */
export async function checkLegalPublishOnCorruptedAgencySeat() {
  const agency = await resolvePlatformAgencyTenant();
  const priorKind = agency.kind;
  await updateTenant(agency.id, { kind: "business_group" });

  const suffix = Date.now();
  const userRow = await createUser({
    email: `agency-legal-${suffix}@selftest.dev`,
    name: "Agency Legal",
    role: "admin",
  });
  await addMembership({ tenantId: agency.id, userId: userRow.id, role: "owner" });

  try {
    const allowed = await canPublishLegalDocs(acting(userRow, agency.id, "owner"));
    const healed = await getTenant(agency.id);
    const ok = allowed === true && healed?.kind === "agency";
    return {
      ok,
      detail: ok
        ? `canPublish after kind heal (${priorKind}→agency)`
        : `expected canPublish+agency, got canPublish=${allowed} kind=${healed?.kind}`,
    };
  } finally {
    await updateTenant(agency.id, { kind: priorKind === "agency" ? "agency" : "agency" });
  }
}

/**
 * Leftover agency *admin* (session still stamped admin) must publish after heal
 * promotes DB membership — mirrors the staging Legal lockout.
 */
export async function checkLegalPublishOnAgencyAdminSeat() {
  const agency = await resolvePlatformAgencyTenant();
  const suffix = Date.now();
  const userRow = await createUser({
    email: `agency-admin-legal-${suffix}@selftest.dev`,
    name: "Agency Admin Legal",
    role: "admin",
  });
  await addMembership({ tenantId: agency.id, userId: userRow.id, role: "admin" });

  // Session stamp lags as admin; gate must trust DB after ensure/promote.
  const allowed = await canPublishLegalDocs(acting(userRow, agency.id, "admin"));
  return {
    ok: allowed === true,
    detail: allowed
      ? "canPublish for agency admin (DB role after heal)"
      : "expected canPublish=true for agency admin on agency seat",
  };
}
