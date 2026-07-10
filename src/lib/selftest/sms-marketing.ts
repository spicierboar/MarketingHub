// Self-test helpers for W3 SMS marketing (M32).

import { dispatchSmsBatch, smsConfigured, smsLive } from "@/lib/sms-connectors";
import {
  bodyHasOptOut,
  filterEligibleSubscribers,
  isWithinQuietHours,
  normalisePhoneE164,
  previewSmsCost,
  smsSegmentCount,
  validateSmsCampaignSend,
} from "@/lib/sms";
import type { SmsCompanySettings, SmsSubscriber } from "@/lib/types";

function stubSettings(): SmsCompanySettings {
  return {
    companyId: "c_stub",
    countryCode: "AU",
    senderId: "Millbrook",
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    updatedAt: new Date().toISOString(),
  };
}

function stubSub(partial: Partial<SmsSubscriber> & Pick<SmsSubscriber, "id" | "consentStatus">): SmsSubscriber {
  const t = new Date().toISOString();
  return {
    companyId: "c_stub",
    phoneE164: "+61400111222",
    tags: [],
    source: "manual",
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

export function checkSmsConsentBlocksOptedOut(): { ok: boolean; detail: string } {
  const subs = [
    stubSub({ id: "a", consentStatus: "opted_in", phoneE164: "+61400111222" }),
    stubSub({ id: "b", consentStatus: "opted_out", phoneE164: "+61400333444", optedOutAt: new Date().toISOString() }),
  ];
  const { eligible, blockedOptOut } = filterEligibleSubscribers(subs);
  return { ok: eligible.length === 1 && blockedOptOut === 1, detail: `eligible=${eligible.length} blockedOptOut=${blockedOptOut}` };
}

export function checkSmsQuietHoursOvernight(): { ok: boolean; detail: string } {
  const night = isWithinQuietHours("21:00", "20:00", "08:00");
  const day = isWithinQuietHours("12:00", "20:00", "08:00");
  return { ok: night && !day, detail: `night=${night} day=${day}` };
}

export function checkSmsCostPreviewSegments(): { ok: boolean; detail: string } {
  const longBody = "x".repeat(200);
  const segments = smsSegmentCount(longBody);
  const preview = previewSmsCost(longBody, 10, "AU");
  return {
    ok: segments >= 2 && preview.totalSegments === segments * 10 && preview.estimatedCostUsd > 0,
    detail: `segments=${segments} total=${preview.totalSegments} cost=${preview.estimatedCostUsd}`,
  };
}

export function checkSmsSimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return { ok: !smsLive() && !smsConfigured(), detail: `live=${smsLive()} configured=${smsConfigured()}` };
}

export async function checkSmsDispatchSimulated(): Promise<{ ok: boolean; detail: string }> {
  const result = await dispatchSmsBatch({
    messages: [{ to: "+61400111222", body: "Test" }],
    costPerSegmentUsd: 0.05,
    segmentsPerMessage: 1,
  });
  return { ok: result.delivered + result.failed === 1 && result.detail.includes("simulated"), detail: result.detail };
}

export function checkSmsCountryRulesAu(): { ok: boolean; detail: string } {
  const phone = normalisePhoneE164("0400 111 222", "AU");
  const opt = bodyHasOptOut("Reply STOP to opt out");
  return { ok: phone === "+61400111222" && opt, detail: `phone=${phone} opt=${opt}` };
}

export function checkSmsValidateCampaignSend(): { ok: boolean; detail: string } {
  const subs = [stubSub({ id: "ok", consentStatus: "opted_in" })];
  const bad = validateSmsCampaignSend({
    campaign: { body: "Flash sale today!", kind: "promotional", segmentTag: null },
    subscribers: subs,
    settings: stubSettings(),
    tenant: { timezone: "Australia/Sydney" },
    atIso: "2026-07-09T12:00:00.000Z",
    enforceQuietHours: false,
  });
  const good = validateSmsCampaignSend({
    campaign: { body: "Hi — 20% off. Reply STOP to opt out.", kind: "promotional", segmentTag: null },
    subscribers: subs,
    settings: stubSettings(),
    tenant: { timezone: "Australia/Sydney" },
    atIso: "2026-07-09T12:00:00.000Z",
    enforceQuietHours: false,
  });
  return { ok: !bad.ok && good.ok, detail: `bad=${bad.ok} good=${good.ok}` };
}
