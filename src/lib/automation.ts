// Enterprise Automation engine (Phase 12, §61 Phase 12).
//
// The cron drop-in. `runAutomations` spawns draft campaigns, monthly content
// drafts, analytics summaries and content alerts (recommendations), and can
// auto-publish only explicitly enabled, low-risk engagement replies. Negative,
// sensitive and uncertain cases remain in the staff queue.
//
// Everything is admin-gated and OFF by default (AutomationSettings.enabled).
// Runs are capped (maxCampaignsPerRun / maxDraftsPerCompany) and respect the
// AI cost cap, crisis/sandbox modes and the publishing kill switch.

import {
  appendAutomationRun,
  createCampaign,
  getTenant,
  createCampaignItem,
  createContent,
  createRecommendation,
  getAutomationSettings,
  getPublishingControls,
  getSecuritySettings,
  listCampaigns,
  listCompanies,
  listContent,
  listRecommendations,
  listSocial,
  logAiRun,
  updateSocial,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { aiBudgetExceeded } from "@/lib/db";
import { assertPlanIncludesAutomations } from "@/lib/billing";
import { generateCampaignPlan } from "@/lib/ai/campaign";
import { draftContent } from "@/lib/ai/draft";
import { generateForCompany } from "@/lib/ai/recommend";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { buildReport } from "@/lib/analytics";
import { summariseReport } from "@/lib/ai/summary";
import { now } from "@/lib/utils";
import { publishSocialReply } from "@/lib/publishing";
import { recordManagedEngagementRisk } from "@/lib/managed-service/workflow-service";
import type {
  ActingUser,
  AutomationOutcome,
  AutomationRun,
  Company,
  GroundingLabel,
  Intent,
} from "@/lib/types";

// §40 low-risk category whitelist — the ONLY intents an auto-response may touch.
// Deliberately narrow: warm, low-stakes messages. Anything escalation-worthy
// (complaints, refunds, legal, safety, media, pricing) is excluded.
const LOW_RISK_INTENTS = new Set<Intent>(["compliment", "general_enquiry"]);

function aiReady(c: Company): boolean {
  return c.status === "ai_ready" || c.status === "approved";
}

function estCost(model: string, chars: number): number {
  return model.startsWith("claude")
    ? Number(((chars / 4 / 1e6) * 15).toFixed(4))
    : 0;
}

// The cron drop-in. Admin-triggered ("manual") or scheduled ("cron").
export async function runAutomations(
  actor: ActingUser,
  opts: { trigger: "manual" | "cron"; signal?: AbortSignal; deadlineMs?: number },
): Promise<AutomationRun> {
  const deadlineReached = () =>
    opts.signal?.aborted ||
    (opts.deadlineMs !== undefined && Date.now() >= opts.deadlineMs);
  // T4: Enterprise Automation is a paid-tier feature — gate at the engine
  // entry so both the manual button AND a future cron respect the plan.
  await assertPlanIncludesAutomations(actor.tenantId);
  const settings = await getAutomationSettings(actor.tenantId);
  if (!settings.enabled) {
    throw new Error(
      "Automation is disabled. Enable it in Automations before running.",
    );
  }

  const outcomes: AutomationOutcome[] = [];
  const companies = (await listCompanies(actor.tenantId)).filter(aiReady);

  // Respects the tenant's AI cost cap: if already over budget, don't generate.
  const overBudget = () => aiBudgetExceeded(actor.tenantId);

  // ---- Job A: draft campaign suggestions (capped per run) --------------------
  if (settings.draftCampaignSuggestions && !(await overBudget())) {
    let made = 0;
    for (const company of companies) {
      if (deadlineReached()) break;
      if (made >= settings.maxCampaignsPerRun) break;
      if (await overBudget()) break;
      // Don't pile up: skip a company that already has an unapproved draft
      // campaign waiting (from a prior run or a person).
      const hasOpenDraft = (await listCampaigns(actor.tenantId)).some(
        (c) => c.companyId === company.id && c.status === "draft",
      );
      if (hasOpenDraft) continue;
      try {
        const outcome = await autoDraftCampaign(company, actor);
        if (outcome) {
          outcomes.push(outcome);
          made += 1;
        }
      } catch {
        // One company failing must not abort the whole run.
      }
    }
  }

  // ---- Job B: monthly content generation (capped per company) ----------------
  if (settings.monthlyContentGeneration && !(await overBudget())) {
    for (const company of companies) {
      if (deadlineReached()) break;
      if (await overBudget()) break;
      try {
        const made = await autoDraftContent(
          company,
          actor,
          settings.maxDraftsPerCompany,
        );
        outcomes.push(...made);
      } catch {
        /* skip company */
      }
    }
  }

  // ---- Job C: analytics summary (tenant-wide, once per run) ------------------
  if (
    !deadlineReached() &&
    settings.analyticsSummaries &&
    !(await overBudget())
  ) {
    try {
      const tenant = await getTenant(actor.tenantId);
      const report = await buildReport(actor.tenantId);
      const { text, model } = await summariseReport(report, tenant?.name ?? "your organisation");
      await logAiRun({
        tenantId: actor.tenantId,
        userId: actor.id,
        kind: "management_summary",
        model,
        promptSummary: "Automated group analytics summary",
        outputChars: text.length,
        sourcesUsed: ["Analytics report"],
        estCostUsd: estCost(model, text.length),
      });
      outcomes.push({
        kind: "analytics_summary",
        detail: text,
        resultType: "summary",
      });
    } catch {
      /* skip */
    }
  }

  // ---- Job D: content alerts (repurpose / stale / performance) ---------------
  // Grounded rule-based recommendations, deduped against open ones — exactly
  // the §44 alerts (top-performer repurpose, underperformer, stale content,
  // offer refresh, etc.). Each becomes a governed suggestion, not an action.
  if (settings.contentAlerts) {
    for (const company of companies) {
      if (deadlineReached()) break;
      try {
        const made = await autoContentAlerts(company, actor);
        outcomes.push(...made);
      } catch {
        /* skip company */
      }
    }
  }

  // ---- Job E: risk-routed low-risk auto-responses ----------------------------
  if (!deadlineReached() && settings.lowRiskAutoResponses) {
    const s = await getSecuritySettings(actor.tenantId);
    const controls = await getPublishingControls(actor.tenantId);
    const blocked = s.crisisMode || s.sandboxMode || controls.socialRepliesDisabled;
    if (!blocked) {
      const approved = await autoApproveLowRiskReplies(actor);
      outcomes.push(...approved);
    }
  }

  const run = await appendAutomationRun({
    tenantId: actor.tenantId,
    trigger: opts.trigger,
    triggeredById: actor.id,
    outcomes,
  });
  await logAction(actor, "automation.run", {
    targetType: "automation_run",
    targetId: run.id,
    detail: `${opts.trigger} · ${outcomes.length} outcome(s)`,
  });
  return run;
}

// ---- Job implementations -----------------------------------------------------

async function autoDraftCampaign(
  company: Company,
  actor: ActingUser,
): Promise<AutomationOutcome | null> {
  // Ground the suggestion in the recommendation engine's "next campaign" rec.
  const rec = (await generateForCompany(company)).find((r) => r.type === "next_campaign");
  const objective =
    rec?.action.objective ?? `Grow demand for ${company.name}`;
  const serviceFocus = rec?.action.serviceFocus;
  const startDate = new Date(Date.parse(now()) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const plan = await generateCampaignPlan({
    company,
    objective,
    audience: company.profile.targetCustomers,
    serviceFocus,
    channels: [],
    durationDays: 30,
    startDate,
    offer: null,
  });

  // Created as a DRAFT — it still needs human submit + approval before any of
  // its items can be drafted, and nothing is ever published automatically.
  const campaign = await createCampaign({
    companyId: company.id,
    name: `[Auto] ${objective.slice(0, 56)}`,
    objective,
    audience: company.profile.targetCustomers,
    serviceFocus,
    channels: [],
    durationDays: 30,
    startDate,
    offerId: null,
    keyMessage: plan.keyMessage,
    status: "draft",
    requestId: null,
    createdById: actor.id,
    approvedById: null,
    approvedAt: null,
  });
  for (const item of plan.items) {
    await createCampaignItem({
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
  }
  await logAiRun({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: actor.id,
    kind: "campaign_plan",
    model: plan.model,
    promptSummary: `Auto campaign: ${objective}`.slice(0, 120),
    outputChars: JSON.stringify(plan.items).length,
    sourcesUsed: ["Brand Brain", "Local Area Intelligence Profile"],
    estCostUsd: estCost(plan.model, JSON.stringify(plan.items).length),
  });
  await logAction(actor, "automation.campaign_drafted", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId: company.id,
    detail: campaign.name,
  });
  return {
    kind: "draft_campaign",
    companyId: company.id,
    companyName: company.name,
    detail: `Drafted campaign "${campaign.name}" (${plan.items.length} items) — awaiting approval`,
    resultType: "campaign",
    resultId: campaign.id,
  };
}

async function autoDraftContent(
  company: Company,
  actor: ActingUser,
  cap: number,
): Promise<AutomationOutcome[]> {
  const outcomes: AutomationOutcome[] = [];
  // Candidate topics come from the recommendation engine's content-request
  // suggestions (content gaps, timing triggers, FAQ insights) — grounded, not
  // generic. We do NOT pre-slice to the cap: the cap bounds CREATED drafts, so
  // topics already covered are skipped BEFORE spending an AI call, and we keep
  // going through the candidate list until `cap` fresh drafts are made.
  const candidates = (await generateForCompany(company)).filter(
    (r) => r.action.kind === "content_request" && r.action.topic,
  );
  const existingTitles = new Set(
    (await listContent(company.tenantId))
      .filter((c) => c.companyId === company.id)
      .map((c) => c.title.toLowerCase()),
  );
  const seenTopics = new Set<string>();

  for (const rec of candidates) {
    if (outcomes.length >= cap) break; // cap on drafts CREATED, per company
    if (await aiBudgetExceeded(company.tenantId)) break;
    const topic = rec.action.topic!;
    const topicKey = topic.toLowerCase();
    // Dedup BEFORE drafting so a skipped topic costs neither budget nor a cap
    // slot: skip if we've already drafted this topic, or existing content for
    // the company already covers it.
    if (seenTopics.has(topicKey)) continue;
    if ([...existingTitles].some((t) => t.includes(topicKey))) continue;
    seenTopics.add(topicKey);

    const objective = rec.action.objective ?? `Promote ${topic}`;
    const requestType = rec.action.requestType ?? "social_post";
    const draft = await draftContent({
      company,
      requestType,
      topic,
      objective,
    });
    // Backstop: two distinct topics could still resolve to the same title.
    if (existingTitles.has(draft.title.toLowerCase())) continue;

    const compliance = await checkCompliance(draft.body, company);
    const claimAudit = await auditClaims(draft.body, company);
    const groundingLabel: GroundingLabel = claimAudit.some(
      (c) => c.status === "unsupported",
    )
      ? "requires_evidence"
      : draft.sourceRefs.length > 0
        ? "grounded"
        : "suggested_by_ai";

    const content = await createContent({
      companyId: company.id,
      requestId: null,
      type: requestType,
      title: draft.title,
      body: draft.body,
      status: "ai_draft", // needs human review + approval
      createdById: actor.id,
      compliance,
      claimAudit,
      groundingLabel,
      sourceRefs: draft.sourceRefs,
      brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
      aiModel: draft.model,
      aiPrompt: `Automated monthly content — ${topic}`,
      sourcesUsed: draft.sources,
    });
    existingTitles.add(draft.title.toLowerCase());
    await logAiRun({
      tenantId: company.tenantId,
      companyId: company.id,
      userId: actor.id,
      kind: "content_draft",
      model: draft.model,
      promptSummary: `Auto content: ${topic}`.slice(0, 120),
      outputChars: draft.body.length,
      sourcesUsed: draft.sources,
      estCostUsd: estCost(draft.model, draft.body.length),
    });
    await logAction(actor, "automation.content_drafted", {
      targetType: "content",
      targetId: content.id,
      companyId: company.id,
      detail: draft.title,
    });
    outcomes.push({
      kind: "monthly_content",
      companyId: company.id,
      companyName: company.name,
      detail: `Drafted "${draft.title}" — awaiting review`,
      resultType: "content",
      resultId: content.id,
    });
  }
  return outcomes;
}

async function autoContentAlerts(company: Company, actor: ActingUser): Promise<AutomationOutcome[]> {
  const outcomes: AutomationOutcome[] = [];
  const ALERT_TYPES = new Set([
    "top_performer_repurpose",
    "underperformer",
    "stale_content",
    "offer_refresh",
    "best_platform",
  ]);
  const openTypes = new Set(
    (await listRecommendations(company.tenantId, [company.id], "open")).map((r) => r.type),
  );
  for (const draft of await generateForCompany(company)) {
    if (!ALERT_TYPES.has(draft.type)) continue;
    if (openTypes.has(draft.type)) continue; // dedupe against existing open recs
    const rec = await createRecommendation({
      ...draft,
      status: "open",
      createdById: actor.id,
    });
    openTypes.add(draft.type);
    await logAction(actor, "automation.alert_raised", {
      targetType: "recommendation",
      targetId: rec.id,
      companyId: company.id,
      detail: draft.title,
    });
    outcomes.push({
      kind: "content_alerts",
      companyId: company.id,
      companyName: company.name,
      detail: draft.title,
      resultType: "recommendation",
      resultId: rec.id,
    });
  }
  return outcomes;
}

// The admin setting is the pre-authorisation for the low-risk whitelist.
// Publishing still runs the complete connector/control eligibility chain.
async function autoApproveLowRiskReplies(actor: ActingUser): Promise<AutomationOutcome[]> {
  const outcomes: AutomationOutcome[] = [];
  for (const draft of await listSocial(actor.tenantId)) {
    if (draft.status !== "pending_approval") continue;
    const eligible =
      !draft.escalationRequired &&
      draft.riskLevel === "low" &&
      draft.sentiment !== "negative" &&
      LOW_RISK_INTENTS.has(draft.intent);
    await recordManagedEngagementRisk({
      tenantId: actor.tenantId,
      companyId: draft.companyId,
      sourceKind: "comment",
      sourceId: draft.id,
      riskLevel:
        draft.riskLevel === "critical" || draft.riskLevel === "high"
          ? "high"
          : draft.riskLevel === "medium"
            ? "medium"
            : "low",
      sentiment:
        draft.sentiment === "positive" ||
        draft.sentiment === "neutral" ||
        draft.sentiment === "negative"
          ? draft.sentiment
          : "uncertain",
      confidence: eligible ? 0.9 : 0.5,
    });
    if (!eligible) continue;
    await updateSocial(draft.id, { status: "approved", approvedById: actor.id });
    const result = await publishSocialReply(
      { ...draft, status: "approved", approvedById: actor.id },
      actor,
    );
    if (result.status === "published") {
      await updateSocial(draft.id, { status: "published" });
    }
    await logAction(actor, "automation.reply_auto_approved", {
      targetType: "social",
      targetId: draft.id,
      companyId: draft.companyId,
      detail: `${draft.intent} · ${draft.riskLevel} risk · ${result.status}`,
    });
    outcomes.push({
      kind: "auto_response",
      companyId: draft.companyId,
      detail: `Low-risk ${draft.intent.replace(/_/g, " ")} reply: ${result.status}`,
      resultType: "social",
      resultId: draft.id,
    });
  }
  return outcomes;
}
