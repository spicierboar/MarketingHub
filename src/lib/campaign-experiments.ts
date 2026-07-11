// Campaign A/B winner engine — sample size + confidence gates.
// Extends the simpler funnel A/B (src/lib/funnel.ts) with threshold enforcement:
// evaluateWinner MUST refuse when sample < minSampleSize OR confidence < threshold.

import {
  createCampaignExperiment,
  getCampaign,
  getCampaignExperiment,
  updateCampaignExperiment,
} from "@/lib/db";
import type {
  CampaignExperiment,
  CampaignExperimentStatus,
  CampaignExperimentVariant,
} from "@/lib/types";

export type EvaluateWinnerResult =
  | {
      declared: false;
      reason: "sample_size" | "confidence" | "not_running" | "missing_variants";
      detail: string;
      confidence: number;
      controlRate: number;
      testRate: number;
      sampleControl: number;
      sampleTest: number;
    }
  | {
      declared: true;
      winnerVariantId: string;
      winnerLabel: string;
      confidence: number;
      controlRate: number;
      testRate: number;
      sampleControl: number;
      sampleTest: number;
      experiment: CampaignExperiment;
    };

function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erfApprox(z / Math.SQRT2));
}

/** Two-proportion z-test → confidence that rates differ (0–1). Deterministic. */
export function twoProportionConfidence(
  n1: number,
  conversions1: number,
  n2: number,
  conversions2: number,
): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  const p1 = conversions1 / n1;
  const p2 = conversions2 / n2;
  if (p1 === p2) return 0;
  const pPool = (conversions1 + conversions2) / (n1 + n2);
  if (pPool <= 0 || pPool >= 1) {
    // Extreme rates with no pooled variance — treat as decisive separation.
    return 0.999;
  }
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se <= 0) return 0.999;
  const z = Math.abs(p1 - p2) / se;
  return Math.max(0, Math.min(0.9999, 2 * normalCdf(z) - 1));
}

export function conversionRate(v: CampaignExperimentVariant): number {
  if (v.impressions <= 0) return 0;
  return v.conversions / v.impressions;
}

function defaultVariants(): CampaignExperimentVariant[] {
  return [
    { id: "var_control", label: "Control", role: "control", impressions: 0, conversions: 0 },
    { id: "var_test", label: "Test", role: "test", impressions: 0, conversions: 0 },
  ];
}

export async function createExperiment(input: {
  campaignId: string;
  hypothesis: string;
  createdById: string;
  successMetric?: string;
  minSampleSize?: number;
  confidenceThreshold?: number;
  audienceSplit?: number;
  startDate?: string;
  endDate?: string;
  variants?: CampaignExperimentVariant[];
}): Promise<CampaignExperiment> {
  const campaign = await getCampaign(input.campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const variants = input.variants?.length ? input.variants : defaultVariants();
  const control = variants.find((v) => v.role === "control") ?? variants[0]!;
  const test = variants.find((v) => v.role === "test") ?? variants[1] ?? variants[0]!;
  const split = input.audienceSplit ?? 50;
  if (split < 1 || split > 99) throw new Error("audienceSplit must be between 1 and 99");

  return createCampaignExperiment({
    companyId: campaign.companyId,
    campaignId: campaign.id,
    hypothesis: input.hypothesis.trim() || "Untitled hypothesis",
    controlVariantId: control.id,
    testVariantId: test.id,
    variants,
    audienceSplit: split,
    startDate: input.startDate,
    endDate: input.endDate,
    successMetric: input.successMetric ?? "conversion_rate",
    minSampleSize: input.minSampleSize ?? 100,
    confidenceThreshold: input.confidenceThreshold ?? 0.95,
    winningVariation: null,
    status: "draft",
    createdById: input.createdById,
  });
}

export async function startExperiment(
  experimentId: string,
): Promise<CampaignExperiment> {
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "draft") throw new Error("Only draft experiments can be started");
  const updated = await updateCampaignExperiment(experimentId, {
    status: "running" satisfies CampaignExperimentStatus,
    startDate: exp.startDate ?? new Date().toISOString().slice(0, 10),
  });
  if (!updated) throw new Error("Failed to start experiment");
  return updated;
}

export async function recordObservation(
  experimentId: string,
  variantId: string,
  delta: { impressions?: number; conversions?: number },
): Promise<CampaignExperiment> {
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) throw new Error("Experiment not found");
  if (exp.status !== "running" && exp.status !== "draft") {
    throw new Error("Observations only accepted for draft/running experiments");
  }
  const variants = exp.variants.map((v) => {
    if (v.id !== variantId) return v;
    return {
      ...v,
      impressions: Math.max(0, v.impressions + (delta.impressions ?? 0)),
      conversions: Math.max(0, v.conversions + (delta.conversions ?? 0)),
    };
  });
  if (!variants.some((v) => v.id === variantId)) {
    throw new Error("Variant not found on experiment");
  }
  const updated = await updateCampaignExperiment(experimentId, { variants });
  if (!updated) throw new Error("Failed to record observation");
  return updated;
}

/**
 * Declare a winner only when both arms meet minSampleSize AND
 * two-proportion confidence ≥ confidenceThreshold.
 */
export async function evaluateWinner(
  experimentId: string,
  opts?: { persist?: boolean },
): Promise<EvaluateWinnerResult> {
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) {
    return {
      declared: false,
      reason: "missing_variants",
      detail: "Experiment not found",
      confidence: 0,
      controlRate: 0,
      testRate: 0,
      sampleControl: 0,
      sampleTest: 0,
    };
  }
  if (exp.status !== "running" && exp.status !== "completed") {
    return {
      declared: false,
      reason: "not_running",
      detail: `Status is ${exp.status} — start the experiment before evaluating`,
      confidence: 0,
      controlRate: 0,
      testRate: 0,
      sampleControl: 0,
      sampleTest: 0,
    };
  }

  const control = exp.variants.find((v) => v.id === exp.controlVariantId);
  const test = exp.variants.find((v) => v.id === exp.testVariantId);
  if (!control || !test) {
    return {
      declared: false,
      reason: "missing_variants",
      detail: "Control or test variant missing",
      confidence: 0,
      controlRate: 0,
      testRate: 0,
      sampleControl: 0,
      sampleTest: 0,
    };
  }

  const sampleControl = control.impressions;
  const sampleTest = test.impressions;
  const controlRate = conversionRate(control);
  const testRate = conversionRate(test);
  const confidence = twoProportionConfidence(
    control.impressions,
    control.conversions,
    test.impressions,
    test.conversions,
  );

  if (sampleControl < exp.minSampleSize || sampleTest < exp.minSampleSize) {
    return {
      declared: false,
      reason: "sample_size",
      detail: `Need ≥${exp.minSampleSize} impressions per arm (control=${sampleControl}, test=${sampleTest})`,
      confidence,
      controlRate,
      testRate,
      sampleControl,
      sampleTest,
    };
  }

  if (confidence < exp.confidenceThreshold) {
    return {
      declared: false,
      reason: "confidence",
      detail: `Confidence ${(confidence * 100).toFixed(1)}% < threshold ${(exp.confidenceThreshold * 100).toFixed(0)}%`,
      confidence,
      controlRate,
      testRate,
      sampleControl,
      sampleTest,
    };
  }

  const winner = testRate >= controlRate ? test : control;
  let experiment = exp;
  if (opts?.persist !== false && exp.status === "running") {
    experiment =
      (await updateCampaignExperiment(exp.id, {
        winningVariation: winner.id,
        status: "completed",
      })) ?? exp;
  }

  return {
    declared: true,
    winnerVariantId: winner.id,
    winnerLabel: winner.label,
    confidence,
    controlRate,
    testRate,
    sampleControl,
    sampleTest,
    experiment,
  };
}

/** Pure evaluate against an in-memory experiment (self-tests / previews). */
export function evaluateWinnerSync(exp: CampaignExperiment): EvaluateWinnerResult {
  const control = exp.variants.find((v) => v.id === exp.controlVariantId);
  const test = exp.variants.find((v) => v.id === exp.testVariantId);
  if (!control || !test) {
    return {
      declared: false,
      reason: "missing_variants",
      detail: "Control or test variant missing",
      confidence: 0,
      controlRate: 0,
      testRate: 0,
      sampleControl: 0,
      sampleTest: 0,
    };
  }
  const sampleControl = control.impressions;
  const sampleTest = test.impressions;
  const controlRate = conversionRate(control);
  const testRate = conversionRate(test);
  const confidence = twoProportionConfidence(
    control.impressions,
    control.conversions,
    test.impressions,
    test.conversions,
  );
  if (sampleControl < exp.minSampleSize || sampleTest < exp.minSampleSize) {
    return {
      declared: false,
      reason: "sample_size",
      detail: `Need ≥${exp.minSampleSize} impressions per arm (control=${sampleControl}, test=${sampleTest})`,
      confidence,
      controlRate,
      testRate,
      sampleControl,
      sampleTest,
    };
  }
  if (confidence < exp.confidenceThreshold) {
    return {
      declared: false,
      reason: "confidence",
      detail: `Confidence ${(confidence * 100).toFixed(1)}% < threshold ${(exp.confidenceThreshold * 100).toFixed(0)}%`,
      confidence,
      controlRate,
      testRate,
      sampleControl,
      sampleTest,
    };
  }
  const winner = testRate >= controlRate ? test : control;
  return {
    declared: true,
    winnerVariantId: winner.id,
    winnerLabel: winner.label,
    confidence,
    controlRate,
    testRate,
    sampleControl,
    sampleTest,
    experiment: { ...exp, winningVariation: winner.id, status: "completed" },
  };
}
