// Client-facing ROI reports (W1 M20).

import { buildReport, type DimensionRow } from "@/lib/analytics";
import { summariseReport } from "@/lib/ai/summary";
import { isPortalUser } from "@/lib/auth/rbac";
import {
  accessForUser,
  getAdBudget,
  getCompany,
  getTenant,
  listAdAccounts,
  listAdCampaigns,
  listCompanies,
  listLeads,
  listMembers,
  listTenants,
  listUsers,
  updateCompany,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { emailConfigured, sendBulkEmail } from "@/lib/email";
import { logAction } from "@/lib/audit";
import { companyPaidSummary, type PlatformRollup } from "@/lib/paid";
import { TENANT_ROLE_TIER, type ActingUser, type AdPlatform, type Company } from "@/lib/types";
import { now } from "@/lib/utils";

const DEFAULT_FREQUENCY_DAYS = 7;

export interface ClientRoiReport {
  companyId: string;
  companyName: string;
  periodLabel: string;
  organic: {
    publishedPosts: number;
    reach: number;
    engagement: number;
    clicks: number;
    leads: number;
    estRevenue: number;
    aiCostUsd: number;
    byPlatform: DimensionRow[];
  };
  paid: {
    spendUsd: number;
    impressions: number;
    clicks: number;
    leads: number;
    revenueUsd: number;
    roas: number | null;
    cplUsd: number | null;
    byPlatform: PlatformRollup[];
    campaigns: number;
  };
  leads: { captured: number; organic: number; paid: number };
  combined: {
    totalLeads: number;
    totalEstRevenue: number;
    totalSpend: number;
    blendedRoas: number | null;
  };
}

function reportSettings(company: Company) {
  const s = company.profile.clientReports ?? {};
  return {
    scheduledEmail: s.scheduledEmail !== false,
    lastSentAt: s.lastSentAt,
    frequencyDays: s.frequencyDays ?? DEFAULT_FREQUENCY_DAYS,
  };
}

function connectedSet(accounts: { platform: AdPlatform; status: string }[]): Set<AdPlatform> {
  const s = new Set<AdPlatform>();
  for (const a of accounts) if (a.status === "connected") s.add(a.platform);
  return s;
}

export async function buildClientRoiReport(tenantId: string, companyId: string): Promise<ClientRoiReport> {
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== tenantId) throw new Error("Company not found");

  const [analytics, campaigns, leads, accounts, budget] = await Promise.all([
    buildReport(tenantId, [companyId]),
    listAdCampaigns(tenantId, companyId),
    listLeads(tenantId, companyId),
    listAdAccounts(tenantId, companyId),
    getAdBudget(companyId),
  ]);

  const paid = companyPaidSummary({
    company,
    campaigns,
    leads,
    budget,
    connectedPlatforms: connectedSet(accounts),
  });

  const organicLeads = analytics.roi.leads;
  const paidLeads = paid.totals.leads;
  const capturedLeads = leads.length;
  const totalLeads = Math.max(organicLeads + paidLeads, capturedLeads);
  const totalEstRevenue = analytics.roi.estRevenue + paid.totals.revenueUsd;
  const totalSpend = paid.totals.spendUsd + analytics.ai.costUsd;

  return {
    companyId,
    companyName: company.name,
    periodLabel: "Last 30 days",
    organic: {
      publishedPosts: analytics.totals.publishedPosts,
      reach: analytics.totals.reach,
      engagement: analytics.totals.engagement,
      clicks: analytics.totals.clicks,
      leads: organicLeads,
      estRevenue: analytics.roi.estRevenue,
      aiCostUsd: analytics.ai.costUsd,
      byPlatform: analytics.byPlatform,
    },
    paid: {
      spendUsd: paid.totals.spendUsd,
      impressions: paid.totals.impressions,
      clicks: paid.totals.clicks,
      leads: paidLeads,
      revenueUsd: paid.totals.revenueUsd,
      roas: paid.totals.roas,
      cplUsd: paid.totals.cplUsd,
      byPlatform: paid.byPlatform,
      campaigns: campaigns.filter((c) => c.status !== "draft").length,
    },
    leads: { captured: capturedLeads, organic: organicLeads, paid: paidLeads },
    combined: {
      totalLeads,
      totalEstRevenue,
      totalSpend,
      blendedRoas: totalSpend > 0 ? totalEstRevenue / totalSpend : null,
    },
  };
}

export async function listPortalRecipientsForCompany(
  tenantId: string,
  companyId: string,
): Promise<{ email: string; name: string }[]> {
  const [members, users] = await Promise.all([listMembers(tenantId), listUsers(tenantId)]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const tenantCompanyIds = new Set((await listCompanies(tenantId)).map((c) => c.id));
  const recipients: { email: string; name: string }[] = [];

  for (const member of members) {
    if (member.role !== "member") continue;
    const user = userById.get(member.userId);
    if (!user?.active) continue;
    const access = (await accessForUser(user.id))
      .map((a) => a.companyId)
      .filter((id) => tenantCompanyIds.has(id));
    if (!access.includes(companyId)) continue;
    const actor: ActingUser = {
      ...user,
      tenantId,
      tenantRole: member.role,
      role: TENANT_ROLE_TIER[member.role],
    };
    if (!(await isPortalUser(actor))) continue;
    recipients.push({ email: user.email, name: user.name });
  }
  return recipients;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const money = (x: number) => `$${Math.round(x).toLocaleString("en-AU")}`;
const n = (x: number) => x.toLocaleString("en-AU");
const roasFmt = (x: number | null) => (x === null ? "—" : `${x.toFixed(1)}×`);

export function renderClientReportEmailHtml(args: {
  report: ClientRoiReport;
  recipientName: string;
  tenantName: string;
  portalUrl: string;
  accentColor?: string;
}): string {
  const { report: r, recipientName, tenantName, portalUrl, accentColor } = args;
  const accent = accentColor ?? "#2563eb";
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
<p>Hi ${escapeHtml(recipientName || "there")},</p>
<p>Your <strong>${escapeHtml(r.periodLabel)}</strong> report for <strong>${escapeHtml(r.companyName)}</strong> from ${escapeHtml(tenantName)}.</p>
<p><strong>Leads:</strong> ${n(r.combined.totalLeads)} · <strong>Revenue:</strong> ${money(r.combined.totalEstRevenue)} · <strong>Spend:</strong> ${money(r.combined.totalSpend)} · <strong>ROAS:</strong> ${roasFmt(r.combined.blendedRoas)}</p>
<p><strong>Organic:</strong> ${n(r.organic.reach)} reach, ${n(r.organic.leads)} leads · <strong>Paid:</strong> ${money(r.paid.spendUsd)} spend, ${n(r.paid.leads)} leads</p>
<p style="margin:20px 0"><a href="${portalUrl}" style="display:inline-block;padding:10px 18px;background:${accent};color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View full report →</a></p>
</div>`;
}

export function isScheduledReportDue(company: Company, at = Date.now()): boolean {
  const settings = reportSettings(company);
  if (!settings.scheduledEmail) return false;
  if (!settings.lastSentAt) return true;
  return at - Date.parse(settings.lastSentAt) >= settings.frequencyDays * 86_400_000;
}

export async function sendClientReportEmail(args: {
  tenantId: string;
  companyId: string;
  origin: string;
  actor?: ActingUser;
}) {
  const { tenantId, companyId, origin, actor } = args;
  const [company, tenant, report, recipients] = await Promise.all([
    getCompany(companyId),
    getTenant(tenantId),
    buildClientRoiReport(tenantId, companyId),
    listPortalRecipientsForCompany(tenantId, companyId),
  ]);
  if (!company || recipients.length === 0) {
    return { recipients: 0, sent: 0, failed: 0, emailConfigured: emailConfigured() };
  }

  const portalUrl = `${origin.replace(/\/+$/, "")}/client/reports`;
  const fromName = tenant?.branding?.emailFromName ?? tenant?.name;
  const messages = recipients.map((r) => ({
    to: r.email,
    subject: `${report.companyName} — ${report.periodLabel} marketing report`,
    html: renderClientReportEmailHtml({
      report,
      recipientName: r.name,
      tenantName: tenant?.name ?? "Your agency",
      portalUrl,
      accentColor: tenant?.branding?.accentColor,
    }),
  }));

  const result = await sendBulkEmail(messages, fromName);
  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      clientReports: { ...company.profile.clientReports, lastSentAt: now() },
    },
  });

  if (actor) {
    await logAction(actor, "client_report.sent", {
      targetType: "company",
      targetId: companyId,
      detail: emailConfigured()
        ? `ROI report: emailed ${result.sent}/${recipients.length} for ${company.name}`
        : `ROI report: ${recipients.length} recipient(s) — email NOT sent (no RESEND_API_KEY)`,
    });
  }
  return {
    recipients: recipients.length,
    sent: result.sent,
    failed: result.failed,
    emailConfigured: emailConfigured(),
  };
}

export async function runScheduledClientReportsForTenant(
  tenantId: string,
  origin: string,
  options: { deadlineMs?: number; signal?: AbortSignal } = {},
) {
  return runInServiceContext(tenantId, async () => {
    let companiesChecked = 0;
    let reportsSent = 0;
    let recipients = 0;
    const actor: ActingUser = {
      id: "system:cron",
      email: "cron@marketing-command-centre.system",
      name: "Scheduler",
      role: "super_admin",
      active: true,
      tenantId,
      tenantRole: "owner",
      createdAt: "1970-01-01T00:00:00.000Z",
    };
    for (const company of (await listCompanies(tenantId)).filter(
      (c) => c.status !== "archived",
    )) {
      if (
        options.signal?.aborted ||
        (options.deadlineMs && Date.now() >= options.deadlineMs)
      ) {
        break;
      }
      companiesChecked += 1;
      if (!isScheduledReportDue(company)) continue;
      if (
        (await listPortalRecipientsForCompany(tenantId, company.id)).length ===
        0
      ) {
        continue;
      }
      try {
        const outcome = await sendClientReportEmail({
          tenantId,
          companyId: company.id,
          origin,
          actor,
        });
        if (outcome.recipients > 0) {
          reportsSent += 1;
          recipients += outcome.recipients;
        }
      } catch (err) {
        console.error(`[client-reports] send failed for ${company.id}:`, err);
      }
    }
    return { companiesChecked, reportsSent, recipients };
  });
}

export async function runScheduledClientReports(
  origin: string,
  options: { deadlineMs?: number; signal?: AbortSignal } = {},
) {
  const results: {
    tenantId: string;
    companiesChecked: number;
    reportsSent: number;
    recipients: number;
  }[] = [];
  for (const tenant of await listTenants()) {
    if (
      options.signal?.aborted ||
      (options.deadlineMs && Date.now() >= options.deadlineMs)
    ) {
      break;
    }
    if (tenant.status !== "active") continue;
    const tick = await runScheduledClientReportsForTenant(
      tenant.id,
      origin,
      options,
    );
    results.push({ tenantId: tenant.id, ...tick });
  }
  return results;
}

export async function buildClientReportSummary(tenantId: string, companyId: string) {
  const [report, company] = await Promise.all([
    buildClientRoiReport(tenantId, companyId),
    getCompany(companyId),
  ]);
  const analytics = await buildReport(tenantId, [companyId]);
  const { text, model } = await summariseReport(analytics, company?.name ?? "your business");
  const paidNote =
    report.paid.spendUsd > 0
      ? ` Paid ads: ${money(report.paid.spendUsd)} spend, ${report.paid.leads} leads, ROAS ${roasFmt(report.paid.roas)}.`
      : "";
  return { text: `${text}${paidNote}`, model };
}
