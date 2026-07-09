import {
  addMembership,
  createCompany,
  createContent,
  createScheduledPost,
  createTenant,
  createUser,
  getCompany,
  grantAccess,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  buildClientRoiReport,
  isScheduledReportDue,
  listPortalRecipientsForCompany,
  renderClientReportEmailHtml,
  sendClientReportEmail,
} from "@/lib/client-reports";
import { emailConfigured } from "@/lib/email";
import type { PortalCheck, PortalReport } from "@/lib/selftest/portal";

export async function runClientReportsSelfTest(): Promise<PortalReport> {
  const startedAt = Date.now();
  const checks: PortalCheck[] = [];
  const expect = async (name: string, fn: () => Promise<{ ok: boolean; detail: string }>) => {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: `threw: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  let tenantId: string | undefined;
  const purgeFailed: string[] = [];
  try {
    const suffix = `${Date.now()}`;
    const tenant = await createTenant({ name: "CR SelfTest", kind: "agency", plan: "starter", status: "active" });
    tenantId = tenant.id;
    const admin = await createUser({ email: `cra+${suffix}@selftest.dev`, name: "Admin", role: "admin" });
    const portal = await createUser({ email: `crp+${suffix}@selftest.dev`, name: "Portal", role: "user" });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "admin" });
    await addMembership({ tenantId: tenant.id, userId: portal.id, role: "member" });
    const company = await createCompany({ tenantId: tenant.id, name: "Report Co", createdBy: admin.id });
    await grantAccess(portal.id, company.id);
    const content = await createContent({
      companyId: company.id,
      type: "social_post",
      title: "Published",
      body: "Body",
      status: "published",
      createdById: admin.id,
    });
    await createScheduledPost({
      contentId: content.id,
      companyId: company.id,
      platform: "instagram",
      scheduledDate: new Date().toISOString().slice(0, 10),
      scheduledTime: "09:00",
      status: "published",
      createdById: admin.id,
    });

    await expect("reports.buildClientRoiReport_scoped", async () => {
      const r = await buildClientRoiReport(tenant.id, company.id);
      return { ok: r.companyId === company.id && r.organic.publishedPosts >= 1, detail: `posts=${r.organic.publishedPosts}` };
    });
    await expect("reports.listPortalRecipients", async () => {
      const rs = await listPortalRecipientsForCompany(tenant.id, company.id);
      return { ok: rs.length === 1 && rs[0]?.email === portal.email, detail: `count=${rs.length}` };
    });
    await expect("reports.renderEmailHtml", async () => {
      const r = await buildClientRoiReport(tenant.id, company.id);
      const html = renderClientReportEmailHtml({
        report: r,
        recipientName: "T",
        tenantName: tenant.name,
        portalUrl: "https://example.test/client/reports",
      });
      return { ok: html.includes("Report Co"), detail: `len=${html.length}` };
    });
    await expect("reports.scheduledDue_whenNeverSent", async () => {
      const co = await getCompany(company.id);
      return { ok: !!co && isScheduledReportDue(co), detail: "due" };
    });
    await expect("reports.scheduledSkip_afterRecentSend", async () => {
      const base = (await getCompany(company.id))!.profile;
      await updateCompany(company.id, { profile: { ...base, clientReports: { lastSentAt: new Date().toISOString() } } });
      const co = await getCompany(company.id);
      return { ok: !!co && !isScheduledReportDue(co), detail: "skip" };
    });
    await expect("reports.send_simulatedWithoutKey", async () => {
      const o = await sendClientReportEmail({ tenantId: tenant.id, companyId: company.id, origin: "https://example.test" });
      const ok = o.recipients === 1 && (emailConfigured() ? o.sent >= 0 : o.sent === 0);
      return { ok, detail: `sent=${o.sent}` };
    });
    await expect("reports.combinedTotals_nonNegative", async () => {
      const r = await buildClientRoiReport(tenant.id, company.id);
      return { ok: r.combined.totalLeads >= 0, detail: `leads=${r.combined.totalLeads}` };
    });
    await expect("reports.scheduledOff_respected", async () => {
      const base = (await getCompany(company.id))!.profile;
      await updateCompany(company.id, { profile: { ...base, clientReports: { scheduledEmail: false } } });
      const co = await getCompany(company.id);
      return { ok: !!co && !isScheduledReportDue(co), detail: "off" };
    });
  } finally {
    if (tenantId) {
      try { await purgeTenant(tenantId); } catch (e) {
        purgeFailed.push(`${tenantId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && purgeFailed.length === 0, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - startedAt, checks };
}
