// Self-test helpers for AI campaign management layer (migration 0035).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  getCampaign,
  getCompany,
  listAiCampaignRecommendations,
  listScheduledPosts,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { validateAiRecommendationPayload } from "@/lib/ai/recommendation-schema";
import {
  optimiseCampaign,
  planCampaignFromInstruction,
  recordRecommendationDecision,
} from "@/lib/ai-campaign-orchestrator";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, AiRecommendationPayload, Company, User } from "@/lib/types";

function acting(user: User, tenantId: string, tenantRole: "owner" | "admin" | "member"): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole,
    role: TENANT_ROLE_TIER[tenantRole],
  };
}

function goodPayload(overrides: Partial<AiRecommendationPayload> = {}): AiRecommendationPayload {
  return {
    recommendation_type: "campaign_optimisation",
    campaign_id: "camp_test",
    summary: "Pause underperforming creative and refresh CTA.",
    recommended_actions: [
      {
        action_type: "revise_underperforming_content",
        proposed_value: "Refresh top draft",
        reason: "Low engagement signal",
        confidence_score: 0.7,
        risk_score: 0.3,
        approval_required: true,
      },
    ],
    data_sources: ["health-scores", "calendar-intelligence"],
    assumptions: ["Live analytics flags are OFF"],
    compliance_flags: [],
    generated_at: new Date().toISOString(),
    model_version: "rules",
    prompt_version: "optimise@1",
    ...overrides,
  };
}

export function checkRecommendationSchemaValidatesGood(): { ok: boolean; detail: string } {
  const result = validateAiRecommendationPayload(goodPayload());
  return {
    ok: result.ok === true,
    detail: result.ok ? "valid" : result.errors.map((e) => `${e.path}:${e.message}`).join("; "),
  };
}

export function checkRecommendationSchemaRejectsBad(): { ok: boolean; detail: string } {
  const result = validateAiRecommendationPayload({
    recommendation_type: "",
    summary: "",
    recommended_actions: "not-an-array",
    data_sources: [1],
    assumptions: "nope",
    compliance_flags: null,
    generated_at: "",
    model_version: "",
    prompt_version: "",
  });
  const ok = result.ok === false && result.errors.length >= 3;
  return {
    ok,
    detail: result.ok ? "unexpectedly valid" : `errors=${result.errors.length}`,
  };
}

async function provisionAdminCompany(): Promise<{
  tenantId: string;
  company: Company;
  user: ActingUser;
}> {
  const t = await createTenant({
    name: `AI Camp Layer ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `ai-camp-${Date.now()}@example.dev`,
    name: "AI Camp Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const company = await createCompany({
    tenantId: t.id,
    name: "AI Camp Co",
    createdBy: userRow.id,
  });
  await updateCompany(company.id, {
    status: "ai_ready",
    profile: {
      ...company.profile,
      industry: "restaurant",
      serviceAreas: ["Harbour"],
      services: ["Dinner", "Lunch"],
      callsToAction: ["Book a table"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "local diners",
    },
  });
  const refreshed = (await getCompany(company.id)) ?? company;
  return {
    tenantId: t.id,
    company: refreshed,
    user: acting(userRow, t.id, "owner"),
  };
}

export async function checkPlanFromInstructionCreatesDraftOnly(): Promise<{
  ok: boolean;
  detail: string;
}> {
  let tenantId: string | undefined;
  try {
    const { tenantId: tid, company, user } = await provisionAdminCompany();
    tenantId = tid;
    const result = await planCampaignFromInstruction({
      user,
      company,
      instruction: "I want more weekday lunch customers over 30 days",
      startDate: "2026-08-01",
      channels: ["Facebook", "Instagram"],
      durationDays: 30,
    });
    const campaign = await getCampaign(result.campaign.id);
    const scheduled = await listScheduledPosts(tid);
    const liveForCampaign = scheduled.filter(
      (p) =>
        p.companyId === company.id &&
        (p.status === "scheduled" || p.status === "published" || p.status === "publishing"),
    );
    const ok =
      !!campaign &&
      campaign.status === "draft" &&
      result.executed === false &&
      result.approvalRequired === true &&
      liveForCampaign.length === 0 &&
      !["approved", "pending_approval"].includes(campaign.status);
    return {
      ok,
      detail: `status=${campaign?.status} executed=${result.executed} livePosts=${liveForCampaign.length}`,
    };
  } finally {
    if (tenantId) {
      try {
        await purgeTenant(tenantId);
      } catch {
        /* isolation runner also purges */
      }
    }
  }
}

export async function checkOptimiseEmitsApprovalRequired(): Promise<{
  ok: boolean;
  detail: string;
}> {
  let tenantId: string | undefined;
  try {
    const { tenantId: tid, company, user } = await provisionAdminCompany();
    tenantId = tid;
    const planned = await planCampaignFromInstruction({
      user,
      company,
      instruction: "Drive direct bookings with a $2000 budget",
      startDate: "2026-08-01",
      durationDays: 30,
    });
    const result = await optimiseCampaign({
      user,
      company,
      campaignId: planned.campaign.id,
    });
    const payload = result.payload;
    const actionsNeedApproval = payload.recommended_actions.some(
      (a) => a.approval_required === true || a.action_type !== "monitor_continue",
    );
    const ok =
      result.executed === false &&
      result.approvalRequired === true &&
      result.recommendation.humanDecision === "pending" &&
      (result.run.approvalRequired === true || actionsNeedApproval);
    return {
      ok,
      detail: `approvalRequired=${result.approvalRequired} actions=${payload.recommended_actions.length} runApproval=${result.run.approvalRequired}`,
    };
  } finally {
    if (tenantId) {
      try {
        await purgeTenant(tenantId);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function checkDecideRejectDoesNotPublish(): Promise<{
  ok: boolean;
  detail: string;
}> {
  let tenantId: string | undefined;
  try {
    const { tenantId: tid, company, user } = await provisionAdminCompany();
    tenantId = tid;
    const planned = await planCampaignFromInstruction({
      user,
      company,
      instruction: "Get more Google reviews",
      startDate: "2026-08-01",
      durationDays: 30,
    });
    const pending = (
      await listAiCampaignRecommendations(company.id, planned.campaign.id)
    ).find((r) => !r.humanDecision || r.humanDecision === "pending");
    if (!pending) {
      return { ok: false, detail: "no pending recommendation after plan" };
    }

    const decided = await recordRecommendationDecision({
      user,
      recommendationId: pending.id,
      decision: "rejected",
      overrideReason: "self-test reject",
    });

    const campaign = await getCampaign(planned.campaign.id);
    const livePosts = (await listScheduledPosts(tid)).filter(
      (p) =>
        p.companyId === company.id &&
        (p.status === "scheduled" || p.status === "published" || p.status === "publishing"),
    );
    const audits = await listAudit(tid, [company.id]);
    const rejectLogged = audits.some(
      (a) =>
        a.action === "ai_campaign.recommendation_rejected" &&
        a.targetId === pending.id,
    );

    const ok =
      decided.recommendation.humanDecision === "rejected" &&
      decided.tasksCreated.length === 0 &&
      decided.executedActions.length === 0 &&
      campaign?.status === "draft" &&
      livePosts.length === 0 &&
      rejectLogged;

    return {
      ok,
      detail: `decision=${decided.recommendation.humanDecision} tasks=${decided.tasksCreated.length} live=${livePosts.length} audited=${rejectLogged}`,
    };
  } finally {
    if (tenantId) {
      try {
        await purgeTenant(tenantId);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Standalone suite (mirrors ai-mos / campaign-builder runners). */
export async function runAiCampaignLayerSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(
    name: string,
    fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string },
  ) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({
        name,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await expect("aiCampaignLayer.schemaValidatesGood", () =>
    checkRecommendationSchemaValidatesGood(),
  );
  await expect("aiCampaignLayer.schemaRejectsBad", () =>
    checkRecommendationSchemaRejectsBad(),
  );
  await expect("aiCampaignLayer.planCreatesDraftOnly", () =>
    checkPlanFromInstructionCreatesDraftOnly(),
  );
  await expect("aiCampaignLayer.optimiseApprovalRequired", () =>
    checkOptimiseEmitsApprovalRequired(),
  );
  await expect("aiCampaignLayer.decideRejectNoPublish", () =>
    checkDecideRejectDoesNotPublish(),
  );

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && !purgeFailed.length,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - start,
    checks,
  };
}
