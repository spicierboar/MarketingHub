/**
 * Single platform agency tenant (MCC / our biz).
 *
 * Product lock: we are the only agency for now. Self-serve signup creates a
 * *client company* under this agency — never a separate agency-style workspace.
 * Multi-agency / white-label signup is parked.
 */

import {
  createTenant,
  getTenant,
  listTenants,
  updateTenant,
} from "@/lib/db";
import { appEnv, localDemoEnabled } from "@/lib/env";
import { now } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

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

/**
 * Resolve (and if needed repair/create) the single platform agency tenant.
 * Never deletes data — repairs kind/name/onboardingCompletedAt forward when
 * a prior client-onboarding bug renamed or re-kinded the agency row.
 */
export async function resolvePlatformAgencyTenant(): Promise<Tenant> {
  const canonical = platformAgencyCanonicalName();
  const tenants = await listTenants();
  const active = tenants.filter((t) => t.status === "active");

  let hit =
    preferByName(active, canonical) ||
    active.find((t) => t.kind === "agency") ||
    // Staging quick-login may have renamed the only agency row to a client name
    // (e.g. "Viya") while flipping kind to business_group — recover that row.
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
    const isCanonicalMiss = hit.name !== canonical && preferByName(active, canonical) == null;
    if (isStagingSingle || (isCanonicalMiss && hit.kind === "agency")) {
      repairs.name = canonical;
    } else if (hit.name !== canonical && hit.kind !== "agency") {
      repairs.name = canonical;
    }
  }
  if (!hit.onboardingCompletedAt) repairs.onboardingCompletedAt = now();
  if (hit.plan === "starter" && appEnv() === "staging") {
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
  const agency = await resolvePlatformAgencyTenant();
  return agency.id === tenantId;
}
