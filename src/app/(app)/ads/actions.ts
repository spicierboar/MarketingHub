"use server";

import { revalidatePath } from "next/cache";
import {
  createAdAccount,
  createAdCampaign,
  createAudienceSegment,
  createLead,
  deleteAudienceSegment,
  findConnectedAdAccount,
  getAdAccount,
  getAdBudget,
  getAdCampaign,
  getAudienceSegment,
  getCompany,
  getLocalProfile,
  getTenant,
  listAdCampaigns,
  listCompanies,
  listLeads,
  updateAdAccount,
  updateAdCampaign,
  updateAudienceSegment,
  upsertAdBudget,
} from "@/lib/db";
import {
  assertAdminCompanyAccess,
  canAccessCompany,
  requireAdmin,
  requireTenantOwner,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { encryptToken } from "@/lib/crypto";
import { recommendAllocation } from "@/lib/ai/allocation";
import {
  adsLive,
  dispatchCampaignSync,
  type CampaignLifecycleOp,
} from "@/lib/ad-connectors";
import { companyPaidSummary } from "@/lib/paid";
import { createManagementFeeInvoice } from "@/lib/billing";
import { normaliseTargeting, suggestTargeting } from "@/lib/targeting";
import { AD_PLATFORMS } from "@/lib/types";
import type {
  AdCampaignObjective,
  AdPlatform,
  AdTargeting,
  AudienceSegment,
  DeviceTarget,
  FeeModel,
  Gender,
  GeoTarget,
} from "@/lib/types";

const AD_PLATFORM_KEYS = new Set<string>(AD_PLATFORMS.map((p) => p.key));
const OBJECTIVES = new Set<string>(["leads", "traffic", "awareness", "sales"]);
const SEGMENT_PLATFORMS = new Set<string>(["all", ...AD_PLATFORMS.map((p) => p.key)]);

// Validate a form-supplied audienceSegmentId for a campaign: it must belong to
// the same company AND be platform-compatible ("all" or the campaign's
// platform). Anything else → null (broad/untargeted), never a cross-company or
// mismatched-platform reference.
async function resolveCampaignAudience(
  companyId: string,
  platform: AdPlatform,
  rawId: string,
): Promise<string | null> {
  if (!rawId) return null;
  const seg = await getAudienceSegment(rawId);
  if (!seg || seg.companyId !== companyId) return null;
  if (seg.platform !== "all" && seg.platform !== platform) return null;
  return seg.id;
}

// Parse the audience-targeting form fields into a normalised AdTargeting.
// Lists come newline/comma-separated; locations arrive as one JSON blob (the
// client form serialises its dynamic rows) — normaliseTargeting then coerces
// every field into safe bounds, so a malformed blob can never throw here.
function parseTargeting(fd: FormData): AdTargeting {
  const list = (key: string): string[] =>
    text(fd, key)
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  let locations: GeoTarget[] = [];
  try {
    const parsed = JSON.parse(text(fd, "locationsJson") || "[]");
    if (Array.isArray(parsed)) locations = parsed as GeoTarget[];
  } catch {
    locations = [];
  }
  return normaliseTargeting({
    locations,
    ageMin: numOrUndef(fd, "ageMin"),
    ageMax: numOrUndef(fd, "ageMax"),
    gender: (text(fd, "gender") || "all") as Gender,
    languages: list("languages"),
    interests: list("interests"),
    customAudiences: list("customAudiences"),
    exclusions: list("exclusions"),
    devices: (text(fd, "devices") || "all") as DeviceTarget,
    placements: list("placements"),
  });
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}
function num(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : 0;
}
// Like num(), but a blank/missing/non-numeric field yields undefined (not 0) so
// downstream `?? default` fallbacks fire — a cleared age input must fall back to
// the platform min/max, never collapse the band to 0→13.
function numOrUndef(fd: FormData, key: string): number | undefined {
  const raw = fd.get(key);
  if (raw === null || String(raw).trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
function asPlatform(v: string): AdPlatform {
  if (!AD_PLATFORM_KEYS.has(v)) throw new Error("Unknown ad platform.");
  return v as AdPlatform;
}
function refresh() {
  revalidatePath("/ads");
}

async function syncCampaignToPlatform(args: {
  campaign: Awaited<ReturnType<typeof getAdCampaign>>;
  op: CampaignLifecycleOp;
}): Promise<void> {
  const campaign = args.campaign;
  if (!campaign || !adsLive()) return;
  const account = await getAdAccount(campaign.adAccountId);
  if (!account || account.status !== "connected") return;
  let targeting;
  if (campaign.audienceSegmentId) {
    const seg = await getAudienceSegment(campaign.audienceSegmentId);
    if (seg) targeting = seg.targeting;
  }
  const result = await dispatchCampaignSync({ account, campaign, targeting, op: args.op });
  if (!result) return;
  if (!result.ok) throw new Error(result.detail);
  if (result.externalCampaignId && result.externalCampaignId !== campaign.externalCampaignId) {
    await updateAdCampaign(campaign.id, { externalCampaignId: result.externalCampaignId });
  }
}

// Connect a DELEGATED ad account. In this build the grant is captured manually
// (the live OAuth delegated-connect drop-in reuses src/lib/oauth.ts with
// google_ads/meta_ads providers once the Google Ads / Meta Marketing API
// approvals land). Tenant-pinned: the account can only ever attach to a company
// in the acting admin's tenant. The token is encrypted at rest — never a card.
export async function connectAdAccountAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const platform = asPlatform(text(formData, "platform"));
  const accountName = text(formData, "accountName");
  const externalAccountId = text(formData, "externalAccountId");
  const token = text(formData, "token");
  if (!companyId || !accountName || !externalAccountId || !token) {
    throw new Error("Company, account name, external account id and a grant token are required.");
  }
  const user = await assertAdminCompanyAccess(companyId);
  // Create the NEW account FIRST, then disconnect the prior one — so a failed
  // create never leaves the company with no connected account (the old grant
  // keeps working). findConnectedAdAccount resolves ties to the most recent, so
  // the window between create and disconnect still returns the new account.
  const existing = await findConnectedAdAccount(companyId, platform);
  const account = await createAdAccount({
    companyId,
    platform,
    accountName,
    externalAccountId,
    encryptedToken: encryptToken(token),
    tokenLastFour: token.slice(-4),
    status: "connected",
    connectedById: user.id,
  });
  if (existing) await updateAdAccount(existing.id, { status: "disconnected" });
  await logAction(user, "ad_account.connected", {
    targetType: "ad_account",
    targetId: account.id,
    companyId,
    detail: `${platform}: ${accountName} (${externalAccountId})`,
  });
  refresh();
}

export async function disconnectAdAccountAction(formData: FormData) {
  const user = await requireAdmin();
  const adAccountId = text(formData, "adAccountId");
  const account = await getAdAccount(adAccountId);
  if (!account) throw new Error("Ad account not found");
  if (!(await canAccessCompany(user, account.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await updateAdAccount(adAccountId, { status: "disconnected" });
  await logAction(user, "ad_account.disconnected", {
    targetType: "ad_account",
    targetId: adAccountId,
    companyId: account.companyId,
    detail: `${account.platform}: ${account.accountName}`,
  });
  refresh();
}

// Save a company's monthly ad budget + management-fee terms (per-company
// singleton). Allocation fractions come from the form (or the applied AI
// guidance); they are clamped to [0,1].
export async function saveBudgetAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const monthlyBudgetUsd = Math.max(0, num(formData, "monthlyBudgetUsd"));
  const feeModel = (text(formData, "feeModel") || "percent_of_spend") as FeeModel;
  if (!["percent_of_spend", "flat_monthly"].includes(feeModel)) {
    throw new Error("Unknown fee model.");
  }
  // feePercent entered as a percentage (15) → stored as a fraction (0.15).
  const feePercent = Math.min(1, Math.max(0, num(formData, "feePercentPct") / 100));
  const feeFlatUsd = Math.max(0, num(formData, "feeFlatUsd"));

  const existing = await getAdBudget(companyId);
  const allocation = existing?.allocation ?? {};
  await upsertAdBudget({
    companyId,
    monthlyBudgetUsd,
    allocation,
    feeModel,
    feePercent,
    feeFlatUsd,
    updatedById: user.id,
  });
  await logAction(user, "ad_budget.saved", {
    targetType: "ad_budget",
    targetId: companyId,
    companyId,
    detail: `budget $${monthlyBudgetUsd}/mo, fee ${feeModel === "flat_monthly" ? `$${feeFlatUsd}/mo` : `${Math.round(feePercent * 100)}% of spend`}`,
  });
  refresh();
}

// Apply the AI allocation guidance: recompute the recommended per-platform
// split and write it onto the company's budget. Requires a budget to exist.
export async function applyAllocationAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  const budget = await getAdBudget(companyId);
  if (!company || !budget) throw new Error("Set a monthly budget first.");
  const campaigns = await listAdCampaigns(user.tenantId, companyId);
  const connected = new Set<AdPlatform>();
  for (const p of AD_PLATFORMS) {
    if (await findConnectedAdAccount(companyId, p.key)) connected.add(p.key);
  }
  const guidance = recommendAllocation({ company, budget, campaigns, connectedPlatforms: connected });
  if (!guidance.hasConnected) throw new Error("Connect an ad account before applying an allocation.");
  await upsertAdBudget({
    companyId,
    monthlyBudgetUsd: budget.monthlyBudgetUsd,
    allocation: guidance.recommended,
    feeModel: budget.feeModel,
    feePercent: budget.feePercent,
    feeFlatUsd: budget.feeFlatUsd,
    updatedById: user.id,
  });
  await logAction(user, "ad_budget.allocation_applied", {
    targetType: "ad_budget",
    targetId: companyId,
    companyId,
    detail: Object.entries(guidance.recommended)
      .map(([p, s]) => `${p} ${Math.round((s ?? 0) * 100)}%`)
      .join(", "),
  });
  refresh();
}

export async function createAdCampaignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const platform = asPlatform(text(formData, "platform"));
  const name = text(formData, "name");
  const objective = text(formData, "objective");
  const dailyBudgetUsd = Math.max(0, num(formData, "dailyBudgetUsd"));
  const startDate = text(formData, "startDate");
  if (!name || !startDate) throw new Error("Campaign name and start date are required.");
  if (!OBJECTIVES.has(objective)) throw new Error("Unknown objective.");
  const account = await findConnectedAdAccount(companyId, platform);
  if (!account) {
    throw new Error(`Connect a ${platform} ad account for this company before creating a campaign.`);
  }
  const audienceSegmentId = await resolveCampaignAudience(
    companyId,
    platform,
    text(formData, "audienceSegmentId"),
  );
  const campaign = await createAdCampaign({
    companyId,
    adAccountId: account.id,
    platform,
    name,
    objective: objective as AdCampaignObjective,
    dailyBudgetUsd,
    status: "draft",
    startDate,
    audienceSegmentId,
    createdById: user.id,
  });
  await logAction(user, "ad_campaign.created", {
    targetType: "ad_campaign",
    targetId: campaign.id,
    companyId,
    detail: `${platform}: ${name} ($${dailyBudgetUsd}/day, ${objective})`,
  });
  if (adsLive()) {
    const fresh = await getAdCampaign(campaign.id);
    await syncCampaignToPlatform({ campaign: fresh, op: "create" });
  }
  refresh();
}

export async function updateAdCampaignStatusAction(formData: FormData) {
  const user = await requireAdmin();
  const campaignId = text(formData, "campaignId");
  const status = text(formData, "status");
  if (!["draft", "active", "paused", "ended"].includes(status)) {
    throw new Error("Unknown campaign status.");
  }
  const campaign = await getAdCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (!(await canAccessCompany(user, campaign.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const op: CampaignLifecycleOp =
    status === "active"
      ? campaign.externalCampaignId
        ? "activate"
        : "create"
      : "pause";
  if (adsLive() && status !== "draft") {
    await syncCampaignToPlatform({ campaign, op });
  }
  await updateAdCampaign(campaignId, { status: status as "draft" | "active" | "paused" | "ended" });
  await logAction(user, "ad_campaign.status_changed", {
    targetType: "ad_campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
    detail: `${campaign.name} → ${status}`,
  });
  refresh();
}

// ---- Audience targeting (Module 6/7) ------------------------------------------

// Create or update a reusable audience segment for a company. Tenant-pinned.
// `segmentId` present → update; absent → create.
export async function saveAudienceSegmentAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const name = text(formData, "name");
  if (!name) throw new Error("An audience name is required.");
  const platform = text(formData, "platform") || "all";
  if (!SEGMENT_PLATFORMS.has(platform)) throw new Error("Unknown platform for the audience.");
  const targeting = parseTargeting(formData);
  const segmentId = text(formData, "segmentId");

  if (segmentId) {
    const existing = await getAudienceSegment(segmentId);
    if (!existing || existing.companyId !== companyId) {
      throw new Error("Audience not found for this company.");
    }
    await updateAudienceSegment(segmentId, {
      name,
      platform: platform as AudienceSegment["platform"],
      targeting,
    });
    // Invariant: a campaign's audience is always platform-compatible. If this
    // edit narrowed the audience to a single platform, DETACH any campaign that
    // referenced it and no longer matches — otherwise the campaign would keep a
    // silently-incompatible link (its row select would read "Broad" and a
    // stray Set would wipe it without warning).
    if (platform !== "all") {
      const referencing = (await listAdCampaigns(user.tenantId, companyId)).filter(
        (c) => c.audienceSegmentId === segmentId && c.platform !== platform,
      );
      for (const c of referencing) {
        await updateAdCampaign(c.id, { audienceSegmentId: null });
      }
      if (referencing.length > 0) {
        await logAction(user, "ad_campaign.audience_detached", {
          targetType: "audience_segment",
          targetId: segmentId,
          companyId,
          detail: `${referencing.length} campaign(s) detached — audience narrowed to ${platform}`,
        });
      }
    }
    await logAction(user, "audience_segment.updated", {
      targetType: "audience_segment",
      targetId: segmentId,
      companyId,
      detail: name,
    });
  } else {
    const seg = await createAudienceSegment({
      companyId,
      name,
      platform: platform as AudienceSegment["platform"],
      targeting,
      createdById: user.id,
    });
    await logAction(user, "audience_segment.created", {
      targetType: "audience_segment",
      targetId: seg.id,
      companyId,
      detail: `${name} (${platform})`,
    });
  }
  refresh();
}

export async function deleteAudienceSegmentAction(formData: FormData) {
  const user = await requireAdmin();
  const segmentId = text(formData, "segmentId");
  const seg = await getAudienceSegment(segmentId);
  if (!seg) throw new Error("Audience not found");
  if (!(await canAccessCompany(user, seg.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await deleteAudienceSegment(segmentId); // referencing campaigns detach (SET NULL)
  await logAction(user, "audience_segment.deleted", {
    targetType: "audience_segment",
    targetId: segmentId,
    companyId: seg.companyId,
    detail: seg.name,
  });
  refresh();
}

// One-click AI-style suggestion: build a local-catchment starter audience from
// the company's Brand Brain (service areas + local suburbs + services/search
// terms) and save it as a new segment for the admin to review + refine.
export async function suggestAudienceAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  const local = await getLocalProfile(companyId);
  const { targeting } = suggestTargeting(company, local);
  const seg = await createAudienceSegment({
    companyId,
    name: "Suggested — local catchment",
    platform: "all",
    targeting,
    createdById: user.id,
  });
  await logAction(user, "audience_segment.suggested", {
    targetType: "audience_segment",
    targetId: seg.id,
    companyId,
    detail: "AI local-catchment suggestion",
  });
  refresh();
}

// Attach / change / clear a campaign's audience. Tenant-pinned; the audience
// must belong to the campaign's company and be platform-compatible.
export async function setCampaignAudienceAction(formData: FormData) {
  const user = await requireAdmin();
  const campaignId = text(formData, "campaignId");
  const campaign = await getAdCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (!(await canAccessCompany(user, campaign.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const audienceSegmentId = await resolveCampaignAudience(
    campaign.companyId,
    campaign.platform,
    text(formData, "audienceSegmentId"),
  );
  await updateAdCampaign(campaignId, { audienceSegmentId });
  await logAction(user, "ad_campaign.audience_set", {
    targetType: "ad_campaign",
    targetId: campaignId,
    companyId: campaign.companyId,
    detail: audienceSegmentId ? `audience ${audienceSegmentId}` : "audience cleared",
  });
  refresh();
}

// Record a lead (manual/simulated ingestion; the live path is a Meta Lead Ads /
// Google lead-form webhook, gated on the ad-API approvals — see ad-connectors.ts).
export async function recordLeadAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const platform = asPlatform(text(formData, "platform"));
  const contact = text(formData, "contact");
  if (!contact) throw new Error("A contact is required.");
  const valueUsd = num(formData, "valueUsd");
  // Only attribute the lead to a campaign we can confirm belongs to THIS company
  // (defense-in-depth + backend parity: an unvalidated id would FK-reject under
  // Supabase but persist in-memory — validate so both behave identically).
  const rawCampaignId = text(formData, "adCampaignId");
  let adCampaignId: string | null = null;
  if (rawCampaignId) {
    const campaign = await getAdCampaign(rawCampaignId);
    if (campaign && campaign.companyId === companyId) adCampaignId = campaign.id;
  }
  await createLead({
    companyId,
    platform,
    adCampaignId,
    contact,
    source: text(formData, "source") || "manual",
    valueUsd: valueUsd > 0 ? valueUsd : undefined,
    status: "new",
    capturedAt: new Date().toISOString(),
  });
  await logAction(user, "lead.recorded", {
    targetType: "lead",
    companyId,
    detail: `${platform}: ${contact}`,
  });
  refresh();
}

// Invoice the tenant (the agency) our management fee for the current period's
// managed spend across all their companies. Owner-only. Env-gated: without
// Stripe (or a Stripe customer on the tenant) it computes + audits the amount
// but bills nothing — the UI reflects that.
export async function invoiceManagementFeeAction() {
  const user = await requireTenantOwner();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Tenant not found");
  const companies = await listCompanies(user.tenantId);
  let feeTotal = 0;
  for (const company of companies) {
    const budget = await getAdBudget(company.id);
    const campaigns = await listAdCampaigns(user.tenantId, company.id);
    const leads = await listLeads(user.tenantId, company.id);
    const connected = new Set<AdPlatform>();
    for (const p of AD_PLATFORMS) {
      if (await findConnectedAdAccount(company.id, p.key)) connected.add(p.key);
    }
    const summary = companyPaidSummary({ company, campaigns, leads, budget, connectedPlatforms: connected });
    feeTotal += summary.managementFeeUsd;
  }
  const invoiceId = await createManagementFeeInvoice(
    tenant,
    feeTotal,
    `Ad management fee — ${companies.length} client(s), period to ${new Date().toISOString().slice(0, 10)}`,
  );
  await logAction(user, "ad_management_fee.invoiced", {
    detail: invoiceId
      ? `$${Math.round(feeTotal)} invoiced (Stripe invoice ${invoiceId})`
      : `$${Math.round(feeTotal)} computed — Stripe not configured, nothing billed`,
  });
  refresh();
}
