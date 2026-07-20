import { emailConfigured, sendBulkEmail } from "@/lib/email";
import { getCompany, getEmailSubscriber, listEmailSubscribers, updateEmailSubscriber } from "@/lib/db";
import { logAction } from "@/lib/audit";
import type { ActingUser, Company, EmailCampaign, EmailCampaignStats, EmailSubscriber, EmailTemplate } from "@/lib/types";

export function emailMarketingConfigured(): boolean { return emailConfigured(); }

const EMPTY_STATS: EmailCampaignStats = { recipients: 0, sent: 0, failed: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 };

export function subscriberEligible(s: EmailSubscriber): boolean { return s.marketingConsent && !s.unsubscribedAt; }

export function filterEligibleSubscribers(subscribers: EmailSubscriber[], segmentTag?: string | null): EmailSubscriber[] {
  return subscribers.filter((s) => subscriberEligible(s) && (!segmentTag || s.tags.includes(segmentTag)));
}

export function renderEmailHtml(html: string, vars: { name?: string; company?: string; cta?: string; unsubscribeUrl?: string }): string {
  const map: Record<string, string> = { name: vars.name ?? "there", company: vars.company ?? "us", cta: vars.cta ?? "Learn more", unsubscribeUrl: vars.unsubscribeUrl ?? "#unsubscribe" };
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "");
}

export function assertCampaignSendable(recipients: EmailSubscriber[]): void {
  if (recipients.length === 0) throw new Error("No eligible subscribers");
  if (recipients.some((r) => !r.marketingConsent)) throw new Error("Consent required");
}

export function simulateCampaignStats(campaignId: string, recipientCount: number, sent: number, failed: number): EmailCampaignStats {
  let h = 0;
  for (let i = 0; i < campaignId.length; i++) h = (h * 31 + campaignId.charCodeAt(i)) >>> 0;
  const opens = Math.round(sent * (0.18 + (h % 17) / 100));
  const clicks = Math.round(opens * (0.04 + (h % 9) / 200));
  return { recipients: recipientCount, sent, failed, opens, clicks, unsubscribes: Math.max(0, Math.round(sent * 0.002)), bounces: Math.round(sent * 0.01) };
}

export function resolveCampaignStats(campaign: EmailCampaign): EmailCampaignStats {
  if (campaign.status === "sent" && campaign.stats.recipients > 0) return campaign.stats;
  return campaign.status === "sent" ? simulateCampaignStats(campaign.id, 0, 0, 0) : campaign.stats;
}

function defaultCta(company: Company): string { return company.profile.callsToAction[0] ?? "Visit us"; }

export async function buildCampaignMessages(input: { campaign: EmailCampaign; template: EmailTemplate; company: Company; recipients: EmailSubscriber[]; appOrigin?: string }) {
  const origin = input.appOrigin ?? process.env.APP_ORIGIN ?? "http://localhost:3000";
  return input.recipients.map((r) => ({ to: r.email, subject: input.campaign.subject, html: renderEmailHtml(input.template.htmlBody, { name: r.name, company: input.company.name, cta: defaultCta(input.company), unsubscribeUrl: `${origin}/api/email/unsubscribe?subscriber=${r.id}` }) }));
}

export async function sendEmailCampaign(input: { actor: ActingUser; campaign: EmailCampaign; template: EmailTemplate; company: Company; recipients: EmailSubscriber[]; fromName?: string }) {
  assertCampaignSendable(input.recipients);
  const messages = await buildCampaignMessages({ campaign: input.campaign, template: input.template, company: input.company, recipients: input.recipients });
  const result = await sendBulkEmail(messages, input.fromName);
  const stats = simulateCampaignStats(input.campaign.id, input.recipients.length, result.sent, result.failed);
  const configured = emailConfigured();
  await logAction(input.actor, "email_campaign.sent", {
    companyId: input.company.id,
    detail: result.detail ?? `sent ${result.sent}`,
  });
  return { stats, emailConfigured: configured };
}

export async function unsubscribeById(subscriberId: string) {
  const sub = await getEmailSubscriber(subscriberId);
  if (!sub || sub.unsubscribedAt) return sub;
  return updateEmailSubscriber(subscriberId, { unsubscribedAt: new Date().toISOString() });
}

export async function eligibleSubscribersForCampaign(companyId: string, segmentTag?: string | null) {
  return filterEligibleSubscribers(await listEmailSubscribers(companyId), segmentTag);
}

export async function previewCampaignAudience(tenantId: string, companyId: string, segmentTag?: string | null) {
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== tenantId) throw new Error("Company not found");
  const all = await listEmailSubscribers(companyId);
  const eligible = filterEligibleSubscribers(all, segmentTag);
  return { total: all.length, eligible: eligible.length, blocked: all.length - eligible.length };
}

export function emptyCampaignStats(): EmailCampaignStats { return { ...EMPTY_STATS }; }
