import {
  assertSafeEnrichmentUrl,
  autoOnboardingLiveFor,
  normaliseHttpUrl,
} from "@/lib/auto-onboarding";
import { placesEnrichmentLiveFor } from "@/lib/places-enrichment";
import { onboardingEnrichmentLiveFor } from "@/lib/ai/onboarding-enrich";
import { resolvePublishingTokenKey } from "@/lib/token";

export function checkPublishingTokenKeyPolicy(): {
  ok: boolean;
  detail: string;
} {
  let stagingRejected = false;
  let productionRejected = false;
  try {
    resolvePublishingTokenKey({ env: "staging" });
  } catch {
    stagingRejected = true;
  }
  try {
    resolvePublishingTokenKey({ env: "production" });
  } catch {
    productionRejected = true;
  }
  const local =
    resolvePublishingTokenKey({
      env: "development",
      localKey: "ephemeral-test-key",
      localSimulation: true,
    }) === "ephemeral-test-key";
  let unmarkedDevelopmentRejected = false;
  try {
    resolvePublishingTokenKey({
      env: "development",
      localKey: "ephemeral-test-key",
    });
  } catch {
    unmarkedDevelopmentRejected = true;
  }
  const configured =
    resolvePublishingTokenKey({
      env: "staging",
      configuredKey: "configured-test-key",
    }) === "configured-test-key";
  return {
    ok:
      stagingRejected &&
      productionRejected &&
      unmarkedDevelopmentRejected &&
      local &&
      configured,
    detail: `stagingRejected=${stagingRejected} productionRejected=${productionRejected} unmarkedDevelopmentRejected=${unmarkedDevelopmentRejected} local=${local} configured=${configured}`,
  };
}

export function checkWebsiteEnrichmentRejectsSsrfUrls(): {
  ok: boolean;
  detail: string;
} {
  const unsafe = [
    "http://localhost",
    "http://localhost.",
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "http://[fe80::1]",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "https://user:password@example.com",
    "ftp://example.com/file",
    "https://example.com:8443",
  ];
  const rejected = unsafe.filter((url) => normaliseHttpUrl(url) === undefined);
  let redirectTargetRejected = false;
  try {
    assertSafeEnrichmentUrl(
      new URL("http://127.0.0.1/admin", "https://example.com/start").toString(),
    );
  } catch {
    redirectTargetRejected = true;
  }
  const safe =
    normaliseHttpUrl("https://example.com/path") ===
    "https://example.com/path";
  return {
    ok:
      rejected.length === unsafe.length &&
      redirectTargetRejected &&
      safe,
    detail: `rejected=${rejected.length}/${unsafe.length} redirect=${redirectTargetRejected} safe=${safe}`,
  };
}

export function checkStagingEnrichmentPolicy(): {
  ok: boolean;
  detail: string;
} {
  const websiteStaging = autoOnboardingLiveFor("staging", "true");
  const placesStaging = placesEnrichmentLiveFor("staging", true, true);
  const modelStaging = onboardingEnrichmentLiveFor("staging", true);
  const websiteLocal = autoOnboardingLiveFor("development", "true");
  const placesLocal = placesEnrichmentLiveFor("development", true, true);
  const modelLocal = onboardingEnrichmentLiveFor("development", true);
  return {
    ok:
      !websiteStaging &&
      !placesStaging &&
      !modelStaging &&
      !websiteLocal &&
      !placesLocal &&
      !modelLocal,
    detail: `stagingWebsite=${websiteStaging} stagingPlaces=${placesStaging} stagingModel=${modelStaging} localWebsite=${websiteLocal} localPlaces=${placesLocal} localModel=${modelLocal}`,
  };
}
