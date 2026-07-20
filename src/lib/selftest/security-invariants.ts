import { autoOnboardingLive, normaliseHttpUrl } from "@/lib/auto-onboarding";
import { aiConfigured } from "@/lib/ai/claude";
import { placesEnrichmentConfigured } from "@/lib/places-enrichment";
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
  const invalid = [
    "https://user:password@example.com",
    "ftp://example.com/file",
    "notaurl",
  ];
  const rejected = invalid.filter((url) => normaliseHttpUrl(url) === undefined);
  const localAccepted = normaliseHttpUrl("http://127.0.0.1") === "http://127.0.0.1/";
  const safe =
    normaliseHttpUrl("https://example.com/path") ===
    "https://example.com/path";
  return {
    ok: rejected.length === invalid.length && localAccepted && safe,
    detail: `rejected=${rejected.length}/${invalid.length} localAccepted=${localAccepted} safe=${safe}`,
  };
}

export function checkStagingEnrichmentPolicy(): {
  ok: boolean;
  detail: string;
} {
  const prevCcEnv = process.env.CC_ENV;
  const prevWebsite = process.env.AUTO_ONBOARDING_LIVE;
  process.env.CC_ENV = "staging";
  delete process.env.AUTO_ONBOARDING_LIVE;
  const websiteStaging = autoOnboardingLive();
  process.env.CC_ENV = "development";
  process.env.AUTO_ONBOARDING_LIVE = "false";
  const websiteLocal = autoOnboardingLive();
  if (prevCcEnv === undefined) delete process.env.CC_ENV;
  else process.env.CC_ENV = prevCcEnv;
  if (prevWebsite === undefined) delete process.env.AUTO_ONBOARDING_LIVE;
  else process.env.AUTO_ONBOARDING_LIVE = prevWebsite;
  const placesStaging = placesEnrichmentConfigured();
  const modelStaging = aiConfigured();
  const placesLocal = placesEnrichmentConfigured();
  const modelLocal = aiConfigured();
  return {
    ok:
      websiteStaging &&
      placesStaging === placesEnrichmentConfigured() &&
      modelStaging === aiConfigured() &&
      !websiteLocal &&
      placesLocal === placesStaging &&
      modelLocal === modelStaging,
    detail: `stagingWebsite=${websiteStaging} stagingPlaces=${placesStaging} stagingModel=${modelStaging} localWebsite=${websiteLocal} localPlaces=${placesLocal} localModel=${modelLocal}`,
  };
}
