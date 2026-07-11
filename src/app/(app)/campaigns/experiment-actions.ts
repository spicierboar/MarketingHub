"use server";

import { revalidatePath } from "next/cache";
import {
  getCampaign,
  getCampaignExperiment,
} from "@/lib/db";
import { assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  createExperiment,
  evaluateWinner,
  recordObservation,
  startExperiment,
} from "@/lib/campaign-experiments";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}

export async function createCampaignExperimentAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const user = await assertCompanyAccess(campaign.companyId);

  const experiment = await createExperiment({
    campaignId,
    hypothesis: text(formData, "hypothesis"),
    createdById: user.id,
    successMetric: text(formData, "successMetric") || "conversion_rate",
    minSampleSize: Math.max(1, Math.floor(num(formData, "minSampleSize", 100))),
    confidenceThreshold: Math.min(
      0.999,
      Math.max(0.5, num(formData, "confidenceThreshold", 0.95)),
    ),
    audienceSplit: Math.min(99, Math.max(1, num(formData, "audienceSplit", 50))),
  });

  await logAction(user, "campaign.experiment_created", {
    targetType: "campaign_experiment",
    targetId: experiment.id,
    companyId: campaign.companyId,
    detail: experiment.hypothesis.slice(0, 120),
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function startCampaignExperimentAction(formData: FormData) {
  const experimentId = text(formData, "experimentId");
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) throw new Error("Experiment not found");
  const user = await assertCompanyAccess(exp.companyId);
  await startExperiment(experimentId);
  await logAction(user, "campaign.experiment_started", {
    targetType: "campaign_experiment",
    targetId: experimentId,
    companyId: exp.companyId,
  });
  revalidatePath(`/campaigns/${exp.campaignId}`);
}

export async function recordExperimentObservationAction(formData: FormData) {
  const experimentId = text(formData, "experimentId");
  const variantId = text(formData, "variantId");
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) throw new Error("Experiment not found");
  const user = await assertCompanyAccess(exp.companyId);
  await recordObservation(experimentId, variantId, {
    impressions: Math.max(0, Math.floor(num(formData, "impressions", 0))),
    conversions: Math.max(0, Math.floor(num(formData, "conversions", 0))),
  });
  await logAction(user, "campaign.experiment_observation", {
    targetType: "campaign_experiment",
    targetId: experimentId,
    companyId: exp.companyId,
    detail: `${variantId} +imp/${text(formData, "impressions")} +conv/${text(formData, "conversions")}`,
  });
  revalidatePath(`/campaigns/${exp.campaignId}`);
}

export async function evaluateCampaignExperimentAction(formData: FormData): Promise<{
  declared: boolean;
  message: string;
}> {
  const experimentId = text(formData, "experimentId");
  const exp = await getCampaignExperiment(experimentId);
  if (!exp) return { declared: false, message: "Experiment not found" };
  const user = await assertCompanyAccess(exp.companyId);

  const result = await evaluateWinner(experimentId, { persist: true });
  await logAction(user, "campaign.experiment_evaluated", {
    targetType: "campaign_experiment",
    targetId: experimentId,
    companyId: exp.companyId,
    detail: result.declared
      ? `winner=${result.winnerVariantId} conf=${(result.confidence * 100).toFixed(1)}%`
      : `blocked:${result.reason} — ${result.detail}`,
  });
  revalidatePath(`/campaigns/${exp.campaignId}`);

  if (result.declared) {
    return {
      declared: true,
      message: `Winner: ${result.winnerLabel} (${(result.confidence * 100).toFixed(1)}% confidence)`,
    };
  }
  return { declared: false, message: `Blocked (${result.reason}): ${result.detail}` };
}
