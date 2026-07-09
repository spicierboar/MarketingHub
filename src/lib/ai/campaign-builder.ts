// AI campaign builder (V1 module 7) — plain-language goal → draft strategy,
// channel plan, KPIs, and a governed calendar plan. Spawns campaign items plus
// ai_draft content rows; nothing is scheduled until existing approval gates pass.
// Claude when ANTHROPIC_API_KEY is set; deterministic fallback otherwise.

import { AI_MODEL } from "@/lib/ai/claude";
import { guardedClaudeCall, sanitizeAiUserInput } from "@/lib/security-slice";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import {
  generateCampaignPlan,
  type CampaignPlanInput,
  type PlannedItem,
} from "@/lib/ai/campaign";
import { buildBusinessProfileAiContext, recommendedCampaignGoals } from "@/lib/business-profiles";
import {
  createContent,
  listScheduledPosts,
  updateCampaignItem,
} from "@/lib/db";
import { routeContent } from "@/lib/routing";
import {
  applyCitationsToBody,
  retrieveApprovedSnippets,
  sourceLabelsFromRefs,
} from "@/lib/brand-brain-rag";
import type { CampaignItem, Company, GroundingLabel, Offer } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export interface CampaignBuilderInput {
  company: Company;
  goal: string;
  audience?: string;
  channels?: string[];
  durationDays?: 30 | 90;
  startDate: string;
  offer?: Offer | null;
}

export interface CampaignBuilderMeta {
  kpis: string[];
  riskWarnings: string[];
  channelPlan: string;
}

export interface CampaignBuilderResult {
  objective: string;
  strategy: string;
  channelPlan: string;
  kpis: string[];
  riskWarnings: string[];
  keyMessage: string;
  items: PlannedItem[];
  model: string;
}

const M07_META_RE = /<!--m07:([\s\S]*?)-->/;
const DEFAULT_CHANNELS = ["Facebook", "Instagram", "Google Business Profile"];

// ---- meta encoding (no migration — packed into campaigns.key_message) --------

export function packKeyMessage(strategy: string, meta: CampaignBuilderMeta): string {
  return `${strategy}\n\n<!--m07:${JSON.stringify(meta)}-->`;
}

export function unpackKeyMessage(keyMessage?: string | null): {
  strategy: string;
  meta: CampaignBuilderMeta | null;
} {
  if (!keyMessage) return { strategy: "", meta: null };
  const match = keyMessage.match(M07_META_RE);
  if (!match) return { strategy: keyMessage, meta: null };
  try {
    const meta = JSON.parse(match[1]) as CampaignBuilderMeta;
    const strategy = keyMessage.replace(M07_META_RE, "").trim();
    return { strategy, meta };
  } catch {
    return { strategy: keyMessage, meta: null };
  }
}

// ---- goal interpretation -----------------------------------------------------

interface ParsedGoal {
  objective: string;
  audience?: string;
  channels: string[];
  kpis: string[];
  strategy: string;
  channelPlan: string;
  riskWarnings: string[];
}

function normalizeGoal(goal: string): string {
  return goal.trim().replace(/\s+/g, " ");
}

function inferGoalKind(goal: string): "weekday" | "bookings" | "reviews" | "general" {
  const g = goal.toLowerCase();
  if (/\b(weekday|midweek|lunch|monday|tuesday|wednesday|thursday|quiet day)\b/.test(g)) {
    return "weekday";
  }
  if (/\b(book|booking|reservation|direct book|table|stay|occupancy)\b/.test(g)) {
    return "bookings";
  }
  if (/\b(review|rating|reputation|google review|testimonial)\b/.test(g)) {
    return "reviews";
  }
  return "general";
}

function parseGoal(company: Company, goal: string): ParsedGoal {
  const kind = inferGoalKind(goal);
  const p = company.profile;
  const area = p.serviceAreas[0] || "local customers";
  const cta = p.callsToAction[0] || "Get in touch";
  const suggested = recommendedCampaignGoals(company);

  switch (kind) {
    case "weekday":
      return {
        objective: goal,
        audience: p.targetCustomers || `Weekday visitors in ${area}`,
        channels: ["Facebook", "Instagram", "Google Business Profile", "Email"],
        strategy: `Drive steadier weekday demand for ${company.name} with value-led posts, service highlights, and reminders timed for midweek decision-making. Lead with practical reasons to visit on quieter days; CTA: ${cta}.`,
        channelPlan:
          "Facebook + Instagram for visual day-of specials; Google Business Profile for hours/offers and local discovery; email to past guests for midweek nudges.",
        kpis: [
          "Weekday foot traffic or covers +10–15% vs prior 4-week baseline",
          "Midweek social engagement rate above account average",
          "GBP profile actions (calls, directions) on Tue–Thu +8%",
        ],
        riskWarnings: riskFromProfile(company, false),
      };
    case "bookings":
      return {
        objective: goal,
        audience: p.targetCustomers || `Guests planning a visit to ${area}`,
        channels: ["Facebook", "Instagram", "Google Business Profile", "Email"],
        strategy: `Shift demand from third-party marketplaces to direct bookings for ${company.name}. Use proof, availability cues, and a clear booking CTA across owned channels.`,
        channelPlan:
          "Instagram/Facebook for lifestyle proof and limited-time booking prompts; GBP posts for direct booking links; email nurture for warm leads.",
        kpis: [
          "Direct bookings +12% month-over-month",
          "Booking-link click-through rate +15% on paid/owned posts",
          "Reduction in OTA-attributed share of reservations (where tracked)",
        ],
        riskWarnings: riskFromProfile(company, true),
      };
    case "reviews":
      return {
        objective: goal,
        audience: `Recent customers of ${company.name} in ${area}`,
        channels: ["Google Business Profile", "Facebook", "Instagram", "Email"],
        strategy: `Grow verified Google reviews through post-visit follow-up, in-venue prompts, and reputation-safe social proof — without incentivising fake reviews.`,
        channelPlan:
          "GBP as primary review surface; email/SMS-style newsletter follow-up; social posts showcasing genuine guest stories (with consent).",
        kpis: [
          "New Google reviews +5–8 per month",
          "Average star rating maintained or improved",
          "Review response time under 48 hours",
        ],
        riskWarnings: [
          ...riskFromProfile(company, false),
          "Never offer incentives for reviews — violates platform policies.",
        ],
      };
    default:
      return {
        objective: goal,
        audience: p.targetCustomers,
        channels: DEFAULT_CHANNELS,
        strategy: `${goal} — focused campaign for ${company.name} in ${area}, aligned to brand voice and approved claims. CTA: ${cta}.`,
        channelPlan: `Core cadence on ${DEFAULT_CHANNELS.join(", ")} with optional email mid-campaign.`,
        kpis: [
          suggested[0]
            ? `Progress toward: ${suggested[0]}`
            : "Reach/impressions +15% vs prior month",
          "Engagement rate at or above channel baseline",
          `Measurable uplift on primary CTA (${cta})`,
        ],
        riskWarnings: riskFromProfile(company, false),
      };
  }
}

function riskFromProfile(company: Company, mentionsOffer: boolean): string[] {
  const risks: string[] = [];
  if (company.profile.prohibitedClaims.length) {
    risks.push(
      `Avoid prohibited claims: ${company.profile.prohibitedClaims.slice(0, 2).join("; ")}`,
    );
  }
  if (mentionsOffer) {
    risks.push("Discount or urgency copy must use approved offer wording only.");
  }
  if (!company.profile.approvedClaims.length) {
    risks.push("No approved claims on file — keep copy factual and verifiable.");
  }
  return risks;
}

// ---- Claude path -------------------------------------------------------------

async function builderContext(company: Company, parsed: ParsedGoal): Promise<string> {
  return [
    `Company: ${company.name}`,
    buildBusinessProfileAiContext(company),
    `Parsed objective: ${parsed.objective}`,
    parsed.audience && `Audience: ${parsed.audience}`,
    `Suggested channels: ${parsed.channels.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function claudeBuilder(
  company: Company,
  goal: string,
  parsed: ParsedGoal,
): Promise<Partial<CampaignBuilderResult> | null> {
  const system = [
    "You are a senior marketing strategist for local SMBs. Return ONLY JSON, no prose:",
    '{"strategy": string (2-3 sentences), "channelPlan": string (1-2 sentences), "kpis": string[3-5], "riskWarnings": string[0-4], "objective": string (one line)}',
    "KPIs must be measurable. Risk warnings cover claims, offers, audience size, or budget realism.",
    "",
    await builderContext(company, parsed),
  ].join("\n");

  const raw = await guardedClaudeCall({
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.name,
    system,
    user: `Business goal: ${goal}`,
    maxTokens: 1200,
  });
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof data.strategy !== "string" || !Array.isArray(data.kpis)) return null;
    const kpis = (data.kpis as unknown[])
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .slice(0, 6);
    if (kpis.length < 2) return null;
    const riskWarnings = Array.isArray(data.riskWarnings)
      ? (data.riskWarnings as unknown[])
          .filter((r): r is string => typeof r === "string")
          .slice(0, 5)
      : parsed.riskWarnings;
    return {
      objective: typeof data.objective === "string" ? data.objective : parsed.objective,
      strategy: data.strategy.slice(0, 600),
      channelPlan:
        typeof data.channelPlan === "string"
          ? data.channelPlan.slice(0, 400)
          : parsed.channelPlan,
      kpis,
      riskWarnings,
      model: AI_MODEL,
    };
  } catch {
    return null;
  }
}

// ---- main entry --------------------------------------------------------------

export async function buildCampaignFromGoal(
  input: CampaignBuilderInput,
): Promise<CampaignBuilderResult> {
  const goal = sanitizeAiUserInput(normalizeGoal(input.goal)).text;
  if (!goal) throw new Error("Goal is required");

  const parsed = parseGoal(input.company, goal);
  const channels =
    input.channels && input.channels.length > 0 ? input.channels : parsed.channels;
  const durationDays = input.durationDays ?? 30;
  const audience = input.audience || parsed.audience;

  const aiLayer = await claudeBuilder(input.company, goal, parsed);

  const objective = aiLayer?.objective ?? parsed.objective;
  const strategy = aiLayer?.strategy ?? parsed.strategy;
  const channelPlan = aiLayer?.channelPlan ?? parsed.channelPlan;
  const kpis = aiLayer?.kpis ?? parsed.kpis;
  const riskWarnings = aiLayer?.riskWarnings ?? parsed.riskWarnings;
  const model = aiLayer?.model ?? "template (no API key)";

  const planInput: CampaignPlanInput = {
    company: input.company,
    objective,
    audience,
    channels,
    durationDays,
    startDate: input.startDate,
    offer: input.offer ?? null,
  };
  const plan = await generateCampaignPlan(planInput);

  const meta: CampaignBuilderMeta = { kpis, riskWarnings, channelPlan };
  const keyMessage = packKeyMessage(strategy, meta);

  return {
    objective,
    strategy,
    channelPlan,
    kpis,
    riskWarnings,
    keyMessage,
    items: plan.items,
    model: plan.model === "template (no API key)" && model !== "template (no API key)"
      ? `${model} + ${plan.model}`
      : plan.model,
  };
}

// ---- governed draft spawn (ai_draft only — never scheduled) ------------------

export function templateSpawnBody(
  company: Company,
  item: PlannedItem,
  strategy: string,
): { title: string; body: string } {
  const cta = company.profile.callsToAction[0] || "Get in touch";
  return {
    title: item.title,
    body: [
      item.brief,
      "",
      strategy,
      "",
      `Channel: ${item.channel} · ${company.name}`,
      cta,
    ].join("\n"),
  };
}

export async function spawnGovernedDraftForItem(args: {
  company: Company;
  campaignId: string;
  campaignRequestId?: string | null;
  strategy: string;
  campaignItem: CampaignItem;
  userId: string;
}): Promise<string> {
  const { company, campaignItem } = args;
  const draft = templateSpawnBody(company, campaignItem, args.strategy);
  const query = [campaignItem.title, campaignItem.brief, args.strategy].join(" ");
  const sourceRefs = await retrieveApprovedSnippets(company.id, query, 3);
  const body = applyCitationsToBody(draft.body, sourceRefs);
  const compliance = await checkCompliance(body, company);
  const claimAudit = await auditClaims(body, company);
  const routedTo = routeContent({
    type: campaignItem.contentType,
    compliance,
    claimAudit,
  });
  const groundingLabel: GroundingLabel =
    sourceRefs.length > 0
      ? "grounded"
      : claimAudit.some((c) => c.status === "unsupported")
        ? "requires_evidence"
        : "suggested_by_ai";

  const content = await createContent({
    companyId: company.id,
    requestId: args.campaignRequestId ?? null,
    campaignId: args.campaignId,
    campaignItemId: campaignItem.id,
    type: campaignItem.contentType,
    title: draft.title,
    body,
    status: "ai_draft",
    createdById: args.userId,
    compliance,
    claimAudit,
    groundingLabel,
    routedTo,
    sourceRefs,
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: "campaign-builder-template",
    aiPrompt: `${campaignItem.brief} — ${campaignItem.title}`,
    sourcesUsed: ["Campaign builder: goal plan", ...sourceLabelsFromRefs(sourceRefs)],
  });

  await updateCampaignItem(campaignItem.id, {
    status: "drafted",
    contentId: content.id,
  });

  return content.id;
}

/** Returns true when no scheduled posts exist for spawned content (governance invariant). */
export async function spawnedContentNotScheduled(
  tenantId: string,
  contentIds: string[],
): Promise<boolean> {
  if (contentIds.length === 0) return true;
  const scheduled = await listScheduledPosts(tenantId);
  const idSet = new Set(contentIds);
  return !scheduled.some((p) => idSet.has(p.contentId));
}
