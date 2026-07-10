"use server";

import { revalidatePath } from "next/cache";
import {
  createSmsCampaign,
  createSmsSubscriber,
  getCompany,
  getSmsCampaign,
  getSmsCompanySettings,
  getSmsSubscriber,
  getTenant,
  listSmsSubscribers,
  updateSmsCampaign,
  updateSmsSubscriber,
  upsertSmsCompanySettings,
} from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { dispatchSmsBatch, smsLive } from "@/lib/sms-connectors";
import {
  appendUtmToLink,
  defaultSmsSettings,
  emptySmsCampaignStats,
  normalisePhoneE164,
  personaliseSmsBody,
  validateSmsCampaignSend,
} from "@/lib/sms";
import type { SmsCampaignKind, SmsConsentStatus } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function numOrUndef(fd: FormData, key: string): number | undefined {
  const raw = fd.get(key);
  if (raw === null || String(raw).trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function refresh() {
  revalidatePath("/sms");
}

export async function saveSmsSettingsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const existing = (await getSmsCompanySettings(companyId)) ?? defaultSmsSettings(companyId);
  await upsertSmsCompanySettings({
    companyId,
    countryCode: text(formData, "countryCode") || existing.countryCode,
    senderId: text(formData, "senderId"),
    quietHoursStart: text(formData, "quietHoursStart") || existing.quietHoursStart,
    quietHoursEnd: text(formData, "quietHoursEnd") || existing.quietHoursEnd,
    monthlySpendCapUsd: numOrUndef(formData, "monthlySpendCapUsd"),
    updatedById: user.id,
    updatedAt: new Date().toISOString(),
  });
  await logAction(user, "sms.settings.updated", { targetType: "company", targetId: companyId });
  refresh();
}

export async function addSmsSubscriberAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const settings = (await getSmsCompanySettings(companyId)) ?? defaultSmsSettings(companyId);
  const phone = normalisePhoneE164(text(formData, "phone"), settings.countryCode);
  if (!phone) throw new Error("Invalid phone number for selected country.");
  const consent = text(formData, "consent") === "on";
  const tags = text(formData, "tags")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const nowIso = new Date().toISOString();
  await createSmsSubscriber({
    companyId,
    phoneE164: phone,
    name: text(formData, "name") || undefined,
    tags,
    consentStatus: consent ? "opted_in" : "pending",
    consentedAt: consent ? nowIso : undefined,
    source: "manual",
  });
  await logAction(user, "sms.subscriber.added", { targetType: "company", targetId: companyId, detail: phone });
  refresh();
}

export async function setSmsConsentAction(formData: FormData) {
  const subscriberId = text(formData, "subscriberId");
  const sub = await getSmsSubscriber(subscriberId);
  if (!sub) throw new Error("Subscriber not found.");
  const user = await assertAdminCompanyAccess(sub.companyId);
  const status = text(formData, "status") as SmsConsentStatus;
  const nowIso = new Date().toISOString();
  if (status === "opted_in") {
    await updateSmsSubscriber(subscriberId, { consentStatus: "opted_in", consentedAt: nowIso, optedOutAt: undefined });
  } else if (status === "opted_out") {
    await updateSmsSubscriber(subscriberId, { consentStatus: "opted_out", optedOutAt: nowIso });
  } else {
    await updateSmsSubscriber(subscriberId, { consentStatus: "pending", consentedAt: undefined, optedOutAt: undefined });
  }
  await logAction(user, "sms.consent.updated", { targetType: "sms_subscriber", targetId: subscriberId, detail: status });
  refresh();
}

export async function createSmsCampaignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const kind = (text(formData, "kind") || "promotional") as SmsCampaignKind;
  const segmentTag = text(formData, "segmentTag") || null;
  const body = text(formData, "body");
  const subscribers = await listSmsSubscribers(companyId);
  const settings = (await getSmsCompanySettings(companyId)) ?? defaultSmsSettings(companyId);
  const tenant = await getTenant(user.tenantId);
  const validation = validateSmsCampaignSend({
    campaign: { body, kind, segmentTag },
    subscribers,
    settings,
    tenant,
    enforceQuietHours: false,
  });
  const campaign = await createSmsCampaign({
    companyId,
    name: text(formData, "name"),
    body,
    kind,
    status: "draft",
    segmentTag,
    shortLink: text(formData, "shortLink") || undefined,
    utmCampaign: text(formData, "utmCampaign") || undefined,
    stats: {
      ...emptySmsCampaignStats(),
      recipients: validation.eligible.length,
      segments: validation.preview.segmentsPerMessage,
      estimatedCostUsd: validation.preview.estimatedCostUsd,
      blockedOptOut: validation.blockedOptOut,
      blockedNoConsent: validation.blockedNoConsent,
    },
    createdById: user.id,
  });
  await logAction(user, "sms.campaign.created", { targetType: "sms_campaign", targetId: campaign.id });
  refresh();
}

export async function sendSmsCampaignAction(formData: FormData) {
  const campaignId = text(formData, "campaignId");
  const campaign = await getSmsCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new Error("Only draft or scheduled campaigns can be sent.");
  }
  const user = await assertAdminCompanyAccess(campaign.companyId);
  const company = await getCompany(campaign.companyId);
  if (!company) throw new Error("Company not found.");
  const subscribers = await listSmsSubscribers(campaign.companyId);
  const settings = (await getSmsCompanySettings(campaign.companyId)) ?? defaultSmsSettings(campaign.companyId);
  const tenant = await getTenant(user.tenantId);
  const validation = validateSmsCampaignSend({ campaign, subscribers, settings, tenant });
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  await updateSmsCampaign(campaignId, { status: "sending" });
  const link = campaign.shortLink ? appendUtmToLink(campaign.shortLink, campaign.utmCampaign) : "";
  const messages = validation.eligible.map((sub) => {
    let msgBody = personaliseSmsBody(campaign.body, sub, company.name);
    if (link) msgBody = `${msgBody} ${link}`.trim();
    return { to: sub.phoneE164, body: msgBody };
  });
  const dispatch = await dispatchSmsBatch({
    messages,
    costPerSegmentUsd: validation.preview.costPerSegmentUsd,
    segmentsPerMessage: validation.preview.segmentsPerMessage,
  });
  await updateSmsCampaign(campaignId, {
    status: dispatch.failed > 0 && dispatch.delivered === 0 ? "failed" : "sent",
    sentAt: new Date().toISOString(),
    stats: {
      recipients: validation.eligible.length,
      segments: validation.preview.segmentsPerMessage,
      estimatedCostUsd: validation.preview.estimatedCostUsd,
      actualCostUsd: dispatch.actualCostUsd,
      delivered: dispatch.delivered,
      failed: dispatch.failed,
      blockedOptOut: validation.blockedOptOut,
      blockedNoConsent: validation.blockedNoConsent,
      blockedQuietHours: validation.blockedQuietHours ? 1 : 0,
    },
  });
  await logAction(user, "sms.campaign.sent", {
    targetType: "sms_campaign",
    targetId: campaignId,
    detail: `${dispatch.delivered}/${messages.length} (${smsLive() ? "live" : "simulated"})`,
  });
  refresh();
}
