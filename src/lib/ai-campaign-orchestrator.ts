// AI campaign orchestration — controlled tools/APIs only.
// Follows the brief 10-step flow for every operation. Never auto-publishes,
// never auto-changes budget, never activates promotions. Critique gate untouched.

import { assertAiBudget } from "@/lib/ai/budget";
import { checkCompliance, auditClaims } from "@/lib/ai/compliance";
import { recordAiUsage } from "@/lib/ai/metering";
import { getActivePrompt } from "@/lib/ai/prompt-registry";
import {
  validateAiRecommendationPayload,
  type ValidateAiRecommendationResult,
} from "@/lib/ai/recommendation-schema";
import { resolveApprovalRequired } from "@/lib/approval-policies";
import { logAction } from "@/lib/audit";
import { isAdmin, canAccessCompany } from "@/lib/auth/rbac";
import {
  detectCalendarGap,
  detectPublishingCadence,
} from "@/lib/calendar-intelligence";
import {
  executeCampaignBuilder,
  type ExecuteCampaignBuilderResult,
} from "@/lib/campaign-builder";
import {
  createAiCampaignRecommendation,
  createAiOrchestrationRun,
  createTask,
  getAiCampaignRecommendation,
  getCampaign,
  getCompany,
  getTenant,
  listAiCampaignRecommendations,
  listCampaignItems,
  listCampaignPerformanceSnapshots,
  listContent,
  listScheduledPosts,
  updateAiCampaignRecommendation,
  updateAiOrchestrationRun,
  updateCampaign,
} from "@/lib/db";
import { buildCompanyHealthScore } from "@/lib/health-scores";
import { generateRankedForCompany } from "@/lib/recommendations";
import { sanitizeAiUserInput } from "@/lib/security-slice";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import { now } from "@/lib/utils";
import type {
  ActingUser,
  AiCampaignRecommendation,
  AiOrchestrationRun,
  AiRecommendationPayload,
  AiRecommendedAction,
  Campaign,
  CampaignType,
  Company,
  ComplianceResult,
} from "@/lib/types";

// ---- public types ------------------------------------------------------------

export interface StructuredCampaignDraft {
  userFacts: string[];
  systemData: string[];
  assumptions: string[];
  recommendations: string[];
  risks: string[];
  missingInfo: string[];
  requiredApprovals: string[];
  objective?: string;
  campaignType?: CampaignType | string;
  channels?: string[];
  durationDays?: number;
  budgetAmount?: number;
  performanceTargets?: string[];
}

export interface PlanCampaignFromInstructionInput {
  user: ActingUser;
  company: Company;
  instruction: string;
  startDate?: string;
  audience?: string;
  channels?: string[];
  durationDays?: 30 | 90;
  budgetAmount?: number;
  campaignType?: CampaignType | string;
}

export interface PlanCampaignResult {
  campaign: Campaign;
  builder: ExecuteCampaignBuilderResult;
  draft: StructuredCampaignDraft;
  run: AiOrchestrationRun;
  recommendation: AiCampaignRecommendation;
  payload: AiRecommendationPayload;
  confidenceScore: number;
  riskScore: number;
  approvalRequired: boolean;
  /** Always false — plan never auto-approves or publishes. */
  executed: false;
}

export interface OptimiseCampaignInput {
  user: ActingUser;
  company: Company;
  campaignId: string;
}

export interface OptimiseCampaignResult {
  campaign: Campaign;
  run: AiOrchestrationRun;
  recommendation: AiCampaignRecommendation;
  payload: AiRecommendationPayload;
  confidenceScore: number;
  riskScore: number;
  approvalRequired: boolean;
  /** Always false — optimise emits recommendations only. */
  executed: false;
}

export type RecommendationDecision = "accepted" | "rejected";

export interface RecordRecommendationDecisionInput {
  user: ActingUser;
  recommendationId: string;
  decision: RecommendationDecision;
  overrideReason?: string;
}

export interface RecordRecommendationDecisionResult {
  recommendation: AiCampaignRecommendation;
  tasksCreated: string[];
  /** Accept still does not publish / change budget / activate promotions. */
  executedActions: string[];
  expectedVsActual: {
    expected: string;
    actual: string;
  };
}

// ---- permission gate (caller passes ActingUser — no session redirect) --------

async function assertOrchestratorAccess(
  user: ActingUser,
  company: Company,
): Promise<void> {
  if (company.tenantId !== user.tenantId) {
    throw new Error("Forbidden: company is outside the active tenant");
  }
  if (!isAdmin(user)) {
    throw new Error("Only admins can run AI campaign orchestration");
  }
  if (!(await canAccessCompany(user, company.id))) {
    throw new Error("Forbidden: no access to this company");
  }
}

// ---- scoring helpers ---------------------------------------------------------

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function riskFromCompliance(compliance: ComplianceResult, flagCount: number): number {
  const base =
    compliance.riskLevel === "critical"
      ? 0.95
      : compliance.riskLevel === "high"
        ? 0.8
        : compliance.riskLevel === "medium"
          ? 0.55
          : compliance.riskLevel === "low"
            ? 0.25
            : 0.15;
  return clamp01(base + Math.min(0.2, flagCount * 0.05));
}

function confidenceFromSignals(args: {
  hasBuilder: boolean;
  systemSignalCount: number;
  missingCount: number;
  complianceBlocked: boolean;
}): number {
  let c = 0.45;
  if (args.hasBuilder) c += 0.2;
  c += Math.min(0.2, args.systemSignalCount * 0.04);
  c -= Math.min(0.25, args.missingCount * 0.05);
  if (args.complianceBlocked) c -= 0.15;
  return clamp01(c);
}

// ---- instruction parsing (deterministic — no unrestricted model writes) ------

const BUDGET_RE = /\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?/i;
const WEEKS_RE = /(\d+)\s*-?\s*week/i;
const DAYS_RE = /(\d+)\s*-?\s*day/i;

function inferBudget(instruction: string): number | undefined {
  const m = instruction.match(BUDGET_RE);
  if (!m) return undefined;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "k") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  return n;
}

function inferDurationDays(instruction: string): 30 | 90 {
  const weeks = instruction.match(WEEKS_RE);
  if (weeks) {
    const w = Number(weeks[1]);
    if (w >= 8) return 90;
    return 30;
  }
  const days = instruction.match(DAYS_RE);
  if (days) {
    const d = Number(days[1]);
    if (d >= 60) return 90;
    return 30;
  }
  return 30;
}

function inferCampaignType(
  instruction: string,
  explicit?: CampaignType | string,
): CampaignType | string {
  if (explicit) return explicit;
  const t = instruction.toLowerCase();
  if (/\bcrisis\b/.test(t)) return "crisis_communication";
  if (/\blaunch\b|\bnew product\b|\bnew service\b/.test(t)) return "product_launch";
  if (/\blead\b|\benquir/.test(t)) return "lead_generation";
  if (/\bretarget/.test(t)) return "retargeting";
  if (/\bretention\b|\bloyalty\b/.test(t)) return "customer_retention";
  if (/\bevent\b/.test(t)) return "event_promotion";
  if (/\bseasonal\b|\bchristmas\b|\beaster\b/.test(t)) return "seasonal";
  if (/\bawareness\b|\bbrand\b/.test(t)) return "brand_awareness";
  if (/\btraffic\b|\bwebsite\b/.test(t)) return "website_traffic";
  if (/\bengagement\b/.test(t)) return "engagement";
  return "brand_awareness";
}

function todayIsoDate(): string {
  return now().slice(0, 10);
}

// ---- payload builders --------------------------------------------------------

function buildPayload(args: {
  recommendationType: string;
  campaignId?: string;
  summary: string;
  actions: AiRecommendedAction[];
  dataSources: string[];
  assumptions: string[];
  complianceFlags: string[];
  modelVersion: string;
  promptVersion: string;
}): AiRecommendationPayload {
  const raw = {
    recommendation_type: args.recommendationType,
    campaign_id: args.campaignId,
    summary: args.summary,
    recommended_actions: args.actions,
    data_sources: args.dataSources,
    assumptions: args.assumptions,
    compliance_flags: args.complianceFlags,
    generated_at: now(),
    model_version: args.modelVersion,
    prompt_version: args.promptVersion,
  };
  const validated: ValidateAiRecommendationResult = validateAiRecommendationPayload(raw);
  if (!validated.ok) {
    throw new Error(
      `Invalid AI recommendation payload: ${validated.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  return validated.payload;
}

function aggregateScores(actions: AiRecommendedAction[]): {
  confidenceScore: number;
  riskScore: number;
} {
  if (actions.length === 0) return { confidenceScore: 0.4, riskScore: 0.5 };
  const conf =
    actions.reduce((s, a) => s + (a.confidence_score ?? 0.5), 0) / actions.length;
  const risk =
    actions.reduce((s, a) => s + (a.risk_score ?? 0.5), 0) / actions.length;
  return { confidenceScore: clamp01(conf), riskScore: clamp01(risk) };
}

// ---- 1. planCampaignFromInstruction -----------------------------------------

export async function planCampaignFromInstruction(
  input: PlanCampaignFromInstructionInput,
): Promise<PlanCampaignResult> {
  const { user, company } = input;

  // 1. Validate permissions
  await assertOrchestratorAccess(user, company);
  await assertAiBudget(company.tenantId);

  // 2. Retrieve minimum data + sanitise instruction
  const sanitized = sanitizeAiUserInput(input.instruction);
  const instruction = sanitized.text.trim();
  if (!instruction) throw new Error("Instruction is required");

  const prompt = await getActivePrompt("campaign_plan", { tenantId: company.tenantId });
  const budgetAmount = input.budgetAmount ?? inferBudget(instruction);
  const durationDays = input.durationDays ?? inferDurationDays(instruction);
  const campaignType = inferCampaignType(instruction, input.campaignType);
  const startDate = input.startDate ?? todayIsoDate();
  const channels = input.channels?.length
    ? input.channels
    : ["Facebook", "Instagram", "Google Business Profile"];

  const userFacts: string[] = [
    `Instruction: ${instruction.slice(0, 500)}`,
    ...(input.audience ? [`Audience (user): ${input.audience}`] : []),
    ...(budgetAmount != null ? [`Budget (user/inferred): $${budgetAmount}`] : []),
    `Duration: ${durationDays} days`,
    `Start date: ${startDate}`,
  ];

  const tenant = await getTenant(company.tenantId);
  const timezone = tenant?.timezone || "Australia/Sydney";

  const systemData: string[] = [
    `Company: ${company.name}`,
    `Industry: ${company.profile.industry || "unspecified"}`,
    `Target customers (profile): ${company.profile.targetCustomers || "unspecified"}`,
    `Services: ${(company.profile.services ?? []).slice(0, 8).join(", ") || "none listed"}`,
    `Timezone: ${timezone}`,
  ];

  // 3. Apply brand/legal rules
  const compliance = await checkCompliance(instruction, company);
  const claims = await auditClaims(instruction, company);
  const unsupported = claims.filter((c) => c.status === "unsupported");
  const complianceFlags = [
    ...compliance.issues.map((i) => `${i.severity}: ${i.message}`),
    ...unsupported.map((c) => `unsupported_claim: ${c.claim}`),
  ];

  // 4. Generate structured recommendation via existing campaign builder
  const builder = await executeCampaignBuilder({
    input: {
      company,
      goal: instruction,
      audience: input.audience,
      channels,
      durationDays,
      startDate,
      offer: null,
    },
    userId: user.id,
    audience: input.audience,
    durationDays,
    channels,
    offer: null,
  });

  const assumptions: string[] = [
    `Campaign type assumed: ${campaignType}`,
    ...(budgetAmount == null
      ? ["Budget not specified — allocation recommendations are illustrative only."]
      : []),
    "Content items spawned as ai_draft only — not scheduled or published.",
    ...builder.result.riskWarnings.map((w) => `Builder warning treated as assumption: ${w}`),
  ];

  const missingInfo: string[] = [];
  if (budgetAmount == null) missingInfo.push("Campaign budget");
  if (!input.audience && !company.profile.targetCustomers) {
    missingInfo.push("Target audience");
  }
  if (!(company.profile.services ?? []).length) missingInfo.push("Service catalogue detail");

  const recommendations: string[] = [
    `Objective: ${builder.result.objective}`,
    `Channel plan: ${builder.result.channelPlan}`,
    ...builder.result.kpis.map((k) => `KPI: ${k}`),
    `Spawn ${builder.spawnedContentIds.length} governed draft content item(s) for review.`,
  ];

  const riskScore = riskFromCompliance(compliance, complianceFlags.length);
  const confidenceScore = confidenceFromSignals({
    hasBuilder: true,
    systemSignalCount: systemData.length,
    missingCount: missingInfo.length,
    complianceBlocked: !compliance.canProceed,
  });

  // 7. Determine if human approval required
  const approval = await resolveApprovalRequired({
    tenantId: company.tenantId,
    entityType: campaignType === "crisis_communication" ? "crisis" : "campaign",
    campaignType,
    budget: budgetAmount,
    riskScore,
  });

  const draft: StructuredCampaignDraft = {
    userFacts,
    systemData,
    assumptions,
    recommendations,
    risks: [...builder.result.riskWarnings, ...complianceFlags],
    missingInfo,
    requiredApprovals: approval.approvalRequired
      ? [`${approval.approvalLevel}: ${approval.reason}`]
      : [],
    objective: builder.result.objective,
    campaignType,
    channels,
    durationDays,
    budgetAmount,
    performanceTargets: builder.result.kpis,
  };

  const actions: AiRecommendedAction[] = [
    {
      action_type: "create_campaign_draft",
      entity_id: builder.campaign.id,
      current_value: "none",
      proposed_value: `draft campaign "${builder.campaign.name}"`,
      reason: "Natural-language instruction converted via campaign builder.",
      expected_impact: "Structured draft ready for human review and approval.",
      confidence_score: confidenceScore,
      risk_score: riskScore,
      approval_required: true,
    },
    {
      action_type: "spawn_governed_content_drafts",
      entity_id: builder.campaign.id,
      proposed_value: `${builder.spawnedContentIds.length} ai_draft items`,
      reason: "Calendar plan items need copy drafts before any schedule.",
      expected_impact: "Editors can review platform variants without live publish.",
      confidence_score: confidenceScore,
      risk_score: clamp01(riskScore * 0.9),
      approval_required: true,
    },
  ];
  if (budgetAmount != null) {
    actions.push({
      action_type: "propose_budget_allocation",
      entity_id: builder.campaign.id,
      proposed_value: String(budgetAmount),
      reason: "Budget mentioned in instruction — proposal only, not applied to spend.",
      expected_impact: "Human can confirm allocation before any paid activation.",
      confidence_score: clamp01(confidenceScore - 0.1),
      risk_score: clamp01(Math.max(riskScore, 0.6)),
      approval_required: true,
    });
  }

  const payload = buildPayload({
    recommendationType: "campaign_plan",
    campaignId: builder.campaign.id,
    summary: `Draft campaign plan from instruction: ${builder.result.objective}`,
    actions,
    dataSources: [
      "company.profile",
      "campaign-builder",
      "compliance",
      `prompt:${prompt.promptKey}@v${prompt.version}`,
    ],
    assumptions,
    complianceFlags,
    modelVersion: builder.result.model || prompt.modelName || "template",
    promptVersion: `${prompt.promptKey}@${prompt.version}`,
  });

  // Persist layer meta on campaign (still draft status)
  const campaign =
    (await updateCampaign(builder.campaign.id, {
      campaignType,
      description: instruction.slice(0, 2000),
      budgetAmount,
      currency: "AUD",
      timezone,
      layerMeta: {
        assumptions,
        risks: draft.risks,
        missingInfo,
        performanceTargets: Object.fromEntries(
          (builder.result.kpis ?? []).map((k, i) => [`kpi_${i + 1}`, k]),
        ),
        userFacts,
        systemData,
        structuredDraft: draft,
      },
      status: "draft",
    })) ?? builder.campaign;

  // 5–6. Store orchestration run + recommendation with scores
  const run = await createAiOrchestrationRun({
    tenantId: company.tenantId,
    companyId: company.id,
    campaignId: campaign.id,
    operation: "plan_campaign",
    inputSummary: instruction.slice(0, 240),
    structuredOutput: {
      draft,
      payload,
      builderModel: builder.result.model,
    },
    modelProvider: prompt.modelProvider,
    modelName: builder.result.model || prompt.modelName,
    promptVersionId: prompt.id ?? null,
    confidenceScore,
    riskScore,
    approvalRequired: true,
    status: "awaiting_approval",
    createdById: user.id,
    correlationId: `plan:${campaign.id}`,
  });

  const recommendation = await createAiCampaignRecommendation({
    tenantId: company.tenantId,
    companyId: company.id,
    campaignId: campaign.id,
    orchestrationRunId: run.id,
    recommendationType: payload.recommendation_type,
    relatedEntityType: "campaign",
    relatedEntityId: campaign.id,
    summary: payload.summary,
    payload,
    confidenceScore,
    riskScore,
    expectedOutcome: "Campaign remains draft until a human approves; no publish or spend.",
    modelProvider: prompt.modelProvider,
    modelName: builder.result.model || prompt.modelName,
    modelVersion: payload.model_version,
    promptVersion: payload.prompt_version,
    humanDecision: "pending",
    humanDecisionAt: null,
  });

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "ai_campaign_plan",
    model: builder.result.model || prompt.modelName || "template",
    promptSummary: `planCampaign: ${instruction.slice(0, 80)}`,
    sourcesUsed: payload.data_sources,
    outputChars: JSON.stringify(payload).length,
  });

  // 8. Execute ONLY when authorised — NEVER for plan (draft only)
  // 9. Audit
  await logAction(user, "ai_campaign.plan_proposed", {
    companyId: company.id,
    targetType: "campaign",
    targetId: campaign.id,
    detail: JSON.stringify({
      recommendationId: recommendation.id,
      runId: run.id,
      approvalRequired: true,
      confidenceScore,
      riskScore,
      status: campaign.status,
    }),
  });

  // 10. Compare expected vs actual (baseline until human decision)
  await updateAiCampaignRecommendation(recommendation.id, {
    actualOutcome:
      "Draft campaign + governed content drafts created; not approved, not scheduled, not published.",
  });

  return {
    campaign,
    builder: { ...builder, campaign },
    draft,
    run,
    recommendation,
    payload,
    confidenceScore,
    riskScore,
    approvalRequired: true,
    executed: false,
  };
}

// ---- 2. optimiseCampaign -----------------------------------------------------

export async function optimiseCampaign(
  input: OptimiseCampaignInput,
): Promise<OptimiseCampaignResult> {
  const { user, company, campaignId } = input;

  // 1. Permissions
  await assertOrchestratorAccess(user, company);
  await assertAiBudget(company.tenantId);

  // 2. Minimum data
  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.companyId !== company.id) {
    throw new Error("Campaign not found for this company");
  }

  const prompt = await getActivePrompt("optimise", { tenantId: company.tenantId });
  const tenantId = company.tenantId;
  const [items, content, snapshots, health, ranked, posts, tenant] = await Promise.all([
    listCampaignItems(campaignId),
    listContent(tenantId),
    listCampaignPerformanceSnapshots(campaignId),
    buildCompanyHealthScore(tenantId, company),
    generateRankedForCompany(company),
    listScheduledPosts(tenantId),
    getTenant(tenantId),
  ]);

  const today = resolveQueueClock(tenant).today;
  const calendarGap = detectCalendarGap(posts, company.id, today);
  const cadence = detectPublishingCadence(posts, company.id, today);

  const campaignContent = content.filter(
    (c) => c.companyId === company.id && c.campaignId === campaignId,
  );
  const drafted = items.filter((i) => i.status === "drafted" || i.status === "planned");
  const publishedish = items.filter(
    (i) => i.status === "scheduled" || i.status === "published",
  );

  const systemSignals: string[] = [
    `Health score: ${health.score}/100`,
    `Campaign status: ${campaign.status}`,
    `Items planned/drafted: ${drafted.length}; scheduled/published: ${publishedish.length}`,
    `Performance snapshots: ${snapshots.length} (${snapshots[0]?.dataSource ?? "none"})`,
    calendarGap
      ? `Calendar gap: ${calendarGap.gapDays} days`
      : "Calendar gap: none detected",
    cadence
      ? `Publishing cadence thin: ${cadence.publishedCount}/${cadence.minExpected} in ${cadence.lookbackDays}d`
      : "Publishing cadence: on track",
    ...ranked.slice(0, 3).map((r) => `Rec signal: ${r.title}`),
  ];

  const underperforming =
    health.score < 60 ||
    (calendarGap != null && calendarGap.gapDays >= 5) ||
    cadence != null ||
    (publishedish.length === 0 && campaign.status === "approved");

  // 3. Brand/legal on campaign text
  const textForRules = [campaign.objective, campaign.keyMessage, campaign.description]
    .filter(Boolean)
    .join("\n");
  const compliance: ComplianceResult = textForRules
    ? await checkCompliance(textForRules, company)
    : {
        canProceed: true,
        riskLevel: "low",
        issues: [],
        requiresEvidence: false,
        checkedAt: now(),
      };
  const complianceFlags = compliance.issues.map((i) => `${i.severity}: ${i.message}`);

  // 4. Structured recommendations only
  const actions: AiRecommendedAction[] = [];
  const assumptions: string[] = [
    "Live analytics flags are OFF — using health scores, calendar signals, and simulated snapshots.",
    "No budget, publish, or promotion mutations will be executed by this run.",
  ];

  if (underperforming) {
    actions.push({
      action_type: "revise_underperforming_content",
      entity_id: campaign.id,
      current_value: `health=${health.score}`,
      proposed_value: "Refresh top 2 drafts with stronger CTA and brand-safe claims",
      reason: "Health / cadence / gap signals indicate underperformance risk.",
      expected_impact: "Improve engagement and approval throughput without live spend changes.",
      confidence_score: 0.62,
      risk_score: 0.35,
      approval_required: true,
    });
  }

  if (calendarGap && calendarGap.gapDays >= 5) {
    actions.push({
      action_type: "reschedule_content",
      entity_id: campaign.id,
      current_value: `gap_days=${calendarGap.gapDays}`,
      proposed_value: "Fill gap with 2–3 draft posts in optimal windows",
      reason: "Calendar intelligence detected a publishing gap.",
      expected_impact: "Restore cadence; still requires schedule + critique gate.",
      confidence_score: 0.7,
      risk_score: 0.3,
      approval_required: true,
    });
  }

  if (campaign.budgetAmount && campaign.budgetAmount > 0) {
    actions.push({
      action_type: "propose_budget_reallocation",
      entity_id: campaign.id,
      current_value: String(campaign.budgetAmount),
      proposed_value: "Shift 20% toward best-performing channel (proposal only)",
      reason: "Budget exists on campaign — reallocation is recommend-only.",
      expected_impact: "Human can approve a budget change separately; AI will not apply it.",
      confidence_score: 0.45,
      risk_score: 0.75,
      approval_required: true,
    });
  }

  if (actions.length === 0) {
    actions.push({
      action_type: "monitor_continue",
      entity_id: campaign.id,
      proposed_value: "No material change",
      reason: "No strong underperformance signals; continue monitoring.",
      expected_impact: "Maintain current plan; re-check after next performance snapshot.",
      confidence_score: 0.55,
      risk_score: 0.2,
      approval_required: false,
    });
  }

  const { confidenceScore, riskScore: actionRisk } = aggregateScores(actions);
  const riskScore = clamp01(
    Math.max(actionRisk, riskFromCompliance(compliance, complianceFlags.length)),
  );

  // 7. Approval policy
  const approval = await resolveApprovalRequired({
    tenantId: company.tenantId,
    entityType: "campaign",
    campaignType: campaign.campaignType,
    budget: campaign.budgetAmount,
    riskScore,
  });
  const approvalRequired =
    approval.approvalRequired ||
    actions.some((a) => a.approval_required !== false && a.action_type !== "monitor_continue");

  const payload = buildPayload({
    recommendationType: "campaign_optimisation",
    campaignId: campaign.id,
    summary: underperforming
      ? `Optimisation recommendations for underperforming campaign "${campaign.name}".`
      : `Monitoring recommendations for campaign "${campaign.name}".`,
    actions: actions.map((a) => ({
      ...a,
      approval_required: a.action_type === "monitor_continue" ? a.approval_required : true,
    })),
    dataSources: [
      "health-scores",
      "calendar-intelligence",
      "recommendations",
      "campaign_performance_snapshots",
      `prompt:${prompt.promptKey}@v${prompt.version}`,
      ...systemSignals.slice(0, 4),
    ],
    assumptions,
    complianceFlags,
    modelVersion: prompt.modelName || "rules",
    promptVersion: `${prompt.promptKey}@${prompt.version}`,
  });

  // 5–6. Store
  const run = await createAiOrchestrationRun({
    tenantId: company.tenantId,
    companyId: company.id,
    campaignId: campaign.id,
    operation: "optimise",
    inputSummary: `optimise ${campaign.name}`,
    structuredOutput: {
      systemSignals,
      contentCount: campaignContent.length,
      payload,
    },
    modelProvider: prompt.modelProvider,
    modelName: prompt.modelName,
    promptVersionId: prompt.id ?? null,
    confidenceScore,
    riskScore,
    approvalRequired,
    status: approvalRequired ? "awaiting_approval" : "proposed",
    createdById: user.id,
    correlationId: `optimise:${campaign.id}:${now()}`,
  });

  const recommendation = await createAiCampaignRecommendation({
    tenantId: company.tenantId,
    companyId: company.id,
    campaignId: campaign.id,
    orchestrationRunId: run.id,
    recommendationType: payload.recommendation_type,
    relatedEntityType: "campaign",
    relatedEntityId: campaign.id,
    summary: payload.summary,
    payload,
    confidenceScore,
    riskScore,
    expectedOutcome:
      "Human reviews recommendations; no publish, budget change, or promotion activation.",
    modelProvider: prompt.modelProvider,
    modelName: prompt.modelName,
    modelVersion: payload.model_version,
    promptVersion: payload.prompt_version,
    humanDecision: "pending",
    humanDecisionAt: null,
  });

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "ai_campaign_optimise",
    model: prompt.modelName || "rules",
    promptSummary: `optimiseCampaign: ${campaign.name}`.slice(0, 120),
    sourcesUsed: payload.data_sources.slice(0, 8),
    outputChars: JSON.stringify(payload).length,
  });

  // 8. Do not execute — 9. Audit
  await logAction(user, "ai_campaign.optimise_proposed", {
    companyId: company.id,
    targetType: "campaign",
    targetId: campaign.id,
    detail: JSON.stringify({
      recommendationId: recommendation.id,
      runId: run.id,
      actionCount: actions.length,
      approvalRequired,
      confidenceScore,
      riskScore,
    }),
  });

  // 10. Baseline actual
  await updateAiCampaignRecommendation(recommendation.id, {
    actualOutcome: "Recommendations stored; no automated execution.",
  });

  return {
    campaign,
    run,
    recommendation,
    payload,
    confidenceScore,
    riskScore,
    approvalRequired,
    executed: false,
  };
}

// ---- 3. recordRecommendationDecision ----------------------------------------

export async function recordRecommendationDecision(
  input: RecordRecommendationDecisionInput,
): Promise<RecordRecommendationDecisionResult> {
  const { user, recommendationId, decision, overrideReason } = input;

  const existing = await getAiCampaignRecommendation(recommendationId);
  if (!existing) throw new Error("Recommendation not found");

  const company = await getCompany(existing.companyId);
  if (!company) throw new Error("Company not found for recommendation");

  // 1. Permissions
  await assertOrchestratorAccess(user, company);

  if (existing.humanDecision && existing.humanDecision !== "pending") {
    throw new Error(`Recommendation already decided: ${existing.humanDecision}`);
  }

  const expected =
    existing.expectedOutcome ||
    "Human accepts or rejects; accept creates follow-up tasks only — never publish/spend.";

  const tasksCreated: string[] = [];
  const executedActions: string[] = [];

  // 8. Execute ONLY authorised follow-ups — never publish / budget / promotion
  if (decision === "accepted") {
    const payload = existing.payload as AiRecommendationPayload | Record<string, unknown>;
    const actions = Array.isArray((payload as AiRecommendationPayload).recommended_actions)
      ? (payload as AiRecommendationPayload).recommended_actions
      : [];

    for (const action of actions) {
      if (action.action_type === "monitor_continue") continue;
      if (
        /publish|activate_promotion|change_budget|increase_spend|go_live/i.test(
          action.action_type,
        )
      ) {
        executedActions.push(`blocked:${action.action_type}`);
        continue;
      }
      const task = await createTask({
        companyId: company.id,
        title: `AI: ${action.action_type}`,
        detail: [
          action.reason,
          action.proposed_value ? `Proposed: ${action.proposed_value}` : null,
          action.expected_impact ? `Expected: ${action.expected_impact}` : null,
          `From recommendation ${existing.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
        status: "open",
        sourceRecommendationId: existing.id,
        createdById: user.id,
      });
      tasksCreated.push(task.id);
      executedActions.push(`task_created:${task.id}`);
    }
  }

  const actual =
    decision === "rejected"
      ? "Recommendation rejected; no tasks created; no publish/budget/promotion changes."
      : `Accepted: created ${tasksCreated.length} follow-up task(s); blocked any publish/budget/promotion actions (${executedActions.filter((a) => a.startsWith("blocked:")).length} blocked).`;

  const recommendation =
    (await updateAiCampaignRecommendation(recommendationId, {
      humanDecision: decision === "accepted" ? "accepted" : "rejected",
      humanDecisionAt: now(),
      overrideReason: overrideReason || undefined,
      actionTaken:
        decision === "accepted"
          ? `tasks:${tasksCreated.join(",") || "none"}`
          : "none",
      actualOutcome: actual,
      feedbackScore: decision === "accepted" ? 1 : 0,
    })) ?? existing;

  if (existing.orchestrationRunId) {
    await updateAiOrchestrationRun(existing.orchestrationRunId, {
      status: decision === "accepted" ? "approved" : "rejected",
    });
  }

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "ai_campaign_decision",
    model: "human",
    promptSummary: `decision ${decision} on ${recommendationId}`.slice(0, 120),
    sourcesUsed: ["ai_campaign_recommendations"],
    outputChars: actual.length,
  });

  // 9. Audit
  await logAction(user, `ai_campaign.recommendation_${decision}`, {
    companyId: company.id,
    targetType: "ai_campaign_recommendation",
    targetId: recommendationId,
    detail: JSON.stringify({
      decision,
      overrideReason: overrideReason || null,
      tasksCreated,
      executedActions,
      expected,
      actual,
    }),
  });

  // 10. Expected vs actual
  return {
    recommendation,
    tasksCreated,
    executedActions,
    expectedVsActual: { expected, actual },
  };
}

/** List pending AI campaign recommendations for a company (UI helper). */
export async function listPendingAiCampaignRecommendations(
  companyId: string,
  campaignId?: string,
): Promise<AiCampaignRecommendation[]> {
  const rows = await listAiCampaignRecommendations(companyId, campaignId);
  return rows.filter((r) => !r.humanDecision || r.humanDecision === "pending");
}
