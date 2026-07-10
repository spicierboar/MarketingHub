"use server";

import { revalidatePath } from "next/cache";
import {
  createEmailCampaign,
  createEmailSubscriber,
  createEmailTemplate,
  getCompany,
  getEmailCampaign,
  getEmailSubscriber,
  getEmailTemplate,
  getTenant,
  updateEmailCampaign,
  updateEmailSubscriber,
} from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import {
  eligibleSubscribersForCampaign,
  emptyCampaignStats,
  sendEmailCampaign,
} from "@/lib/email-marketing";
import type { EmailTemplateKind } from "@/lib/types";

const TEMPLATE_KINDS = new Set<string>(["newsletter", "promotion", "event", "review_request", "win_back", "custom"]);

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function createEmailTemplateAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const kind = text(formData, "kind") as EmailTemplateKind;
  if (!companyId || !text(formData, "name") || !text(formData, "subject") || !text(formData, "htmlBody")) {
    throw new Error("Required fields missing.");
  }
  if (!TEMPLATE_KINDS.has(kind)) throw new Error("Invalid template kind.");
  const user = await assertAdminCompanyAccess(companyId);
  await createEmailTemplate({
    companyId,
    name: text(formData, "name"),
    kind,
    subject: text(formData, "subject"),
    htmlBody: text(formData, "htmlBody"),
    active: true,
    createdById: user.id,
  });
  revalidatePath("/email-marketing");
}

export async function createEmailSubscriberAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const email = text(formData, "email").toLowerCase();
  if (!companyId || !email) throw new Error("Company and email required.");
  await assertAdminCompanyAccess(companyId);
  const tags = text(formData, "tags")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await createEmailSubscriber({
    companyId,
    email,
    name: text(formData, "name") || undefined,
    tags,
    marketingConsent: formData.get("marketingConsent") === "on",
  });
  revalidatePath("/email-marketing");
}

export async function createEmailCampaignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const templateId = text(formData, "templateId");
  if (!companyId || !templateId || !text(formData, "name") || !text(formData, "subject")) {
    throw new Error("Required fields missing.");
  }
  const user = await assertAdminCompanyAccess(companyId);
  const tpl = await getEmailTemplate(templateId);
  if (!tpl || tpl.companyId !== companyId) throw new Error("Template not found.");
  await createEmailCampaign({
    companyId,
    templateId,
    name: text(formData, "name"),
    subject: text(formData, "subject"),
    status: "draft",
    segmentTag: text(formData, "segmentTag") || null,
    stats: emptyCampaignStats(),
    createdById: user.id,
  });
  revalidatePath("/email-marketing");
}

export async function sendEmailCampaignAction(formData: FormData) {
  const campaign = await getEmailCampaign(text(formData, "campaignId"));
  if (!campaign || campaign.status === "sent") throw new Error("Invalid campaign.");
  const user = await assertAdminCompanyAccess(campaign.companyId);
  const [company, template, tenant] = await Promise.all([
    getCompany(campaign.companyId),
    getEmailTemplate(campaign.templateId),
    getTenant(user.tenantId),
  ]);
  if (!company || !template) throw new Error("Missing company or template.");
  const recipients = await eligibleSubscribersForCampaign(campaign.companyId, campaign.segmentTag);
  const { stats } = await sendEmailCampaign({
    actor: user,
    campaign,
    template,
    company,
    recipients,
    fromName: tenant?.branding?.emailFromName,
  });
  await updateEmailCampaign(campaign.id, {
    status: "sent",
    sentAt: new Date().toISOString(),
    stats,
  });
  revalidatePath("/email-marketing");
}

export async function unsubscribeSubscriberAction(formData: FormData) {
  const sub = await getEmailSubscriber(text(formData, "subscriberId"));
  if (!sub) throw new Error("Subscriber not found.");
  await assertAdminCompanyAccess(sub.companyId);
  await updateEmailSubscriber(sub.id, { unsubscribedAt: new Date().toISOString() });
  revalidatePath("/email-marketing");
}
