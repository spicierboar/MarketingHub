// Ad-platform connectors (production drop-in for the delegated paid module).
//
// Two live capabilities sit behind the heaviest external gate — the Google Ads
// API (developer token + access) and the Meta Marketing API (ads_management +
// Business Verification):
//   1. CAMPAIGN EXECUTION — create/pause/adjust campaigns on the client's OWN
//      delegated ad account (decryptToken(adAccount.encryptedToken) -> the
//      platform SDK). Their card is billed by the platform; we never front spend.
//   2. LEAD INGESTION — Meta Lead Ads + Google lead-form webhooks POST new
//      leads; we resolve the company from the delegated ad account's external
//      id and createLead() for attribution. Route:
//      POST /api/ads/leads/webhook?platform=meta_ads|google_ads (ADS_LIVE +
//      per-platform signature verification — see src/lib/ad-leads.ts).
//
// Until those approvals land, ADS_LIVE is unset and everything is simulated:
// campaign performance via src/lib/paid.ts (seeded), and leads recorded manually
// by an admin (recordLeadAction). This mirrors publishingLive()/analyticsLive().

import { decryptToken } from "@/lib/crypto";
import type {
  AdAccount,
  AdCampaign,
  AdCampaignObjective,
  AdPlatform,
  AdTargeting,
} from "@/lib/types";

export function adsLive(): boolean {
  return process.env.ADS_LIVE === "true";
}

export function adsPlatformConfigured(): boolean {
  const google =
    !!process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
    !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const meta = !!process.env.META_APP_ID?.trim() && !!process.env.META_APP_SECRET?.trim();
  return google || meta;
}

export function adsConfigured(): boolean {
  return (
    adsLive() &&
    !!process.env.PUBLISHING_TOKEN_KEY?.trim() &&
    adsPlatformConfigured()
  );
}

export interface AdConnectorResult {
  ok: boolean;
  detail: string;
  externalCampaignId?: string;
}

export type CampaignLifecycleOp = "create" | "activate" | "pause" | "end";

export interface LivePaidMetrics {
  spendUsd: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpcUsd: number | null;
  cplUsd: number | null;
  ctr: number;
  revenueUsd: number;
  roas: number | null;
}

function microsToUsd(micros: number): number {
  return Math.round((micros / 1_000_000) * 100) / 100;
}

function metaAccountPath(externalAccountId: string): string {
  const raw = externalAccountId.trim();
  return raw.startsWith("act_") ? raw : `act_${raw.replace(/\D/g, "")}`;
}

function googleCustomerId(externalAccountId: string): string {
  return externalAccountId.replace(/\D/g, "");
}

function metaObjective(objective: AdCampaignObjective): string {
  switch (objective) {
    case "leads":
      return "OUTCOME_LEADS";
    case "traffic":
      return "LINK_CLICKS";
    case "awareness":
      return "OUTCOME_AWARENESS";
    case "sales":
      return "OUTCOME_SALES";
  }
}

function googleCampaignType(objective: AdCampaignObjective): string {
  switch (objective) {
    case "awareness":
      return "DISPLAY";
    case "sales":
      return "PERFORMANCE_MAX";
    default:
      return "SEARCH";
  }
}

export function translateTargeting(
  platform: AdPlatform,
  targeting: AdTargeting,
): Record<string, unknown> {
  if (platform === "meta_ads") {
    const geo = targeting.locations
      .filter((l) => !l.exclude)
      .map((l) => ({ type: l.kind, value: l.value, radiusKm: l.radiusKm }));
    return {
      geo_locations: geo,
      age_min: targeting.ageMin,
      age_max: targeting.ageMax,
      genders:
        targeting.gender === "all" ? [0] : targeting.gender === "male" ? [1] : [2],
      interests: targeting.interests.map((name) => ({ name })),
      custom_audiences: targeting.customAudiences.map((name) => ({ name })),
      excluded_interests: targeting.exclusions,
      device_platforms:
        targeting.devices === "all"
          ? ["mobile", "desktop"]
          : [targeting.devices === "tablet" ? "mobile" : targeting.devices],
      publisher_platforms: targeting.placements.length ? targeting.placements : undefined,
    };
  }
  const locations = targeting.locations.map((l) => ({
    kind: l.kind,
    value: l.value,
    exclude: !!l.exclude,
    radiusKm: l.radiusKm,
  }));
  return {
    geoTargets: locations,
    ageRange: { min: targeting.ageMin, max: targeting.ageMax },
    genders: targeting.gender === "all" ? [] : [targeting.gender],
    languages: targeting.languages,
    affinitySegments: targeting.interests,
    customAudiences: targeting.customAudiences,
    exclusions: targeting.exclusions,
    devices: targeting.devices,
    placements: targeting.placements,
  };
}

export async function dispatchCampaignSync(args: {
  account: AdAccount;
  campaign: AdCampaign;
  targeting?: AdTargeting;
  op: CampaignLifecycleOp;
}): Promise<AdConnectorResult | null> {
  if (!adsConfigured()) return null;
  let token: string;
  try {
    token = decryptToken(args.account.encryptedToken);
  } catch {
    return { ok: false, detail: "Could not decrypt the stored ad token (rotate PUBLISHING_TOKEN_KEY?)" };
  }
  try {
    if (args.account.platform === "meta_ads") {
      return await syncMetaCampaign(args, token);
    }
    if (args.account.platform === "google_ads") {
      return await syncGoogleCampaign(args, token);
    }
  } catch (err) {
    return { ok: false, detail: `Platform API error: ${String(err)}` };
  }
  return null;
}

export async function fetchLiveCampaignMetrics(
  account: AdAccount,
  campaign: AdCampaign,
): Promise<LivePaidMetrics | null> {
  if (!adsConfigured() || !campaign.externalCampaignId) return null;
  let token: string;
  try {
    token = decryptToken(account.encryptedToken);
  } catch {
    return null;
  }
  try {
    if (account.platform === "meta_ads") {
      return await metaCampaignInsights(token, campaign.externalCampaignId);
    }
    if (account.platform === "google_ads") {
      return await googleCampaignMetrics(
        token,
        account.externalAccountId,
        campaign.externalCampaignId,
      );
    }
  } catch {
    return null;
  }
  return null;
}

async function syncMetaCampaign(
  args: {
    account: AdAccount;
    campaign: AdCampaign;
    targeting?: AdTargeting;
    op: CampaignLifecycleOp;
  },
  token: string,
): Promise<AdConnectorResult> {
  const act = metaAccountPath(args.account.externalAccountId);
  const externalId = args.campaign.externalCampaignId;

  if (args.op === "create") {
    const body: Record<string, unknown> = {
      name: args.campaign.name,
      objective: metaObjective(args.campaign.objective),
      status: "PAUSED",
      special_ad_categories: "[]",
      access_token: token,
      daily_budget: Math.round(args.campaign.dailyBudgetUsd * 100),
    };
    if (args.targeting) {
      body.targeting = translateTargeting("meta_ads", args.targeting);
    }
    const res = await fetch(`https://graph.facebook.com/v21.0/${act}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || json.error || !json.id) {
      return { ok: false, detail: `Meta: ${json.error?.message ?? res.statusText}` };
    }
    return { ok: true, detail: `Meta campaign created (${json.id})`, externalCampaignId: json.id };
  }

  if (!externalId) {
    return { ok: false, detail: "Meta: no platform campaign id — create on platform first" };
  }

  const status =
    args.op === "activate" ? "ACTIVE" : args.op === "pause" || args.op === "end" ? "PAUSED" : "PAUSED";
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(externalId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok || json.error) {
    return { ok: false, detail: `Meta: ${json.error?.message ?? res.statusText}` };
  }
  return { ok: true, detail: `Meta campaign -> ${status}`, externalCampaignId: externalId };
}

async function syncGoogleCampaign(
  args: {
    account: AdAccount;
    campaign: AdCampaign;
    targeting?: AdTargeting;
    op: CampaignLifecycleOp;
  },
  token: string,
): Promise<AdConnectorResult> {
  const customerId = googleCustomerId(args.account.externalAccountId);
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!devToken) return { ok: false, detail: "GOOGLE_ADS_DEVELOPER_TOKEN not configured" };

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const base = `https://googleads.googleapis.com/v17/customers/${customerId}`;

  if (args.op === "create") {
    const budgetRes = await fetch(`${base}/campaignBudgets:mutate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: `${args.campaign.name} budget`,
              amountMicros: String(Math.round(args.campaign.dailyBudgetUsd * 1_000_000)),
              deliveryMethod: "STANDARD",
              explicitlyShared: false,
            },
          },
        ],
      }),
    });
    const budgetJson = (await budgetRes.json().catch(() => ({}))) as {
      results?: { resourceName?: string }[];
      error?: { message?: string };
    };
    if (!budgetRes.ok || budgetJson.error) {
      return { ok: false, detail: `Google Ads: ${budgetJson.error?.message ?? budgetRes.statusText}` };
    }
    const budgetResource = budgetJson.results?.[0]?.resourceName;
    if (!budgetResource) return { ok: false, detail: "Google Ads: budget create returned no resource" };

    const campaignBody: Record<string, unknown> = {
      name: args.campaign.name,
      advertisingChannelType: googleCampaignType(args.campaign.objective),
      status: "PAUSED",
      campaignBudget: budgetResource,
      manualCpc: {},
    };
    if (args.targeting) {
      campaignBody.targeting = translateTargeting("google_ads", args.targeting);
    }

    const res = await fetch(`${base}/campaigns:mutate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ operations: [{ create: campaignBody }] }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      results?: { resourceName?: string }[];
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      return { ok: false, detail: `Google Ads: ${json.error?.message ?? res.statusText}` };
    }
    const resource = json.results?.[0]?.resourceName ?? "";
    const platformId = resource.split("/").pop() ?? resource;
    if (!platformId) return { ok: false, detail: "Google Ads: campaign create returned no id" };
    return { ok: true, detail: `Google Ads campaign created (${platformId})`, externalCampaignId: platformId };
  }

  const externalId = args.campaign.externalCampaignId;
  if (!externalId) {
    return { ok: false, detail: "Google Ads: no platform campaign id — create on platform first" };
  }

  const status =
    args.op === "activate" ? "ENABLED" : args.op === "pause" || args.op === "end" ? "PAUSED" : "PAUSED";
  const resourceName = `customers/${customerId}/campaigns/${externalId}`;
  const res = await fetch(`${base}/campaigns:mutate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      operations: [{ update: { resourceName, status }, updateMask: "status" }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok || json.error) {
    return { ok: false, detail: `Google Ads: ${json.error?.message ?? res.statusText}` };
  }
  return { ok: true, detail: `Google Ads campaign -> ${status}`, externalCampaignId: externalId };
}

async function metaCampaignInsights(token: string, externalCampaignId: string): Promise<LivePaidMetrics | null> {
  const fields = "spend,impressions,clicks,actions";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(externalCampaignId)}/insights?fields=${fields}&date_preset=last_30d&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    data?: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[];
  } | null;
  const row = json?.data?.[0];
  if (!row) return null;
  const spendUsd = Number(row.spend ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const leads = (row.actions ?? [])
    .filter((a) => /lead/i.test(a.action_type))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
  return {
    spendUsd,
    impressions,
    clicks,
    leads,
    cpcUsd: clicks ? spendUsd / clicks : null,
    cplUsd: leads ? spendUsd / leads : null,
    ctr: impressions ? clicks / impressions : 0,
    revenueUsd: 0,
    roas: null,
  };
}

async function googleCampaignMetrics(
  token: string,
  externalAccountId: string,
  externalCampaignId: string,
): Promise<LivePaidMetrics | null> {
  const customerId = googleCustomerId(externalAccountId);
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!devToken) return null;
  const query = [
    "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions",
    "FROM campaign",
    `WHERE campaign.id = ${externalCampaignId.replace(/\D/g, "")}`,
    "AND segments.date DURING LAST_30_DAYS",
  ].join(" ");
  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "developer-token": devToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    results?: { metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number } }[];
  } | null;
  let spendMicros = 0;
  let impressions = 0;
  let clicks = 0;
  let leads = 0;
  for (const row of json?.results ?? []) {
    const m = row.metrics;
    if (!m) continue;
    spendMicros += Number(m.costMicros ?? 0);
    impressions += Number(m.impressions ?? 0);
    clicks += Number(m.clicks ?? 0);
    leads += Number(m.conversions ?? 0);
  }
  const spendUsd = microsToUsd(spendMicros);
  return {
    spendUsd,
    impressions,
    clicks,
    leads,
    cpcUsd: clicks ? spendUsd / clicks : null,
    cplUsd: leads ? spendUsd / leads : null,
    ctr: impressions ? clicks / impressions : 0,
    revenueUsd: 0,
    roas: null,
  };
}
