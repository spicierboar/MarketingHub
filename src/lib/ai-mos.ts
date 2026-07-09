// V1 module 11 — AI Marketing Operating System (suggest-only slice).
//
// Monitors health scores, calendar gaps, publishing cadence, and recommendations
// → surfaces opportunity cards with diagnosis + suggested action. Converts to
// draft campaign/content via existing governance gates only — no external send
// or spend without approval. Full audit + ai_run trail.

import {
  createAiMosOpportunity,
  createCampaign,
  createCampaignItem,
  getCompany,
  getTenant,
  listAiMosOpportunities,
  listCompanies,
  listContent,
  listRecommendations,
  listScheduledPosts,
  updateAiMosOpportunity,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { recordAiUsage } from "@/lib/ai/metering";
import {
  buildCampaignFromGoal,
  spawnGovernedDraftForItem,
  spawnedContentNotScheduled,
  unpackKeyMessage,
} from "@/lib/ai/campaign-builder";
import {
  detectCalendarGap,
  detectPublishingCadence,
  type CalendarGapSignal,
  type PublishingCadenceSignal,
} from "@/lib/calendar-intelligence";
import {
  buildCompanyHealthScore,
  DEFAULT_ATTENTION_THRESHOLD,
  type CompanyHealthScore,
} from "@/lib/health-scores";
import { generateRankedForCompany } from "@/lib/recommendations";
import { sanitizeAiUserInput } from "@/lib/security-slice";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import type {
  AiMosEvidence,
  AiMosOpportunity,
  AiMosOpportunityKind,
  AiMosSuggestedAction,
  Company,
  User,
} from "@/lib/types";

// ---- types -------------------------------------------------------------------

export type AiMosOpportunityDraft = Omit<
  AiMosOpportunity,
  "id" | "tenantId" | "createdAt" | "status" | "createdById" | "aiRunId"
>;

export interface AiMosScanInput {
  company: Company;
  health: CompanyHealthScore;
  calendarGap: CalendarGapSignal | null;
  cadence: PublishingCadenceSignal | null;
  pendingApprovalCount: number;
  topRecommendationTitle?: string;
  topRecommendationScore?: number;
}

const KIND_PRIORITY: Record<AiMosOpportunityKind, number> = {
  health_decline: 92,
  calendar_gap: 88,
  publishing_cadence: 84,
  approval_bottleneck: 80,
  recommendation_signal: 76,
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

// ---- pure detection (testable) -----------------------------------------------

export function detectOpportunitiesFromSignals(
  input: AiMosScanInput,
): AiMosOpportunityDraft[] {
  const drafts: AiMosOpportunityDraft[] = [];
  const { company, health, calendarGap, cadence, pendingApprovalCount } = input;
  const area = company.profile.serviceAreas[0] || "local customers";
  const cta = company.profile.callsToAction[0] || "Get in touch";

  if (health.needsAttention) {
    const weakest = [...health.factors].sort((a, b) => a.score - b.score)[0];
    const evidence: AiMosEvidence[] = health.factors.map((f) => ({
      signal: f.id,
      observed: f.evidence,
      inferred:
        f.score < 50
          ? `${f.label} is dragging the composite score down.`
          : undefined,
    }));
    const action: AiMosSuggestedAction =
      weakest?.id === "publishing_cadence"
        ? {
            kind: "content_request",
            requestType: "social_post",
            topic: `Boost visibility for ${company.name}`,
            objective: `Address ${weakest.label.toLowerCase()} — ${weakest.evidence}`,
          }
        : {
            kind: "campaign",
            goal: `Improve marketing health for ${company.name} (currently ${health.score}/100)`,
            objective: weakest?.evidence ?? health.factors.map((f) => f.label).join(", "),
            audience: company.profile.targetCustomers || area,
          };

    drafts.push({
      companyId: company.id,
      kind: "health_decline",
      title: `Marketing health needs attention (${health.score}/100)`,
      diagnosis: `Composite health score is below the ${DEFAULT_ATTENTION_THRESHOLD} threshold. Weakest factor: ${weakest?.label ?? "overall mix"}.`,
      suggestedAction: action,
      evidence,
      priority: clamp(KIND_PRIORITY.health_decline - (100 - health.score) / 5),
    });
  }

  if (calendarGap && calendarGap.gapDays >= 5) {
    drafts.push({
      companyId: company.id,
      kind: "calendar_gap",
      title: `${calendarGap.gapDays}-day calendar gap ahead`,
      diagnosis: `Only ${calendarGap.scheduledCount} post(s) scheduled in the next ${calendarGap.lookaheadDays} days — risk of going quiet with ${area} audiences.`,
      suggestedAction: {
        kind: "content_request",
        requestType: "social_post",
        topic: `Fill the ${calendarGap.gapDays}-day publishing gap`,
        objective: `Schedule ${Math.max(2, calendarGap.minExpected - calendarGap.scheduledCount)} posts before the quiet stretch`,
      },
      evidence: [
        {
          signal: "calendar_gap",
          observed: `${calendarGap.scheduledCount} scheduled in ${calendarGap.lookaheadDays} days (target ${calendarGap.minExpected}+)`,
          inferred: `Longest gap: ${calendarGap.gapDays} day(s) without coverage`,
        },
      ],
      priority: clamp(KIND_PRIORITY.calendar_gap + Math.min(8, calendarGap.gapDays - 4)),
    });
  }

  if (cadence) {
    drafts.push({
      companyId: company.id,
      kind: "publishing_cadence",
      title: "Publishing cadence below target",
      diagnosis: `Only ${cadence.publishedCount} post(s) published in the last ${cadence.lookbackDays} days — below the ${cadence.minExpected}+ target for steady reach.`,
      suggestedAction: {
        kind: "campaign",
        goal: `Increase weekday visibility and ${cta.toLowerCase()} for ${company.name}`,
        objective: `Recover publishing cadence — last publish ${cadence.daysSinceLastPublish ?? "unknown"} day(s) ago`,
        audience: company.profile.targetCustomers || area,
      },
      evidence: [
        {
          signal: "publishing_cadence",
          observed: `${cadence.publishedCount}/${cadence.minExpected} posts in ${cadence.lookbackDays} days`,
          inferred:
            cadence.daysSinceLastPublish !== null && cadence.daysSinceLastPublish > 14
              ? "Audience may be cooling off without fresh content."
              : undefined,
        },
      ],
      priority: KIND_PRIORITY.publishing_cadence,
    });
  }

  if (pendingApprovalCount >= 3) {
    drafts.push({
      companyId: company.id,
      kind: "approval_bottleneck",
      title: `${pendingApprovalCount} items awaiting approval`,
      diagnosis: `Approval backlog is blocking go-live — campaigns cannot progress until clients sign off.`,
      suggestedAction: {
        kind: "task",
        objective: `Clear ${pendingApprovalCount} pending approval item(s) for ${company.name}`,
        topic: "Unblock approval backlog",
      },
      evidence: [
        {
          signal: "approval_backlog",
          observed: `${pendingApprovalCount} content item(s) in pending_approval`,
          inferred: "Publishing and campaign momentum stall while drafts wait.",
        },
      ],
      priority: clamp(KIND_PRIORITY.approval_bottleneck + pendingApprovalCount),
    });
  }

  if (input.topRecommendationTitle && (input.topRecommendationScore ?? 0) >= 70) {
    drafts.push({
      companyId: company.id,
      kind: "recommendation_signal",
      title: `Act on: ${input.topRecommendationTitle}`,
      diagnosis: `Top ranked recommendation (score ${input.topRecommendationScore}) aligns with current signals — converting now would address observed gaps.`,
      suggestedAction: {
        kind: "campaign",
        goal: input.topRecommendationTitle,
        objective: input.topRecommendationTitle,
        audience: company.profile.targetCustomers || area,
      },
      evidence: [
        {
          signal: "recommendation",
          observed: `${input.topRecommendationTitle} (score ${input.topRecommendationScore})`,
          inferred: "Recommendation engine ranked this above other actions.",
        },
      ],
      priority: clamp((input.topRecommendationScore ?? 70) + 4),
    });
  }

  return drafts.sort((a, b) => b.priority - a.priority);
}

// ---- tenant loaders ----------------------------------------------------------

export async function scanCompanyOpportunities(
  tenantId: string,
  company: Company,
): Promise<AiMosOpportunityDraft[]> {
  const [health, posts, content, ranked, tenant] = await Promise.all([
    buildCompanyHealthScore(tenantId, company),
    listScheduledPosts(tenantId),
    listContent(tenantId),
    generateRankedForCompany(company),
    getTenant(tenantId),
  ]);
  const today = resolveQueueClock(tenant).today;

  const calendarGap = detectCalendarGap(posts, company.id, today);
  const cadence = detectPublishingCadence(posts, company.id, today);
  const pendingApprovalCount = content.filter(
    (c) => c.companyId === company.id && c.status === "pending_approval",
  ).length;
  const top = ranked[0];

  return detectOpportunitiesFromSignals({
    company,
    health,
    calendarGap,
    cadence,
    pendingApprovalCount,
    topRecommendationTitle: top?.title,
    topRecommendationScore: top?.score,
  });
}

export async function surfaceTenantOpportunities(
  tenantId: string,
  userId: string,
  opts?: { companyIds?: string[] },
): Promise<number> {
  const companies = (await listCompanies(tenantId)).filter(
    (c) =>
      c.status !== "archived" &&
      (c.status === "ai_ready" || c.status === "approved") &&
      (!opts?.companyIds || opts.companyIds.includes(c.id)),
  );

  const openKinds = new Map<string, Set<string>>();
  for (const opp of await listAiMosOpportunities(tenantId, undefined, "open")) {
    if (!openKinds.has(opp.companyId)) openKinds.set(opp.companyId, new Set());
    openKinds.get(opp.companyId)!.add(opp.kind);
  }

  let created = 0;
  for (const company of companies) {
    const drafts = await scanCompanyOpportunities(tenantId, company);
    const existing = openKinds.get(company.id) ?? new Set();

    for (const draft of drafts) {
      if (existing.has(draft.kind)) continue;

      const aiRun = await recordAiUsage({
        tenantId,
        companyId: company.id,
        userId,
        kind: "ai_mos_scan",
        model: "ai-mos-v1",
        promptSummary: `Surface ${draft.kind}: ${draft.title}`.slice(0, 120),
        outputChars: draft.diagnosis.length + JSON.stringify(draft.evidence).length,
        sourcesUsed: draft.evidence.map((e) => e.signal),
      });

      await createAiMosOpportunity({
        ...draft,
        tenantId,
        status: "open",
        createdById: userId,
        aiRunId: aiRun.id,
      });

      existing.add(draft.kind);
      created += 1;
    }
  }

  return created;
}

// ---- convert / dismiss (governed) ------------------------------------------

export async function convertOpportunityToDraft(
  opp: AiMosOpportunity,
  user: Pick<User, "id" | "email" | "tenantId">,
): Promise<{ resultType: "campaign" | "request"; resultId: string }> {
  const company = await getCompany(opp.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== user.tenantId) throw new Error("Tenant mismatch");

  const action = opp.suggestedAction;

  if (action.kind === "campaign") {
    const goal = sanitizeAiUserInput(action.goal || action.objective || opp.title).text;
    const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const result = await buildCampaignFromGoal({
      company,
      goal,
      audience: action.audience,
      startDate,
    });
    const { strategy } = unpackKeyMessage(result.keyMessage);

    const campaign = await createCampaign({
      companyId: company.id,
      name: `${goal.slice(0, 56)} (AI-MOS)`,
      objective: result.objective,
      audience: action.audience || company.profile.targetCustomers,
      serviceFocus: result.channelPlan.slice(0, 200),
      channels: ["Facebook", "Instagram", "Google Business Profile"],
      durationDays: 30,
      startDate,
      offerId: null,
      keyMessage: result.keyMessage,
      status: "draft",
      requestId: null,
      createdById: user.id,
      approvedById: null,
      approvedAt: null,
    });

    const spawnedContentIds: string[] = [];
    for (const item of result.items) {
      const campaignItem = await createCampaignItem({
        campaignId: campaign.id,
        companyId: company.id,
        dayOffset: item.dayOffset,
        channel: item.channel,
        contentType: item.contentType,
        title: item.title,
        brief: item.brief,
        contentId: null,
        status: "planned",
      });
      const contentId = await spawnGovernedDraftForItem({
        company,
        campaignId: campaign.id,
        campaignRequestId: null,
        strategy,
        campaignItem,
        userId: user.id,
      });
      spawnedContentIds.push(contentId);
    }

    const notScheduled = await spawnedContentNotScheduled(company.tenantId, spawnedContentIds);
    if (!notScheduled) {
      throw new Error("Governance invariant violated: spawned content must not be scheduled");
    }

    const aiRun = await recordAiUsage({
      tenantId: company.tenantId,
      companyId: company.id,
      userId: user.id,
      kind: "ai_mos_convert",
      model: result.model,
      promptSummary: `Convert opportunity ${opp.id} → campaign draft`,
      outputChars: JSON.stringify(result.items).length,
      sourcesUsed: ["ai_mos", "campaign_builder", "Brand Brain: company profile"],
    });

    await updateAiMosOpportunity(opp.id, {
      status: "converted",
      convertedAt: new Date().toISOString(),
      resultType: "campaign",
      resultId: campaign.id,
      aiRunId: aiRun.id,
    });

    await logAction(user, "ai_mos.converted", {
      targetType: "ai_mos_opportunity",
      targetId: opp.id,
      companyId: company.id,
      detail: `campaign:${campaign.id} — ${opp.title}`,
    });

    return { resultType: "campaign", resultId: campaign.id };
  }

  // content_request or task → pre-filled request builder (draft path)
  const aiRun = await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: user.id,
    kind: "ai_mos_convert",
    model: "ai-mos-v1",
    promptSummary: `Convert opportunity ${opp.id} → content request`,
    outputChars: (action.topic ?? opp.title).length,
    sourcesUsed: ["ai_mos"],
  });

  await updateAiMosOpportunity(opp.id, {
    status: "converted",
    convertedAt: new Date().toISOString(),
    resultType: "request",
    resultId: opp.id,
    aiRunId: aiRun.id,
  });

  await logAction(user, "ai_mos.converted", {
    targetType: "ai_mos_opportunity",
    targetId: opp.id,
    companyId: company.id,
    detail: `request-prefill — ${opp.title}`,
  });

  return { resultType: "request", resultId: opp.id };
}

export async function dismissOpportunity(
  opp: AiMosOpportunity,
  user: Pick<User, "id" | "email" | "tenantId">,
  reason?: string,
): Promise<void> {
  const aiRun = await recordAiUsage({
    tenantId: opp.tenantId,
    companyId: opp.companyId,
    userId: user.id,
    kind: "ai_mos_dismiss",
    model: "ai-mos-v1",
    promptSummary: `Dismiss ${opp.kind}: ${opp.title}`.slice(0, 120),
    outputChars: (reason ?? opp.title).length,
    sourcesUsed: opp.evidence.map((e) => e.signal),
  });

  await updateAiMosOpportunity(opp.id, {
    status: "dismissed",
    dismissedAt: new Date().toISOString(),
    dismissReason: reason || null,
    aiRunId: aiRun.id,
  });

  await logAction(user, "ai_mos.dismissed", {
    targetType: "ai_mos_opportunity",
    targetId: opp.id,
    companyId: opp.companyId,
    detail: reason ? `${opp.title} — ${reason}` : opp.title,
  });
}

/** Portfolio helper — open opportunities across tenant, highest priority first. */
export async function listOpenOpportunitiesForTenant(
  tenantId: string,
  companyIds?: string[],
  limit = 12,
): Promise<AiMosOpportunity[]> {
  const open = await listAiMosOpportunities(tenantId, companyIds, "open");
  return open.slice(0, limit);
}

/** Whether a company has fresh recommendation data worth surfacing. */
export async function companyHasRecommendationSignals(
  tenantId: string,
  companyId: string,
): Promise<boolean> {
  const open = await listRecommendations(tenantId, [companyId], "open");
  return open.length > 0;
}
