"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getAiCampaignRecommendation,
  getCampaign,
  getCompany,
} from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import {
  optimiseCampaign,
  planCampaignFromInstruction,
  recordRecommendationDecision,
  type RecommendationDecision,
} from "@/lib/ai-campaign-orchestrator";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

/**
 * Admin NL plan via AI campaign layer — creates a draft campaign + structured
 * recommendation only. Never approves, schedules, publishes, or spends.
 */
export async function planCampaignFromInstructionAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const instruction = text(formData, "goal") || text(formData, "instruction");
  if (!instruction) throw new Error("Goal / instruction is required");

  const durationDays = text(formData, "durationDays") === "90" ? 90 : 30;
  const startDate =
    text(formData, "startDate") ||
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const channels = formData.getAll("channels").map(String).filter(Boolean);

  const result = await planCampaignFromInstruction({
    user,
    company,
    instruction,
    startDate,
    audience: text(formData, "audience") || undefined,
    channels: channels.length ? channels : undefined,
    durationDays,
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${result.campaign.id}`);
  revalidatePath("/recommendations");
  revalidatePath("/ai-mos");
  redirect(`/campaigns/${result.campaign.id}`);
}

/**
 * Admin optimisation pass — emits structured recommendations only.
 * Never publishes or changes spend.
 */
export async function optimiseCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const user = await assertAdminCompanyAccess(campaign.companyId);
  const company = await getCompany(campaign.companyId);
  if (!company) throw new Error("Company not found");

  const result = await optimiseCampaign({
    user,
    company,
    campaignId: campaign.id,
  });

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath("/campaigns");
  revalidatePath("/recommendations");
  revalidatePath("/ai-mos");
  redirect(`/campaigns/${result.campaign.id}`);
}

/**
 * Accept or reject a pending AI campaign recommendation.
 * Accept → follow-up tasks only (no publish / budget / promotion).
 * Reject → decision recorded; no execution.
 */
export async function decideAiCampaignRecommendationAction(formData: FormData) {
  const recommendationId = text(formData, "recommendationId");
  const decisionRaw = text(formData, "decision");
  if (decisionRaw !== "accepted" && decisionRaw !== "rejected") {
    throw new Error("Decision must be accepted or rejected");
  }
  const decision = decisionRaw as RecommendationDecision;

  const existing = await getAiCampaignRecommendation(recommendationId);
  if (!existing) throw new Error("Recommendation not found");

  const user = await assertAdminCompanyAccess(existing.companyId);

  await recordRecommendationDecision({
    user,
    recommendationId,
    decision,
    overrideReason: text(formData, "overrideReason") || undefined,
  });

  revalidatePath("/campaigns");
  if (existing.campaignId) revalidatePath(`/campaigns/${existing.campaignId}`);
  revalidatePath("/recommendations");
  revalidatePath("/ai-mos");
  revalidatePath("/tasks");
  revalidatePath("/ads");
}
