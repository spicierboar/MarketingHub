// Platform agency seat — self-serve clients attach as companies, not new agencies.

import { resolvePlatformAgencyTenant } from "@/lib/platform-agency";

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
