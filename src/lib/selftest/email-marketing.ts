import {
  createCompany,
  createEmailCampaign,
  createEmailSubscriber,
  createEmailTemplate,
  createTenant,
  createUser,
  addMembership,
  purgeTenant,
} from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import {
  assertCampaignSendable,
  filterEligibleSubscribers,
  renderEmailHtml,
  sendEmailCampaign,
  simulateCampaignStats,
  subscriberEligible,
} from "@/lib/email-marketing";
import type { EmailSubscriber } from "@/lib/types";

export async function checkEmailConsentBlocksSend(): Promise<{ ok: boolean; detail: string }> {
  const subs: EmailSubscriber[] = [
    { id: "s1", companyId: "c", email: "a@x.com", tags: [], marketingConsent: false, createdAt: "", updatedAt: "" },
  ];
  let threw = false;
  try {
    assertCampaignSendable(subs);
  } catch {
    threw = true;
  }
  return { ok: threw, detail: `threw=${threw}` };
}

export async function checkEmailSimulatedWhenOff(): Promise<{ ok: boolean; detail: string }> {
  const stats = simulateCampaignStats("ecmp_test", 5, 0, 5);
  const ok = !emailConfigured() && stats.sent === 0 && stats.recipients === 5;
  return { ok, detail: `configured=${emailConfigured()} sent=${stats.sent}` };
}

export async function checkEmailRenderTokens(): Promise<{ ok: boolean; detail: string }> {
  const html = renderEmailHtml("<p>{{name}} @ {{company}}</p>", { name: "Sam", company: "Motel" });
  return { ok: html.includes("Sam") && html.includes("Motel"), detail: html };
}

export async function checkEmailUnsubscribeExcluded(): Promise<{ ok: boolean; detail: string }> {
  const subs: EmailSubscriber[] = [
    { id: "s1", companyId: "c", email: "ok@x.com", tags: ["newsletter"], marketingConsent: true, createdAt: "", updatedAt: "" },
    { id: "s2", companyId: "c", email: "out@x.com", tags: ["newsletter"], marketingConsent: true, unsubscribedAt: "2026-01-01", createdAt: "", updatedAt: "" },
  ];
  const eligible = filterEligibleSubscribers(subs, "newsletter");
  return { ok: eligible.length === 1 && eligible[0]?.email === "ok@x.com", detail: `eligible=${eligible.length}` };
}

export async function checkEmailSendEnvGated(): Promise<{ ok: boolean; detail: string }> {
  let tenantId: string | undefined;
  try {
    const suffix = `${Date.now()}`;
    const tenant = await createTenant({ name: "EM ST", kind: "agency", plan: "starter", status: "active" });
    tenantId = tenant.id;
    const admin = await createUser({ email: `em+${suffix}@selftest.dev`, name: "EM", role: "admin" });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "admin" });
    const company = await createCompany({ tenantId: tenant.id, name: "EM Co", createdBy: admin.id });
    const tpl = await createEmailTemplate({
      companyId: company.id,
      name: "T",
      kind: "newsletter",
      subject: "Hi",
      htmlBody: "<p>{{name}}</p>",
      active: true,
      createdById: admin.id,
    });
    await createEmailSubscriber({ companyId: company.id, email: `r+${suffix}@selftest.dev`, tags: [], marketingConsent: true });
    const campaign = await createEmailCampaign({
      companyId: company.id,
      templateId: tpl.id,
      name: "C",
      subject: "Hi",
      status: "draft",
      stats: { recipients: 0, sent: 0, failed: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 },
      createdById: admin.id,
    });
    const result = await sendEmailCampaign({
      actor: { ...admin, tenantId: tenant.id, tenantRole: "admin" },
      campaign,
      template: tpl,
      company,
      recipients: [{ id: "x", companyId: company.id, email: `r+${suffix}@selftest.dev`, tags: [], marketingConsent: true, createdAt: "", updatedAt: "" }],
    });
    const ok = !emailConfigured() ? result.stats.sent === 0 && result.emailConfigured === false : result.stats.sent >= 0;
    return { ok, detail: `sent=${result.stats.sent} configured=${result.emailConfigured}` };
  } finally {
    if (tenantId) await purgeTenant(tenantId);
  }
}

export async function checkEmailSubscriberEligible(): Promise<{ ok: boolean; detail: string }> {
  const ok =
    subscriberEligible({ id: "1", companyId: "c", email: "a@b.com", tags: [], marketingConsent: true, createdAt: "", updatedAt: "" }) &&
    !subscriberEligible({ id: "2", companyId: "c", email: "b@b.com", tags: [], marketingConsent: false, createdAt: "", updatedAt: "" });
  return { ok, detail: `eligible=${ok}` };
}

export async function checkEmailSegmentFilter(): Promise<{ ok: boolean; detail: string }> {
  const subs: EmailSubscriber[] = [
    { id: "s1", companyId: "c", email: "a@x.com", tags: ["vip"], marketingConsent: true, createdAt: "", updatedAt: "" },
    { id: "s2", companyId: "c", email: "b@x.com", tags: ["newsletter"], marketingConsent: true, createdAt: "", updatedAt: "" },
  ];
  const vip = filterEligibleSubscribers(subs, "vip");
  return { ok: vip.length === 1 && vip[0]?.tags.includes("vip"), detail: `vip=${vip.length}` };
}
