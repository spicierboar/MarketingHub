// Self-test helpers for V1 AI campaign builder (Module 7).

import {
  buildCampaignFromGoal,
  spawnedContentNotScheduled,
  spawnGovernedDraftForItem,
  unpackKeyMessage,
} from "@/lib/ai/campaign-builder";
import {
  createCampaign,
  createCampaignItem,
  getContent,
  listCampaignItems,
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
