// W5 M43 — Campaign builder facade: re-exports core engine + persistence orchestration.
// Draft-only: spawnGovernedDraftForItem never schedules; draft schedule rows are
// proposals only — they do not create scheduled_posts until approval gates pass.

export {
  buildCampaignFromGoal,
  packKeyMessage,
  spawnGovernedDraftForItem,
  spawnedContentNotScheduled,
  templateSpawnBody,
  unpackKeyMessage,
  type CampaignBuilderInput,
  type CampaignBuilderMeta,
  type CampaignBuilderResult,
} from "@/lib/ai/campaign-builder";

import {
  buildCampaignFromGoal,
  spawnGovernedDraftForItem,
  unpackKeyMessage,
  type CampaignBuilderInput,
  type CampaignBuilderResult,
} from "@/lib/ai/campaign-builder";
import type { PlannedItem } from "@/lib/ai/campaign";
import {
  createCampaign,
  createCampaignBuilderRun,
  createCampaignDraftScheduleItem,
  createCampaignItem,
  createCampaignPlanVersion,
  listCampaignPlanVersions,
  listScheduledPosts,
} from "@/lib/db";
import { campaignBuilderMode } from "@/lib/campaign-builder-connectors";
import type {
  Campaign,
  CampaignBuilderRun,
  CampaignDraftScheduleItem,
  CampaignPlanVersion,
  Company,
  Offer,
} from "@/lib/types";

export const SUPPORTED_BUILDER_CHANNELS = [
  "Facebook",
  "Instagram",
  "Google Business Profile",
  "Email",
  "Paid ads",
] as const;

export function normalizeBuilderChannels(channels?: string[]): string[] {
  const allowed = new Set<string>(SUPPORTED_BUILDER_CHANNELS);
  const picked = (channels ?? []).filter((c) => allowed.has(c));
  return picked.length > 0 ? picked : ["Facebook", "Instagram", "Google Business Profile"];
}

export function defaultScheduledTime(channel: string): string {
  const c = channel.toLowerCase();
  if (c === "email") return "09:00";
  if (c === "paid ads") return "10:00";
  return "11:00";
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildDraftScheduleDrafts(args: {
  campaignId: string;
  companyId: string;
  startDate: string;
  items: PlannedItem[];
  campaignItemLinks: Array<{ campaignItemId: string; contentId?: string | null }>;
  planVersionId?: string | null;
  createdById: string;
}): Omit<CampaignDraftScheduleItem, "id" | "createdAt">[] {
  return args.items.map((item, idx) => ({
    campaignId: args.campaignId,
    companyId: args.companyId,
    campaignItemId: args.campaignItemLinks[idx]?.campaignItemId ?? null,
    contentId: args.campaignItemLinks[idx]?.contentId ?? null,
    planVersionId: args.planVersionId ?? null,
    scheduledDate: addDays(args.startDate, item.dayOffset - 1),
    scheduledTime: defaultScheduledTime(item.channel),
    platform: item.channel,
    title: item.title,
    status: "draft" as const,
    createdById: args.createdById,
  }));
}

export async function draftSchedulesNotLivePublished(
  tenantId: string,
  draftScheduleContentIds: string[],
): Promise<boolean> {
  if (draftScheduleContentIds.length === 0) return true;
  const scheduled = await listScheduledPosts(tenantId);
  const idSet = new Set(draftScheduleContentIds.filter(Boolean));
  return !scheduled.some((p) => idSet.has(p.contentId));
}

export interface ExecuteCampaignBuilderArgs {
  input: CampaignBuilderInput;
  userId: string;
  audience?: string;
  durationDays: 30 | 90;
  channels: string[];
  offer?: Offer | null;
  aiRunId?: string | null;
}

export interface ExecuteCampaignBuilderResult {
  campaign: Campaign;
  result: CampaignBuilderResult;
  planVersion: CampaignPlanVersion;
  builderRun: CampaignBuilderRun;
  draftSchedules: CampaignDraftScheduleItem[];
  spawnedContentIds: string[];
}

export async function executeCampaignBuilder(
  args: ExecuteCampaignBuilderArgs,
): Promise<ExecuteCampaignBuilderResult> {
  const { input, userId } = args;
  const company = input.company;
  const channels = normalizeBuilderChannels(args.channels.length ? args.channels : input.channels);
  const durationDays = args.durationDays ?? input.durationDays ?? 30;

  const result = await buildCampaignFromGoal({
    ...input,
    channels,
    durationDays,
  });
  const { strategy } = unpackKeyMessage(result.keyMessage);
  const mode = campaignBuilderMode();

  const campaign = await createCampaign({
    companyId: company.id,
    name: `${input.goal.slice(0, 56)} (goal plan)`,
    objective: result.objective,
    audience: args.audience || company.profile.targetCustomers,
    serviceFocus: result.channelPlan.slice(0, 200),
    channels,
    durationDays,
    startDate: input.startDate,
    offerId: args.offer?.id ?? null,
    keyMessage: result.keyMessage,
    status: "draft",
    requestId: null,
    createdById: userId,
    approvedById: null,
    approvedAt: null,
  });

  const priorVersions = await listCampaignPlanVersions(campaign.id);
  const planVersion = await createCampaignPlanVersion({
    campaignId: campaign.id,
    companyId: company.id,
    versionNumber: priorVersions.length + 1,
    goal: input.goal,
    objective: result.objective,
    strategy,
    channelPlan: result.channelPlan,
    kpis: result.kpis,
    riskWarnings: result.riskWarnings,
    channels,
    itemCount: result.items.length,
    model: result.model,
    createdById: userId,
  });

  const spawnedContentIds: string[] = [];
  const campaignItemLinks: Array<{ campaignItemId: string; contentId?: string | null }> = [];

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
      userId,
    });
    spawnedContentIds.push(contentId);
    campaignItemLinks.push({ campaignItemId: campaignItem.id, contentId });
  }

  const draftDrafts = buildDraftScheduleDrafts({
    campaignId: campaign.id,
    companyId: company.id,
    startDate: input.startDate,
    items: result.items,
    campaignItemLinks,
    planVersionId: planVersion.id,
    createdById: userId,
  });

  const draftSchedules: CampaignDraftScheduleItem[] = [];
  for (const draft of draftDrafts) {
    draftSchedules.push(await createCampaignDraftScheduleItem(draft));
  }

  const builderRun = await createCampaignBuilderRun({
    companyId: company.id,
    campaignId: campaign.id,
    planVersionId: planVersion.id,
    goal: input.goal,
    status: mode === "live" ? "completed" : "simulated",
    mode,
    model: result.model,
    spawnedContentCount: spawnedContentIds.length,
    draftScheduleCount: draftSchedules.length,
    aiRunId: args.aiRunId ?? null,
    createdById: userId,
  });

  return {
    campaign,
    result,
    planVersion,
    builderRun,
    draftSchedules,
    spawnedContentIds,
  };
}

export function multiChannelPlanCoversChannels(
  items: PlannedItem[],
  channels: string[],
): boolean {
  const itemChannels = new Set(items.map((i) => i.channel));
  return channels.every((c) => itemChannels.has(c));
}

export function companyForBuilderTests(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_cb",
    tenantId: "tn_cb",
    name: "Weekday Bistro",
    status: "ai_ready",
    createdBy: "u_cb",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      serviceAreas: ["Wattle Valley"],
      services: ["Lunch", "Dinner"],
      callsToAction: ["Book a table"],
      prohibitedClaims: ["Best in Australia"],
      approvedClaims: ["Family-owned since 2010"],
      requiredDisclaimers: [],
      industry: "restaurant",
      targetCustomers: "Local families and professionals",
      brandVoice: "Warm and welcoming",
    },
    documents: [],
    ...overrides,
  } as Company;
}
