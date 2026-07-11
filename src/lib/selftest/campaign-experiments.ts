// Self-tests for campaign A/B winner engine (sample + confidence gates).

import type { CampaignExperiment } from "@/lib/types";
import {
  evaluateWinnerSync,
  twoProportionConfidence,
} from "@/lib/campaign-experiments";

function stubExperiment(
  patch: Partial<CampaignExperiment> & {
    variants: CampaignExperiment["variants"];
  },
): CampaignExperiment {
  return {
    id: "cex_stub",
    companyId: "c_stub",
    campaignId: "cmp_stub",
    hypothesis: "Test beats control",
    controlVariantId: "var_control",
    testVariantId: "var_test",
    audienceSplit: 50,
    successMetric: "conversion_rate",
    minSampleSize: 100,
    confidenceThreshold: 0.95,
    winningVariation: null,
    status: "running",
    createdById: "u_stub",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

/** Winner blocked when either arm is below minSampleSize. */
export async function checkCampaignExperimentWinnerBlockedSample(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const exp = stubExperiment({
    minSampleSize: 500,
    confidenceThreshold: 0.8,
    variants: [
      { id: "var_control", label: "Control", role: "control", impressions: 80, conversions: 8 },
      { id: "var_test", label: "Test", role: "test", impressions: 80, conversions: 20 },
    ],
  });
  const result = evaluateWinnerSync(exp);
  const ok = !result.declared && result.reason === "sample_size";
  return {
    ok,
    detail: result.declared
      ? `unexpected winner ${result.winnerVariantId}`
      : `${result.reason}: ${result.detail}`,
  };
}

/** Winner blocked when sample is enough but confidence is below threshold. */
export async function checkCampaignExperimentWinnerBlockedConfidence(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const exp = stubExperiment({
    minSampleSize: 100,
    confidenceThreshold: 0.95,
    variants: [
      // Identical rates → confidence 0
      { id: "var_control", label: "Control", role: "control", impressions: 1000, conversions: 100 },
      { id: "var_test", label: "Test", role: "test", impressions: 1000, conversions: 100 },
    ],
  });
  const result = evaluateWinnerSync(exp);
  const ok = !result.declared && result.reason === "confidence";
  return {
    ok,
    detail: result.declared
      ? `unexpected winner ${result.winnerVariantId}`
      : `${result.reason} conf=${(result.confidence * 100).toFixed(1)}%`,
  };
}

/** Winner allowed when both sample and confidence thresholds are met. */
export async function checkCampaignExperimentWinnerAllowed(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const exp = stubExperiment({
    minSampleSize: 100,
    confidenceThreshold: 0.95,
    variants: [
      { id: "var_control", label: "Control", role: "control", impressions: 1000, conversions: 100 },
      { id: "var_test", label: "Test", role: "test", impressions: 1000, conversions: 200 },
    ],
  });
  const conf = twoProportionConfidence(1000, 100, 1000, 200);
  const result = evaluateWinnerSync(exp);
  const ok =
    result.declared &&
    result.winnerVariantId === "var_test" &&
    result.confidence >= 0.95 &&
    conf >= 0.95;
  return {
    ok,
    detail: result.declared
      ? `winner=${result.winnerLabel} conf=${(result.confidence * 100).toFixed(1)}%`
      : `blocked ${result.reason}: ${result.detail}`,
  };
}
