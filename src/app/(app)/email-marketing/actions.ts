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
import { logAction } from "@/lib/audit";
import { draftEmailCampaignCopy } from "@/lib/ai/channel-campaign-draft";
import { assertAiBudget } from "@/lib/ai/budget";
import { checkCompliance } from "@/lib/ai/compliance";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
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

export type EmailAiDraftState = {
  name: string;
  subject: string;
  htmlBody: string;
  model: string;
  complianceWarning?: string;
} | null;

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

/** Brand Brain–grounded subject/HTML for the create form — does not send. */
export async function draftEmailCampaignCopyAction(
  _prev: EmailAiDraftState,
  formData: FormData,
): Promise<EmailAiDraftState> {
  const companyId = text(formData, "companyId");
  const topic = text(formData, "topic");
  const objective = text(formData, "objective");
  if (!companyId || !topic || !objective) throw new Error("Company, topic, and objective are required.");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const draft = await draftEmailCampaignCopy({
    company,
    topic,
    objective,
    audience: text(formData, "audience") || undefined,
    offer: text(formData, "offer") || undefined,
    callToAction: text(formData, "callToAction") || undefined,
  });
  const compliance = await checkCompliance(`${draft.subject}\n${draft.htmlBody}`, company);
  await recordAiUsage({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    kind: "content_draft",
    model: draft.model,
    promptSummary: `Email campaign draft: ${topic}`.slice(0, 120),
    outputChars: draft.subject.length + draft.htmlBody.length,
    sourcesUsed: draft.sources,
    contextChars: topic.length + objective.length,
  });
  await logAction(user, "email.campaign.ai_drafted", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: draft.model,
  });
  return {
    name: draft.name,
    subject: draft.subject,
    htmlBody: draft.htmlBody,
    model: draft.model,
    complianceWarning: compliance.issues.length
      ? `${compliance.issues.length} compliance flag(s) — review before sending.`
      : undefined,
  };
}

export async function createEmailCampaignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const name = text(formData, "name");
  const subject = text(formData, "subject");
  if (!companyId || !name || !subject) {
    throw new Error("Required fields missing.");
  }
  const user = await assertAdminCompanyAccess(companyId);
  const htmlBody = text(formData, "htmlBody");
  let templateId = text(formData, "templateId");

  // Optional AI/manual HTML: create a dedicated draft template for this campaign.
  if (htmlBody) {
    const tpl = await createEmailTemplate({
      companyId,
      name: `${name} (template)`.slice(0, 80),
      kind: "newsletter",
      subject,
      htmlBody,
      active: true,
      createdById: user.id,
    });
    templateId = tpl.id;
  } else {
    if (!templateId) throw new Error("Template or HTML body required.");
    const tpl = await getEmailTemplate(templateId);
    if (!tpl || tpl.companyId !== companyId) throw new Error("Template not found.");
  }

  await createEmailCampaign({
    companyId,
    templateId,
    name,
    subject,
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
