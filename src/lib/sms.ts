// SMS marketing engine (W3 M32) - consent, quiet hours, country rules, cost preview.

import { resolveQueueClockAt } from "@/lib/tenant-timezone";
import type {
  SmsCampaign,
  SmsCampaignKind,
  SmsCompanySettings,
  SmsSubscriber,
  Tenant,
} from "@/lib/types";

export interface SmsCountryRule {
  quietHoursDefault: { start: string; end: string };
  costPerSegmentUsd: number;
  maxSenderIdLen: number;
  requiresOptOut: boolean;
}

export const SMS_COUNTRY_RULES: Record<string, SmsCountryRule> = {
  AU: { quietHoursDefault: { start: "20:00", end: "08:00" }, costPerSegmentUsd: 0.052, maxSenderIdLen: 11, requiresOptOut: true },
  NZ: { quietHoursDefault: { start: "20:00", end: "08:00" }, costPerSegmentUsd: 0.048, maxSenderIdLen: 11, requiresOptOut: true },
  US: { quietHoursDefault: { start: "21:00", end: "08:00" }, costPerSegmentUsd: 0.015, maxSenderIdLen: 11, requiresOptOut: true },
  GB: { quietHoursDefault: { start: "20:00", end: "08:00" }, costPerSegmentUsd: 0.045, maxSenderIdLen: 11, requiresOptOut: true },
};

export function smsCountryRule(countryCode: string): SmsCountryRule {
  return SMS_COUNTRY_RULES[countryCode.toUpperCase()] ?? SMS_COUNTRY_RULES.AU;
}

export function defaultSmsSettings(companyId: string, countryCode = "AU"): SmsCompanySettings {
  const rule = smsCountryRule(countryCode);
  return {
    companyId,
    countryCode: countryCode.toUpperCase(),
    senderId: "",
    quietHoursStart: rule.quietHoursDefault.start,
    quietHoursEnd: rule.quietHoursDefault.end,
    updatedAt: new Date().toISOString(),
  };
}

export function normalisePhoneE164(raw: string, countryCode = "AU"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cc = countryCode.toUpperCase();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (cc === "AU" || cc === "NZ") {
    const national = cc === "AU" ? "61" : "64";
    if (digits.startsWith(national) && digits.length >= 10) return `+${digits}`;
    if (digits.startsWith("0") && digits.length >= 9) return `+${national}${digits.slice(1)}`;
    if (digits.length >= 8 && digits.length <= 10) return `+${national}${digits}`;
  }
  if (cc === "US" && digits.length === 10) return `+1${digits}`;
  if (cc === "GB" && digits.startsWith("44")) return `+${digits}`;
  if (cc === "GB" && digits.startsWith("0")) return `+44${digits.slice(1)}`;
  return null;
}

const GSM_7_BODY =
  /^[\x00-\x7F\u20AC\u00A3\u00A5\u00E8\u00E9\u00F9\u00EC\u00F2\u00C7\u00D8\u00F8\u00C5\u00E5\u0394_\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039E\u00C6\u00E6\u00DF\u00C9 !"#$%&'()*+,\-./0-9:;<=>?@A-Z\[\\\]^_`a-z{|}~]*$/;

export function smsSegmentCount(body: string): number {
  const len = body.trim().length;
  if (len === 0) return 0;
  const gsm = GSM_7_BODY.test(body);
  const single = gsm ? 160 : 70;
  const concat = gsm ? 153 : 67;
  if (len <= single) return 1;
  return Math.ceil(len / concat);
}

export interface SmsCostPreview {
  segmentsPerMessage: number;
  recipientCount: number;
  totalSegments: number;
  costPerSegmentUsd: number;
  estimatedCostUsd: number;
}

export function previewSmsCost(body: string, recipientCount: number, countryCode: string): SmsCostPreview {
  const rule = smsCountryRule(countryCode);
  const segmentsPerMessage = Math.max(1, smsSegmentCount(body));
  const recipients = Math.max(0, recipientCount);
  const totalSegments = segmentsPerMessage * recipients;
  const estimatedCostUsd = Math.round(totalSegments * rule.costPerSegmentUsd * 100) / 100;
  return { segmentsPerMessage, recipientCount: recipients, totalSegments, costPerSegmentUsd: rule.costPerSegmentUsd, estimatedCostUsd };
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isWithinQuietHours(localHhmm: string, start: string, end: string): boolean {
  const nowMin = hhmmToMinutes(localHhmm);
  const startMin = hhmmToMinutes(start);
  const endMin = hhmmToMinutes(end);
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

export function quietHoursActive(
  settings: SmsCompanySettings,
  tenant: Pick<Tenant, "timezone"> | null | undefined,
  atIso = new Date().toISOString(),
): boolean {
  const clock = resolveQueueClockAt(atIso, tenant);
  return isWithinQuietHours(clock.hhmm, settings.quietHoursStart, settings.quietHoursEnd);
}

export function bodyHasOptOut(body: string): boolean {
  return /\b(STOP|UNSUBSCRIBE|OPT[\s-]*OUT)\b/i.test(body);
}

export function filterEligibleSubscribers(subscribers: SmsSubscriber[], segmentTag?: string | null) {
  let blockedNoConsent = 0;
  let blockedOptOut = 0;
  const eligible: SmsSubscriber[] = [];
  for (const sub of subscribers) {
    if (segmentTag && !sub.tags.includes(segmentTag)) continue;
    if (sub.consentStatus === "opted_out" || sub.optedOutAt) { blockedOptOut += 1; continue; }
    if (sub.consentStatus !== "opted_in") { blockedNoConsent += 1; continue; }
    eligible.push(sub);
  }
  return { eligible, blockedNoConsent, blockedOptOut };
}

export interface SmsSendValidation {
  ok: boolean;
  errors: string[];
  eligible: SmsSubscriber[];
  blockedNoConsent: number;
  blockedOptOut: number;
  blockedQuietHours: boolean;
  preview: SmsCostPreview;
}

export function validateSmsCampaignSend(input: {
  campaign: Pick<SmsCampaign, "body" | "kind" | "segmentTag">;
  subscribers: SmsSubscriber[];
  settings: SmsCompanySettings;
  tenant?: Pick<Tenant, "timezone"> | null;
  atIso?: string;
  enforceQuietHours?: boolean;
}): SmsSendValidation {
  const errors: string[] = [];
  const rule = smsCountryRule(input.settings.countryCode);
  const body = input.campaign.body.trim();
  if (!body) errors.push("Message body is required.");
  if (!input.settings.senderId.trim()) errors.push("Sender identity is required in SMS settings.");
  if (input.settings.senderId.length > rule.maxSenderIdLen) errors.push(`Sender ID must be at most ${rule.maxSenderIdLen} characters.`);
  if (input.campaign.kind === "promotional" && rule.requiresOptOut && !bodyHasOptOut(body)) errors.push("Promotional SMS must include STOP opt-out.");
  const { eligible, blockedNoConsent, blockedOptOut } = filterEligibleSubscribers(input.subscribers, input.campaign.segmentTag);
  if (eligible.length === 0) errors.push("No eligible subscribers with valid SMS consent.");
  const blockedQuietHours = quietHoursActive(input.settings, input.tenant, input.atIso);
  if (blockedQuietHours && input.enforceQuietHours !== false) errors.push(`Quiet hours active (${input.settings.quietHoursStart}-${input.settings.quietHoursEnd} local).`);
  const preview = previewSmsCost(body, eligible.length, input.settings.countryCode);
  if (input.settings.monthlySpendCapUsd != null && preview.estimatedCostUsd > input.settings.monthlySpendCapUsd) errors.push("Estimated cost exceeds monthly spend cap.");
  return { ok: errors.length === 0, errors, eligible, blockedNoConsent, blockedOptOut, blockedQuietHours, preview };
}

export function appendUtmToLink(link: string, utmCampaign?: string): string {
  if (!link.trim() || !utmCampaign?.trim()) return link;
  try {
    const url = new URL(link);
    url.searchParams.set("utm_source", "sms");
    url.searchParams.set("utm_medium", "sms");
    url.searchParams.set("utm_campaign", utmCampaign.trim());
    return url.toString();
  } catch { return link; }
}

export function personaliseSmsBody(body: string, sub: SmsSubscriber, companyName: string): string {
  return body.replace(/\{\{name\}\}/gi, sub.name?.trim() || "there").replace(/\{\{company\}\}/gi, companyName);
}

export function emptySmsCampaignStats(): SmsCampaign["stats"] {
  return { recipients: 0, segments: 0, estimatedCostUsd: 0, actualCostUsd: 0, delivered: 0, failed: 0, blockedOptOut: 0, blockedNoConsent: 0, blockedQuietHours: 0 };
}

export function kindLabel(kind: SmsCampaignKind): string {
  return kind === "transactional" ? "Transactional" : "Promotional";
}
