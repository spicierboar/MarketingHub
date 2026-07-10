// Self-test helpers for V1 AI campaign builder (Module 7) + W5 M43 orchestration.

import {
  buildCampaignFromGoal,
  MULTI_CHANNEL_OPTIONS,
  spawnedContentNotScheduled,
  spawnGovernedDraftForItem,
  unpackKeyMessage,
} from "@/lib/ai/campaign-builder";
import {
  campaignBuilderLive,
  campaignBuilderMode,
} from "@/lib/campaign-builder-connectors";
import {
  companyForBuilderTests,
  draftSchedulesNotLivePublished,
  executeCampaignBuilder,
  multiChannelPlanCoversChannels,
} from "@/lib/campaign-builder";
import {
  createCampaign,
  createCampaignItem,
  getContent,
  listCampaignBuilderRuns,
  listCampaignDraftScheduleItems,
  listCampaignItems,
  listCampaignPlanVersions,
} from "@/lib/db";
import type { Company } from "@/lib/types";

export function stubCampaignCompany(overrides: Partial<Company> = {}): Company {
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

export async function checkCampaignBuilderGoalProducesPlan(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCampaignCompany();
  const result = await buildCampaignFromGoal({
    company,
    goal: "I want more weekday customers",
    startDate: "2026-08-01",
  });
  const ok =
    result.items.length >= 5 &&
    result.strategy.length > 20 &&
    result.channelPlan.length > 10;
  return {
    ok,
    detail: `items=${result.items.length} strategyLen=${result.strategy.length}`,
  };
}

export async function checkCampaignBuilderKpisPresent(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCampaignCompany();
  const result = await buildCampaignFromGoal({
    company,
    goal: "Drive direct bookings",
    startDate: "2026-08-01",
  });
  const unpacked = unpackKeyMessage(result.keyMessage);
  const ok =
    result.kpis.length >= 3 &&
    (unpacked.meta?.kpis?.length ?? 0) >= 3 &&
    unpacked.strategy.length > 10;
  return {
    ok,
    detail: `kpis=${result.kpis.length} packed=${unpacked.meta?.kpis?.length ?? 0}`,
  };
}

export async function checkCampaignBuilderSpawnsDraftContentNotScheduled(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const company = stubCampaignCompany({ id: companyId, tenantId });
  const result = await buildCampaignFromGoal({
    company,
    goal: "Get more Google reviews",
    startDate: "2026-08-01",
  });
  const { strategy } = unpackKeyMessage(result.keyMessage);

  const campaign = await createCampaign({
    companyId,
    name: "Self-test goal campaign",
    objective: result.objective,
    channels: ["Facebook", "Instagram"],
    durationDays: 30,
    startDate: "2026-08-01",
    keyMessage: result.keyMessage,
    status: "draft",
    createdById: userId,
    approvedById: null,
    approvedAt: null,
  });

  const contentIds: string[] = [];
  for (const item of result.items.slice(0, 2)) {
    const campaignItem = await createCampaignItem({
      campaignId: campaign.id,
      companyId,
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
      strategy,
      campaignItem,
      userId,
    });
    contentIds.push(contentId);
  }

  const items = await listCampaignItems(campaign.id);
  const allDrafted = items.every(
    (i) => i.status === "drafted" && i.contentId,
  );
  const contentsOk = (
    await Promise.all(contentIds.map((id) => getContent(id)))
  ).every((c) => c?.status === "ai_draft");
  const notScheduled = await spawnedContentNotScheduled(tenantId, contentIds);

  const ok = allDrafted && contentsOk && notScheduled;
  return {
    ok,
    detail: `drafted=${allDrafted} ai_draft=${contentsOk} notScheduled=${notScheduled}`,
  };
}

export async function checkCampaignBuilderSimulatedWhenLiveOff(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const ok = !campaignBuilderLive() && campaignBuilderMode() === "simulated";
  return { ok, detail: `live=${campaignBuilderLive()} mode=${campaignBuilderMode()}` };
}

export async function checkCampaignBuilderMultiChannelOptions(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const ok =
    MULTI_CHANNEL_OPTIONS.length >= 5 &&
    MULTI_CHANNEL_OPTIONS.includes("Email") &&
    MULTI_CHANNEL_OPTIONS.includes("Paid ads");
  return { ok, detail: `options=${MULTI_CHANNEL_OPTIONS.join(",")}` };
}

export async function checkCampaignBuilderGeneralGoalIncludesEmail(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCampaignCompany();
  const result = await buildCampaignFromGoal({
    company,
    goal: "Grow local brand awareness this quarter",
    startDate: "2026-08-01",
    channels: [...MULTI_CHANNEL_OPTIONS],
  });
  const channels = new Set(result.items.map((i) => i.channel));
  const ok = channels.has("Email");
  return { ok, detail: `itemChannels=${[...channels].join(",")}` };
}

export async function checkCampaignBuilderMultiChannelPlan(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCampaignCompany();
  const channels = ["Facebook", "Instagram", "Email"];
  const result = await buildCampaignFromGoal({
    company,
    goal: "I want more weekday customers",
    startDate: "2026-08-01",
    channels,
  });
  const ok = multiChannelPlanCoversChannels(result.items, channels);
  return {
    ok,
    detail: `covers=${ok} items=${result.items.length}`,
  };
}

export async function checkCampaignBuilderRiskWarningsPresent(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCampaignCompany();
  const result = await buildCampaignFromGoal({
    company,
    goal: "Drive direct bookings",
    startDate: "2026-08-01",
  });
  const ok = result.riskWarnings.length > 0;
  return { ok, detail: `warnings=${result.riskWarnings.length}` };
}

export async function checkCampaignBuilderDraftScheduleNotLive(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const company = companyForBuilderTests({ id: companyId, tenantId });
  const exec = await executeCampaignBuilder({
    input: { company, goal: "Get more Google reviews", startDate: "2026-08-01" },
    userId,
    durationDays: 30,
    channels: ["Facebook", "Instagram", "Google Business Profile"],
  });
  const contentIds = exec.draftSchedules
    .map((d) => d.contentId)
    .filter((id): id is string => !!id);
  const allDraft = exec.draftSchedules.every((d) => d.status === "draft");
  const notLive = await draftSchedulesNotLivePublished(tenantId, contentIds);
  const ok = allDraft && notLive && exec.draftSchedules.length > 0;
  return {
    ok,
    detail: `drafts=${exec.draftSchedules.length} allDraft=${allDraft} notLive=${notLive}`,
  };
}

export async function checkCampaignBuilderPlanVersionPersisted(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const company = companyForBuilderTests({ id: companyId, tenantId });
  const exec = await executeCampaignBuilder({
    input: { company, goal: "I want more weekday customers", startDate: "2026-08-01" },
    userId,
    durationDays: 30,
    channels: ["Facebook", "Instagram"],
  });
  const versions = await listCampaignPlanVersions(exec.campaign.id);
  const latest = versions[versions.length - 1];
  const ok =
    versions.length >= 1 &&
    latest?.goal === "I want more weekday customers" &&
    (latest?.kpis.length ?? 0) >= 3;
  return { ok, detail: `versions=${versions.length} kpis=${latest?.kpis.length ?? 0}` };
}

export async function checkCampaignBuilderRunRecorded(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const company = companyForBuilderTests({ id: companyId, tenantId });
  const exec = await executeCampaignBuilder({
    input: { company, goal: "Drive direct bookings", startDate: "2026-08-01" },
    userId,
    durationDays: 30,
    channels: ["Facebook", "Instagram", "Email"],
  });
  const runs = await listCampaignBuilderRuns(companyId);
  const run = runs.find((r) => r.id === exec.builderRun.id);
  const ok =
    !!run &&
    run.campaignId === exec.campaign.id &&
    run.spawnedContentCount === exec.spawnedContentIds.length &&
    run.mode === campaignBuilderMode();
  return {
    ok,
    detail: `run=${run?.id ?? "missing"} mode=${run?.mode ?? "n/a"}`,
  };
}

export async function checkCampaignBuilderExecuteOrchestration(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const company = companyForBuilderTests({ id: companyId, tenantId });
  const exec = await executeCampaignBuilder({
    input: { company, goal: "Get more Google reviews", startDate: "2026-08-01" },
    userId,
    durationDays: 30,
    channels: ["Google Business Profile", "Facebook"],
  });
  const items = await listCampaignItems(exec.campaign.id);
  const schedules = await listCampaignDraftScheduleItems(exec.campaign.id);
  const notScheduled = await spawnedContentNotScheduled(tenantId, exec.spawnedContentIds);
  const ok =
    exec.campaign.status === "draft" &&
    items.length === exec.result.items.length &&
    schedules.length === exec.result.items.length &&
    exec.spawnedContentIds.length === exec.result.items.length &&
    notScheduled;
  return {
    ok,
    detail: `items=${items.length} schedules=${schedules.length} notScheduled=${notScheduled}`,
  };
}
