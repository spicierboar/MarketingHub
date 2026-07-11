// Approval-gated ad spend / allocation changes.
// AI may propose; only an admin (or finance-capable admin) may apply after
// accepting a recommendation OR giving explicit dual confirmation.
// Does NOT auto-spend. Respects existing ADS_LIVE apply behaviour elsewhere.

import { logAction } from "@/lib/audit";
import { userHasPermission } from "@/lib/rbac-matrix";
import {
  createAiCampaignRecommendation,
  findConnectedAdAccount,
  getAdBudget,
  getAiCampaignRecommendation,
  updateAiCampaignRecommendation,
  upsertAdBudget,
} from "@/lib/db";
import { recommendAllocation } from "@/lib/ai/allocation";
import { AD_PLATFORMS } from "@/lib/types";
import type {
  ActingUser,
  AdBudget,
  AdCampaign,
  AdPlatform,
  AiCampaignRecommendation,
  AiRecommendationPayload,
  Company,
} from "@/lib/types";

/** Finance permission (manage_budgets) OR admin/owner via userHasPermission. */
export function canApproveSpendChange(user: ActingUser): boolean {
  return userHasPermission(user, "manage_budgets");
}

export function isSpendRecommendationAccepted(
  rec: AiCampaignRecommendation | undefined,
): boolean {
  return !!rec && rec.humanDecision === "accepted";
}

export function buildAllocationRecommendationPayload(input: {
  companyId: string;
  recommended: Partial<Record<AdPlatform, number>>;
  monthlyBudgetUsd: number;
  rationale: string[];
}): AiRecommendationPayload {
  const nowIso = new Date().toISOString();
  return {
    recommendation_type: "budget_allocation",
    summary: `Proposed budget split for $${input.monthlyBudgetUsd}/mo across connected ad platforms.`,
    recommended_actions: [
      {
        action_type: "propose_budget_allocation",
        entity_id: input.companyId,
        proposed_value: JSON.stringify(input.recommended),
        reason: input.rationale[0] ?? "AI allocation guidance",
        expected_impact: "Rebalance spend; no money moves until an admin applies.",
        confidence_score: 0.7,
        risk_score: 0.4,
        approval_required: true,
      },
    ],
    data_sources: ["paid-metrics", "ad-budget", "connected-accounts"],
    assumptions: [
      "ADS_LIVE remains off unless owner cutover",
      "AI cannot move budget without approval",
    ],
    compliance_flags: ["spend_change_requires_approval"],
    generated_at: nowIso,
    model_version: "rules",
    prompt_version: "allocation@1",
  };
}

export async function proposeAllocationSpendChange(input: {
  user: ActingUser;
  company: Company;
  budget: AdBudget;
  campaigns: AdCampaign[];
}): Promise<AiCampaignRecommendation> {
  if (!canApproveSpendChange(input.user)) {
    throw new Error("Only admins can propose spend allocation changes.");
  }
  const connected = new Set<AdPlatform>();
  for (const p of AD_PLATFORMS) {
    if (await findConnectedAdAccount(input.company.id, p.key)) connected.add(p.key);
  }
  const guidance = recommendAllocation({
    company: input.company,
    budget: input.budget,
    campaigns: input.campaigns,
    connectedPlatforms: connected,
  });
  if (!guidance.hasConnected) {
    throw new Error("Connect an ad account before proposing an allocation.");
  }
  const payload = buildAllocationRecommendationPayload({
    companyId: input.company.id,
    recommended: guidance.recommended,
    monthlyBudgetUsd: guidance.monthlyBudgetUsd,
    rationale: guidance.rationale,
  });
  const rec = await createAiCampaignRecommendation({
    tenantId: input.company.tenantId,
    companyId: input.company.id,
    recommendationType: "budget_allocation",
    relatedEntityType: "ad_budget",
    relatedEntityId: input.company.id,
    summary: payload.summary,
    payload,
    confidenceScore: 0.7,
    riskScore: 0.4,
    expectedOutcome: "Human accepts; applySpendChangeAction may then write allocation.",
    modelProvider: "rules",
    modelName: guidance.model,
    modelVersion: "rules",
    promptVersion: "allocation@1",
    humanDecision: "pending",
  });
  await logAction(input.user, "ad_budget.allocation_proposed", {
    targetType: "ai_campaign_recommendation",
    targetId: rec.id,
    companyId: input.company.id,
    detail: "AI cannot move budget without approval",
  });
  return rec;
}

export type ApplySpendChangeInput = {
  user: ActingUser;
  companyId: string;
  /** Accepted recommendation id — preferred path. */
  recommendationId?: string;
  /**
   * Explicit dual confirmation when applying without a prior accept
   * (manual override). Both flags must be true.
   */
  dualConfirm?: boolean;
  dualConfirmAck?: boolean;
  /** Optional override allocation; otherwise read from accepted recommendation. */
  allocation?: Partial<Record<AdPlatform, number>>;
};

/**
 * Apply a budget allocation only after recommendation accept OR dual confirm.
 * Admin-only. Audited. Does not flip ADS_LIVE or call live ad APIs.
 */
export async function applySpendChange(input: ApplySpendChangeInput): Promise<AdBudget> {
  if (!canApproveSpendChange(input.user)) {
    throw new Error("Only admins (or finance-capable admins) can apply spend changes.");
  }
  const budget = await getAdBudget(input.companyId);
  if (!budget) throw new Error("Set a monthly budget first.");

  let allocation = input.allocation;
  let via: "recommendation" | "dual_confirm";

  if (input.recommendationId) {
    const rec = await getAiCampaignRecommendation(input.recommendationId);
    if (!rec || rec.companyId !== input.companyId) {
      throw new Error("Spend-change recommendation not found for this company.");
    }
    if (!isSpendRecommendationAccepted(rec)) {
      throw new Error(
        "Spend change blocked: recommendation must be accepted before apply. AI cannot move budget without approval.",
      );
    }
    if (!allocation) {
      const payload = rec.payload as AiRecommendationPayload;
      const action = payload.recommended_actions?.find(
        (a) => a.action_type === "propose_budget_allocation",
      );
      if (action?.proposed_value) {
        try {
          allocation = JSON.parse(action.proposed_value) as Partial<Record<AdPlatform, number>>;
        } catch {
          throw new Error("Recommendation payload has invalid allocation JSON.");
        }
      }
    }
    if (!allocation || Object.keys(allocation).length === 0) {
      throw new Error("Recommendation has no allocation to apply.");
    }
    via = "recommendation";
    await updateAiCampaignRecommendation(rec.id, {
      actionTaken: "allocation_applied",
      actualOutcome: "Allocation written to ad_budget after human accept.",
    });
  } else if (input.dualConfirm === true && input.dualConfirmAck === true) {
    if (!allocation || Object.keys(allocation).length === 0) {
      throw new Error("Dual-confirm apply requires an explicit allocation.");
    }
    via = "dual_confirm";
  } else {
    throw new Error(
      "Spend change blocked: accept an AI recommendation first, or provide dual confirmation. AI cannot move budget without approval.",
    );
  }

  const updated = await upsertAdBudget({
    companyId: input.companyId,
    monthlyBudgetUsd: budget.monthlyBudgetUsd,
    allocation,
    feeModel: budget.feeModel,
    feePercent: budget.feePercent,
    feeFlatUsd: budget.feeFlatUsd,
    updatedById: input.user.id,
  });

  await logAction(input.user, "ad_budget.spend_change_applied", {
    targetType: "ad_budget",
    targetId: input.companyId,
    companyId: input.companyId,
    detail: `${via}: ${Object.entries(allocation)
      .map(([p, s]) => `${p} ${Math.round((s ?? 0) * 100)}%`)
      .join(", ")}`,
  });

  return updated;
}
