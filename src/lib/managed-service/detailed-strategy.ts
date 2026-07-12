// Detailed marketing strategy generator — structured v1 document for company
// + client Strategy surfaces. Claude JSON when keyed; rich template otherwise.
// Never publishes — status starts in client_review for approval lifecycle.

import { AI_MODEL } from "@/lib/ai/claude";
import { guardedClaudeCall } from "@/lib/security-slice";
import { buildBusinessProfileAiContext } from "@/lib/business-profiles";
import type { ResolvedCompanyPackage } from "@/lib/marketing-packages";
import { id, now } from "@/lib/utils";
import type {
  Company,
  DetailedMarketingStrategy,
  DetailedStrategyStatus,
  ManagedServiceLevel,
  StrategyChannelPlan,
  StrategyPersona,
  StrategyRoadmapPhase,
} from "@/lib/types";

const HISTORY_CAP = 10;

const CHANNEL_TACTICS: Record<string, string[]> = {
  Instagram: ["3 reels/week", "Daily stories", "UGC resharing", "Influencer collabs"],
  Facebook: ["Bi-weekly community posts", "Local offer boosts", "Event reminders"],
  TikTok: ["3 short videos/week", "Trend participation", "UGC resharing", "Creator collabs"],
  Email: ["Bi-weekly newsletter", "Drip sequences", "Win-back campaigns"],
  "Google Business Profile": [
    "Weekly GBP posts",
    "Photo refresh cadence",
    "Review reply SLA",
  ],
  "Paid ads": ["Prospecting tests", "Retargeting", "Creative refresh cycle"],
  LinkedIn: ["Thought-leadership posts", "Case snippets", "Offer CTAs"],
};

function displayChannels(pkgChannels: string[], builderChannels: string[]): string[] {
  const fromPkg = pkgChannels
    .map((c) => {
      const lower = c.toLowerCase();
      if (lower === "instagram") return "Instagram";
      if (lower === "facebook") return "Facebook";
      if (lower === "tiktok") return "TikTok";
      if (lower === "email") return "Email";
      if (lower === "gbp" || lower.includes("google")) return "Google Business Profile";
      if (lower.includes("paid") || lower === "ads") return "Paid ads";
      if (lower === "linkedin") return "LinkedIn";
      return c;
    })
    .filter(Boolean);
  const merged = [...fromPkg, ...builderChannels.filter((c) => !fromPkg.includes(c))];
  return merged.length ? [...new Set(merged)] : ["Instagram", "Facebook", "Email"];
}

function defaultPersonas(company: Company): StrategyPersona[] {
  const audience = company.profile.targetCustomers?.trim();
  return [
    {
      name: "Decision-Maker Dana",
      demographics: "32-45, urban professional, household income $80k+",
      motivations: audience
        ? `Quality, time savings, and trustworthy recommendations for ${audience}.`
        : "Quality, time savings, trustworthy recommendations.",
      painPoints: "Too many options, skepticism toward marketing claims.",
    },
    {
      name: "Value-Seeker Alex",
      demographics: "25-34, mobile-first, active on social",
      motivations: "Deals, social proof, brands that feel authentic.",
      painPoints: "Budget conscious, low patience for slow websites.",
    },
  ];
}

function defaultObjectives(company: Company, pkg: ResolvedCompanyPackage): string[] {
  const industry = company.profile.industry?.trim() || "local";
  return [
    "Increase qualified leads by 25% over the next 90 days.",
    "Grow engaged social following by 40% across primary platforms.",
    "Improve website conversion rate from 1.8% to 3%.",
    `Build a 5-star review pipeline for ${industry} local SEO dominance.`,
    `Deliver ~${pkg.postsPerMonth} on-brand posts/month on the ${pkg.name} package.`,
  ];
}

function defaultChannelPlans(channels: string[], companyName: string): StrategyChannelPlan[] {
  return channels.map((channel) => {
    const tactics = CHANNEL_TACTICS[channel] ?? [
      "Consistent branded posts",
      "Clear CTA on every piece",
      "Measure engagement weekly",
    ];
    return {
      channel,
      rationale: `High concentration of ${companyName}'s target audience and strong engagement potential.`,
      tactics,
    };
  });
}

function defaultRoadmap(pkg: ResolvedCompanyPackage): StrategyRoadmapPhase[] {
  return [
    {
      key: "30",
      title: "30-day plan",
      objectives: ["Launch consistent social cadence", "Audit & fix website basics"],
      activities: ["Brand profile setup", "Content calendar", "SEO audit"],
      kpis: ["Posts published", "Profile completeness", "Organic impressions"],
    },
    {
      key: "60",
      title: "60-day plan",
      objectives: ["Build audience & engagement", "Start paid testing"],
      activities: ["Influencer outreach", "First paid campaign", "Email list growth"],
      kpis: ["Follower growth", "Engagement rate", "Cost per lead"],
    },
    {
      key: "90",
      title: "90-day plan",
      objectives: ["Scale what works", "Hit revenue targets"],
      activities: ["Budget reallocation", "Funnel optimisation", "Quarterly report"],
      kpis: ["Qualified leads", "ROAS", "Conversion rate"],
    },
    {
      key: "annual",
      title: "Annual marketing roadmap",
      objectives: [
        "Triple qualified inbound leads versus the prior year.",
        "Establish category-leading brand awareness in the local market.",
        "Build a compounding owned-audience (email + followers) of 10k+.",
        pkg.adsManagementIncluded
          ? "Achieve a 3x return on ad spend across paid channels."
          : "Prepare paid readiness while compounding organic reach.",
      ],
      activities: [
        "Q1: Foundations — brand refresh, tracking/CRM setup, content cadence, review pipeline launch.",
        "Q2: Audience growth — influencer partnerships, paid acquisition tests, SEO pillar content.",
        "Q3: Conversion — landing-page optimisation, retargeting, email nurture automation.",
        "Q4: Scale — double down on winning channels, annual planning, retention offers.",
      ],
      kpis: [
        "Annual qualified leads",
        "Year-over-year revenue growth",
        "Average ROAS",
        "Total audience size (email + social)",
        "Brand search volume",
      ],
    },
  ];
}

function buildExecutiveSummary(args: {
  companyName: string;
  objectives: string[];
  channels: string[];
  day30Focus: string[];
}): string {
  const top = args.objectives.slice(0, 2).join("; ");
  const ch = args.channels.slice(0, 3).join(", ");
  const focus = args.day30Focus.join(" and ");
  return (
    `This strategy is designed to help ${args.companyName} achieve: ${top}. ` +
    `We recommend focusing on ${ch} as your primary channels. ` +
    `Over the 30-day plan, the focus will be on ${focus}. ` +
    `The full plan includes a 30/60/90-day roadmap with clear activities and KPIs.`
  );
}

function templateStrategy(args: {
  company: Company;
  pkg: ResolvedCompanyPackage;
  channels: string[];
  version: number;
  status: DetailedStrategyStatus;
}): DetailedMarketingStrategy {
  const { company, pkg, version, status } = args;
  const channels = displayChannels(pkg.channels, args.channels);
  const businessObjectives = defaultObjectives(company, pkg);
  const personas = defaultPersonas(company);
  const channelPlans = defaultChannelPlans(channels, company.name);
  const roadmap = defaultRoadmap(pkg);
  const day30 = roadmap.find((r) => r.key === "30");
  const executiveSummary = buildExecutiveSummary({
    companyName: company.name,
    objectives: businessObjectives,
    channels,
    day30Focus: day30?.objectives ?? ["launch consistent social cadence"],
  });

  return {
    id: id("mstrat"),
    version,
    title: `${company.name} — Marketing Strategy v${version}`,
    status,
    generatedAt: now(),
    model: "template",
    packageName: pkg.name,
    executiveSummary,
    businessObjectives,
    personas,
    channels: channelPlans,
    roadmap,
  };
}

function asStringArray(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim().slice(0, 400))
    .slice(0, max);
  return out.length ? out : null;
}

function parseClaudeStrategy(
  raw: string,
  fallback: DetailedMarketingStrategy,
): DetailedMarketingStrategy | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    const executiveSummary =
      typeof data.executiveSummary === "string" ? data.executiveSummary.trim() : "";
    const businessObjectives = asStringArray(data.businessObjectives, 8);
    if (!executiveSummary || !businessObjectives || businessObjectives.length < 2) return null;

    const personasRaw = Array.isArray(data.personas) ? data.personas : [];
    const personas: StrategyPersona[] = personasRaw
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        if (typeof o.name !== "string") return null;
        return {
          name: o.name.slice(0, 80),
          demographics: typeof o.demographics === "string" ? o.demographics.slice(0, 200) : "",
          motivations: typeof o.motivations === "string" ? o.motivations.slice(0, 300) : "",
          painPoints: typeof o.painPoints === "string" ? o.painPoints.slice(0, 300) : "",
        };
      })
      .filter((p): p is StrategyPersona => Boolean(p))
      .slice(0, 4);
    if (personas.length < 1) return null;

    const channelsRaw = Array.isArray(data.channels) ? data.channels : [];
    const channels: StrategyChannelPlan[] = channelsRaw
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const o = c as Record<string, unknown>;
        if (typeof o.channel !== "string") return null;
        const tactics = asStringArray(o.tactics, 8);
        if (!tactics) return null;
        return {
          channel: o.channel.slice(0, 60),
          rationale:
            typeof o.rationale === "string"
              ? o.rationale.slice(0, 300)
              : fallback.channels[0]?.rationale ?? "",
          tactics,
        };
      })
      .filter((c): c is StrategyChannelPlan => Boolean(c))
      .slice(0, 8);
    if (channels.length < 1) return null;

    const roadmapRaw = Array.isArray(data.roadmap) ? data.roadmap : [];
    const roadmap: StrategyRoadmapPhase[] = [];
    for (const key of ["30", "60", "90", "annual"] as const) {
      const row = roadmapRaw.find(
        (r) => r && typeof r === "object" && (r as Record<string, unknown>).key === key,
      ) as Record<string, unknown> | undefined;
      const fb = fallback.roadmap.find((r) => r.key === key)!;
      if (!row) {
        roadmap.push(fb);
        continue;
      }
      roadmap.push({
        key,
        title: typeof row.title === "string" ? row.title.slice(0, 80) : fb.title,
        objectives: asStringArray(row.objectives, 6) ?? fb.objectives,
        activities: asStringArray(row.activities, 8) ?? fb.activities,
        kpis: asStringArray(row.kpis, 8) ?? fb.kpis,
      });
    }

    return {
      ...fallback,
      model: AI_MODEL,
      executiveSummary: executiveSummary.slice(0, 1200),
      businessObjectives,
      personas,
      channels,
      roadmap,
    };
  } catch {
    return null;
  }
}

async function claudeDetailedStrategy(
  company: Company,
  fallback: DetailedMarketingStrategy,
): Promise<DetailedMarketingStrategy | null> {
  const system = [
    "You are a senior marketing strategist for Australian SMBs.",
    "Return ONLY JSON (no prose) shaped exactly:",
    JSON.stringify({
      executiveSummary: "string 3-5 sentences",
      businessObjectives: ["string"],
      personas: [
        {
          name: "string",
          demographics: "string",
          motivations: "string",
          painPoints: "string",
        },
      ],
      channels: [{ channel: "string", rationale: "string", tactics: ["string"] }],
      roadmap: [
        {
          key: "30|60|90|annual",
          title: "string",
          objectives: ["string"],
          activities: ["string"],
          kpis: ["string"],
        },
      ],
    }),
    "Include exactly four roadmap entries with keys 30, 60, 90, annual.",
    "Keep claims verifiable; no invented discounts or guarantees.",
    "",
    `Company: ${company.name}`,
    buildBusinessProfileAiContext(company),
    `Package: ${fallback.packageName}`,
    `Channels: ${fallback.channels.map((c) => c.channel).join(", ")}`,
  ].join("\n");

  const raw = await guardedClaudeCall({
    tenantId: company.tenantId,
    companyId: company.id,
    companyName: company.name,
    system,
    user: `Write Marketing Strategy v${fallback.version} for ${company.name}.`,
    maxTokens: 3500,
  });
  if (!raw) return null;
  return parseClaudeStrategy(raw, fallback);
}

export function strategySummaryFromDetailed(doc: DetailedMarketingStrategy): string {
  return doc.executiveSummary;
}

export function strategyChannelPlanFromDetailed(doc: DetailedMarketingStrategy): string {
  return doc.channels
    .map((c) => `${c.channel}: ${c.tactics.slice(0, 3).join("; ")}`)
    .join(" · ");
}

/** Push current detailed strategy into history and return capped list. */
export function pushStrategyHistory(
  current: DetailedMarketingStrategy | undefined,
  history: DetailedMarketingStrategy[] | undefined,
): DetailedMarketingStrategy[] {
  if (!current) return history?.slice(0, HISTORY_CAP) ?? [];
  return [current, ...(history ?? [])].slice(0, HISTORY_CAP);
}

export function findStrategyVersion(
  current: DetailedMarketingStrategy | undefined,
  history: DetailedMarketingStrategy[] | undefined,
  version: number,
): DetailedMarketingStrategy | null {
  if (current?.version === version) return current;
  return history?.find((h) => h.version === version) ?? null;
}

export function listStrategyVersions(
  current: DetailedMarketingStrategy | undefined,
  history: DetailedMarketingStrategy[] | undefined,
): DetailedMarketingStrategy[] {
  const all = [...(current ? [current] : []), ...(history ?? [])];
  const byVersion = new Map<number, DetailedMarketingStrategy>();
  for (const s of all) {
    if (!byVersion.has(s.version)) byVersion.set(s.version, s);
  }
  return [...byVersion.values()].sort((a, b) => b.version - a.version);
}

/**
 * Initial strategy document status from service level.
 * Approval-only packages stay agency-held (`draft`) until submit → client_review.
 * Managed levels go straight to client_review as designed.
 */
export function initialDetailedStrategyStatus(
  serviceLevel: ManagedServiceLevel,
): DetailedStrategyStatus {
  return serviceLevel === "approval" ? "draft" : "client_review";
}

/**
 * Generate a detailed Marketing Strategy vN document.
 * Always returns structured sections (template fallback if Claude unavailable).
 */
export async function generateDetailedMarketingStrategy(args: {
  company: Company;
  pkg: ResolvedCompanyPackage;
  /** Builder-facing channel labels (Instagram, Facebook, …). */
  channels: string[];
  version: number;
  /** Default: client_review so the approval lifecycle matches the detailed UI. */
  status?: DetailedStrategyStatus;
}): Promise<DetailedMarketingStrategy> {
  const status = args.status ?? "client_review";
  const fallback = templateStrategy({
    company: args.company,
    pkg: args.pkg,
    channels: args.channels,
    version: args.version,
    status,
  });
  const ai = await claudeDetailedStrategy(args.company, fallback);
  return ai ?? fallback;
}

/**
 * If managed delivery already stamped a thin summary but no detailed doc,
 * materialise a structured v1 (template; Claude optional) so Strategy pages
 * match the full document UX without re-running the whole pipeline.
 */
export function backfillDetailedStrategyFromThin(args: {
  company: Company;
  pkg: ResolvedCompanyPackage;
  channels: string[];
  version?: number;
}): DetailedMarketingStrategy | null {
  const ms = args.company.profile.managedService;
  if (!ms) return null;
  if (ms.detailedStrategy) return null;
  if (!ms.strategySummary && !ms.strategyCompletedAt) return null;

  const version = args.version && args.version > 0 ? args.version : 1;
  const doc = templateStrategy({
    company: args.company,
    pkg: args.pkg,
    channels: args.channels,
    version,
    status: "client_review",
  });
  // Prefer the existing executive summary text when present.
  if (ms.strategySummary?.trim()) {
    doc.executiveSummary = ms.strategySummary.trim();
  }
  return doc;
}
