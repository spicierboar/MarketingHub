// Self-test helpers for W2 live ads execution (Module 6).

import {
  adsConfigured,
  adsLive,
  dispatchCampaignSync,
  translateTargeting,
} from "@/lib/ad-connectors";
import { encryptToken } from "@/lib/crypto";
import { resolveCampaignMetrics, campaignMetrics } from "@/lib/paid";
import { emptyTargeting } from "@/lib/targeting";
import type { AdAccount, AdCampaign, Company } from "@/lib/types";

export function stubAdsCompany(): Company {
  return {
    id: "co_ads_stub",
    tenantId: "tn_stub",
    name: "Stub Dental",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "Dentist",
      serviceAreas: ["CBD"],
      services: ["Check-up"],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
  } as Company;
}

export function stubAdsAccount(companyId: string): AdAccount {
  const t = new Date().toISOString();
  return {
    id: "aa_stub",
    companyId,
    platform: "meta_ads",
    accountName: "Stub Meta",
    externalAccountId: "act_123456789",
    encryptedToken: encryptToken("stub-ad-token"),
    tokenLastFour: "oken",
    status: "connected",
    connectedById: "u_stub",
    connectedAt: t,
    updatedAt: t,
  };
}

export function stubAdsCampaign(companyId: string, accountId: string): AdCampaign {
  const t = new Date().toISOString();
  return {
    id: "adc_stub",
    companyId,
    adAccountId: accountId,
    platform: "meta_ads",
    name: "Stub leads campaign",
    objective: "leads",
    dailyBudgetUsd: 25,
    status: "active",
    startDate: "2026-07-01",
    createdById: "u_stub",
    createdAt: t,
    updatedAt: t,
  };
}

export async function checkLiveAdsSimulatedWhenOff(): Promise<{ ok: boolean; detail: string }> {
  const live = adsLive();
  const configured = adsConfigured();
  const company = stubAdsCompany();
  const account = stubAdsAccount(company.id);
  const campaign = stubAdsCampaign(company.id, account.id);
  const resolved = await resolveCampaignMetrics(campaign, company, account);
  const sim = campaignMetrics(campaign, company);
  const ok = !live && !configured && resolved.spendUsd === sim.spendUsd;
  return { ok, detail: `live=${live} configured=${configured} spend=${resolved.spendUsd}` };
}

export async function checkLiveAdsDispatchNullWhenOff(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAdsCompany();
  const account = stubAdsAccount(company.id);
  const campaign = stubAdsCampaign(company.id, account.id);
  const result = await dispatchCampaignSync({
    account,
    campaign,
    targeting: emptyTargeting(),
    op: "create",
  });
  const ok = !adsConfigured() && result === null;
  return { ok, detail: `configured=${adsConfigured()} result=${result === null ? "null" : "handled"}` };
}

export function checkLiveAdsTranslateMeta(): { ok: boolean; detail: string } {
  const t = emptyTargeting();
  t.interests = ["Dentistry"];
  t.locations = [{ kind: "city", value: "Sydney" }];
  const payload = translateTargeting("meta_ads", t);
  const ok =
    typeof payload.geo_locations === "object" &&
    Array.isArray(payload.interests) &&
    payload.age_min === t.ageMin;
  return { ok, detail: `keys=${Object.keys(payload).join(",")}` };
}

export function checkLiveAdsTranslateGoogle(): { ok: boolean; detail: string } {
  const t = emptyTargeting();
  t.languages = ["en"];
  const payload = translateTargeting("google_ads", t);
  const ok = Array.isArray(payload.geoTargets) && Array.isArray(payload.languages);
  return { ok, detail: `geo=${(payload.geoTargets as unknown[]).length} langs=${(payload.languages as unknown[]).length}` };
}

export async function checkLiveAdsResolveFallsBack(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAdsCompany();
  const campaign = stubAdsCampaign(company.id, "aa_stub");
  const withoutAccount = await resolveCampaignMetrics(campaign, company);
  const sim = campaignMetrics(campaign, company);
  const ok = withoutAccount.spendUsd === sim.spendUsd && withoutAccount.leads === sim.leads;
  return { ok, detail: `spend=${withoutAccount.spendUsd} leads=${withoutAccount.leads}` };
}