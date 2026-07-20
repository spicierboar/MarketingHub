/**
 * Single platform agency tenant (MCC / our biz).
 *
 * Product lock: we are the only agency for now. Self-serve signup creates a
 * *client company* under this agency — never a separate agency-style workspace.
 * Multi-agency / white-label signup is parked.
 */

import {
  createTenant,
  getMembership,
  getTenant,
  listTenants,
  updateMembership,
  updateTenant,
} from "@/lib/db";
import { appEnv, localDemoEnabled } from "@/lib/env";
import { now } from "@/lib/utils";
import type { ActingUser, Tenant, TenantRole } from "@/lib/types";

/** Canonical display name for the platform agency in each env. */
export function platformAgencyCanonicalName(): string {
  const fromEnv = (process.env.CC_PLATFORM_AGENCY_NAME || "").trim();
  if (fromEnv) return fromEnv;
  if (appEnv() === "staging") return "Staging Agency";
  if (localDemoEnabled()) return "BrightSpark Marketing";
  return "Marketing Command Centre";
}

function preferByName(tenants: Tenant[], name: string): Tenant | undefined {
  return tenants.find(
    (t) => t.status === "active" && t.name === name,
  );
}

/** Ops seat names that historically meant “the agency” on staging/demo. */
function looksLikePlatformAgencyName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const canonical = platformAgencyCanonicalName().trim().toLowerCase();
  if (n === canonical) return true;
  return (
    n === "staging agency" ||
    n === "brightspark marketing" ||
    n === "marketing command centre"
  );
}

function isPlausiblePlatformAgencySeat(t: Tenant, activeCount: number): boolean {
  if (t.status !== "active") return false;
  if (t.kind === "agency") return true;
  if (looksLikePlatformAgencyName(t.name)) return true;
  // Staging: sole active tenant is the ops seat even if kind/name were corrupted.
  return appEnv() === "staging" && activeCount === 1;
}

/**
 * Resolve (and if needed repair/create) the single platform agency tenant.
 * Never deletes data — repairs kind/name/onboardingCompletedAt forward when
 * a prior client-onboarding bug renamed or re-kinded the agency row.
 *
 * When `preferTenantId` is the signed-in seat and that row is a plausible
 * platform agency, prefer it over an alphabetically-first duplicate name —
 * otherwise Legal heal promotes the wrong orphan row and the real seat stays
 * stuck as “client workspace”.
 */
export async function resolvePlatformAgencyTenant(
  preferTenantId?: string,
): Promise<Tenant> {
  const canonical = platformAgencyCanonicalName();
  const tenants = await listTenants();
  const active = tenants.filter((t) => t.status === "active");

  // Staging: client onboarding once renamed the only ops seat (e.g. to "Viya" or
  // an ABR legal name) and flipped kind to business_group. Prefer that row over
  // creating a second agency while orphaning existing client companies.
  const stagingCorruptedSeat =
    appEnv() === "staging" &&
    active.length === 1 &&
    active[0]!.kind !== "agency" &&
    preferByName(active, canonical) == null
      ? active[0]
      : undefined;

  const preferred =
    preferTenantId != null
      ? active.find(
          (t) =>
            t.id === preferTenantId &&
            isPlausiblePlatformAgencySeat(t, active.length),
        )
      : undefined;

  let hit =
    preferred ||
    preferByName(active, canonical) ||
    active.find((t) => t.kind === "agency") ||
    stagingCorruptedSeat ||
    (appEnv() === "staging" && active.length === 1 ? active[0] : undefined);

  if (!hit) {
    hit = await createTenant({
      name: canonical,
      kind: "agency",
      plan: "agency",
      status: "active",
      onboardingCompletedAt: now(),
    });
    return hit;
  }

  const repairs: Partial<Tenant> = {};
  if (hit.kind !== "agency") repairs.kind = "agency";
  if (hit.name !== canonical) {
    // Only auto-rename when this is clearly the platform seat (canonical miss,
    // or staging single-tenant corruption). Never rename BrightSpark seed when
    // env asks for a different name and BrightSpark already matches seed id.
    const isStagingSingle = appEnv() === "staging" && active.length === 1;
    const isCanonicalMiss =
      hit.name !== canonical && preferByName(active, canonical) == null;
    if (
      isStagingSingle ||
      stagingCorruptedSeat?.id === hit.id ||
      preferred?.id === hit.id ||
      (isCanonicalMiss && (hit.kind === "agency" || repairs.kind === "agency"))
    ) {
      repairs.name = canonical;
    } else if (hit.name !== canonical && hit.kind !== "agency") {
      repairs.name = canonical;
    }
  }
  if (!hit.onboardingCompletedAt) repairs.onboardingCompletedAt = now();
  if (
    appEnv() === "staging" &&
    (hit.plan === "starter" || repairs.kind === "agency") &&
    hit.plan !== "agency"
  ) {
    // Staging ops seat — prefer agency plan headroom for many clients.
    repairs.plan = "agency";
  }

  if (Object.keys(repairs).length > 0) {
    const updated = await updateTenant(hit.id, repairs);
    return updated ?? (await getTenant(hit.id)) ?? hit;
  }
  return hit;
}

/** True when this tenant id is the platform agency seat. */
export async function isPlatformAgencyTenant(tenantId: string): Promise<boolean> {
  const agency = await resolvePlatformAgencyTenant(tenantId);
  return agency.id === tenantId;
}

/** Promote leftover admin → owner on non-production so Legal publish is not blocked. */
async function promoteAgencyOpsIfNeeded(
  tenantId: string,
  userId: string,
): Promise<TenantRole | undefined> {
  const m = await getMembership(tenantId, userId);
  if (!m) return undefined;
  if (m.role === "owner") return "owner";
  // Staging/dev: leftover invites often landed as admin. Legal requires an
  // agency ops seat — promote rather than stranding Settings as “client”.
  if (appEnv() !== "production" && m.role === "admin") {
    await updateMembership(tenantId, userId, { role: "owner" });
    return "owner";
  }
  return m.role;
}

/**
 * Repair the signed-in seat when it is the platform agency under a wrong
 * `kind`/`name`, and (outside production) promote leftover admin membership
 * so Legal publish is not blocked by session/admin lag or duplicate agency rows.
 *
 * Call from Settings / Legal loads — never deletes data.
 */
export async function ensurePlatformAgencyPublisherContext(
  user: ActingUser,
): Promise<{ agency: Tenant; active: Tenant | undefined }> {
  // Prefer the signed-in seat when it is the real ops row (avoids promoting an
  // orphan duplicate also named “Staging Agency”).
  const agency = await resolvePlatformAgencyTenant(user.tenantId);

  await promoteAgencyOpsIfNeeded(agency.id, user.id);

  let active = await getTenant(user.tenantId);
  if (
    active &&
    active.id !== agency.id &&
    looksLikePlatformAgencyName(active.name) &&
    active.status === "active"
  ) {
    // Duplicate / env-mismatch: user is on a seat that *is* the agency by name
    // but resolve preferred another row. Repair this seat in place so their
    // session matches publishing rights without asking them to “switch”.
    const repairs: Partial<Tenant> = {};
    if (active.kind !== "agency") repairs.kind = "agency";
    if (active.name !== platformAgencyCanonicalName()) {
      repairs.name = platformAgencyCanonicalName();
    }
    if (appEnv() === "staging" && active.plan !== "agency") repairs.plan = "agency";
    if (!active.onboardingCompletedAt) repairs.onboardingCompletedAt = now();
    if (Object.keys(repairs).length > 0) {
      active = (await updateTenant(active.id, repairs)) ?? active;
    }
    await promoteAgencyOpsIfNeeded(active.id, user.id);
  } else if (active && active.id === agency.id && active.kind !== "agency") {
    active = agency;
  } else if (active && active.id === agency.id) {
    await promoteAgencyOpsIfNeeded(active.id, user.id);
  }

  return { agency, active };
}
