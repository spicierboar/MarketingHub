// Client implementation-plan email after managed strategy + calendar succeed.
// Soft no-op without RESEND_API_KEY; always audits the attempt.

import { logAction } from "@/lib/audit";
import {
  getCompany,
  getTenant,
  listCampaignDraftScheduleItems,
  listCalendarAssistSuggestions,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import type { ActingUser, CampaignDraftScheduleItem, Company } from "@/lib/types";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function systemActor(tenantId: string): ActingUser {
  return {
    id: "system:implementation-plan",
    email: "implementation-plan@marketing-command-centre.system",
    name: "Managed service",
    role: "super_admin",
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

function appOrigin(): string {
  return process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ?? "http://localhost:3000";
}

function formatDateAu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Collect planned dates for the next ~4 weeks from draft schedules + open assists. */
export function collectUpcomingPlanHighlights(args: {
  draftSchedules: CampaignDraftScheduleItem[];
  assistDates: { date: string; title: string; platform?: string }[];
  todayIso?: string;
  horizonDays?: number;
}): { date: string; title: string; platform: string }[] {
  const today = args.todayIso ?? new Date().toISOString().slice(0, 10);
  const horizon = args.horizonDays ?? 28;
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + horizon);
  const endIso = end.toISOString().slice(0, 10);

  const rows: { date: string; title: string; platform: string }[] = [];
  for (const d of args.draftSchedules) {
    if (d.scheduledDate < today || d.scheduledDate > endIso) continue;
    rows.push({
      date: d.scheduledDate,
      title: d.title || "Planned post",
      platform: d.platform || "Social",
    });
  }
  for (const a of args.assistDates) {
    if (a.date < today || a.date > endIso) continue;
    rows.push({
      date: a.date,
      title: a.title,
      platform: a.platform || "Social",
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  // Dedupe same date+title
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.date}|${r.title.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function resolveRecipient(company: Company): Promise<string | null> {
  const contact = company.profile.approvalContact?.trim();
  if (contact && looksLikeEmail(contact)) return contact;

  const tenant = await getTenant(company.tenantId);
  const onboardingEmail = tenant?.onboarding?.contactEmail?.trim();
  if (onboardingEmail && looksLikeEmail(onboardingEmail)) return onboardingEmail;
  return null;
}

/**
 * Send the 6h–12h implementation plan email. Soft no-op without Resend / recipient.
 * Caller is responsible for idempotency stamps (implementationPlanEmailedAt).
 */
export async function sendImplementationPlanEmail(args: {
  tenantId: string;
  companyId: string;
  campaignId?: string | null;
  runId: string;
}): Promise<{ ok: boolean; detail: string; emailed: boolean }> {
  const company = await getCompany(args.companyId);
  if (!company || company.tenantId !== args.tenantId) {
    return { ok: false, detail: "company_not_found", emailed: false };
  }

  const tenant = await getTenant(args.tenantId);
  const pkg = resolveCompanyPackage(company, tenant);
  const to = await resolveRecipient(company);

  const draftSchedules = args.campaignId
    ? await listCampaignDraftScheduleItems(args.campaignId)
    : [];
  const assists = await listCalendarAssistSuggestions(args.tenantId, [args.companyId], "open");
  const highlights = collectUpcomingPlanHighlights({
    draftSchedules,
    assistDates: assists.map((s) => ({
      date: s.proposedDate,
      title: s.title,
      platform: s.platform,
    })),
  }).slice(0, 12);

  const calendarHref = `${appOrigin()}/client/calendar`;
  const approvalsHref = `${appOrigin()}/client/approvals`;
  const channels = pkg.channels.length ? pkg.channels.join(", ") : "per package";
  const cadence = `~${pkg.postsPerMonth} posts / month · ${pkg.campaignsPerMonth} campaign slot(s)`;

  const highlightHtml =
    highlights.length > 0
      ? `<ul style="padding-left:18px;line-height:1.5">${highlights
          .map(
            (h) =>
              `<li><strong>${escapeHtml(formatDateAu(h.date))}</strong> — ${escapeHtml(h.title)} <span style="color:#666">(${escapeHtml(h.platform)})</span></li>`,
          )
          .join("")}</ul>`
      : `<p style="color:#666">Your calendar is being filled with planned dates — open the portal to review as items appear.</p>`;

  const highlightText =
    highlights.length > 0
      ? highlights.map((h) => `• ${formatDateAu(h.date)} — ${h.title} (${h.platform})`).join("\n")
      : "Your calendar is being filled with planned dates — open the portal to review.";

  const subject = `Your ${pkg.name} marketing implementation plan is ready`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
<p>Hi — we've prepared your first implementation plan for <strong>${escapeHtml(company.name)}</strong>.</p>
<p><strong>Package:</strong> ${escapeHtml(pkg.name)} (A$${pkg.priceAudMonthly}/mo)<br/>
<strong>Channels:</strong> ${escapeHtml(channels)}<br/>
<strong>Cadence:</strong> ${escapeHtml(cadence)}</p>
<p><strong>Upcoming calendar highlights (next 4 weeks)</strong></p>
${highlightHtml}
<p>
  <a href="${escapeHtml(calendarHref)}">View your calendar →</a><br/>
  <a href="${escapeHtml(approvalsHref)}">Review approvals →</a>
</p>
<p style="color:#888;font-size:13px">Nothing publishes without your approval. Drafts and planned dates appear in your portal first.</p>
</div>`;

  const text = `Your ${pkg.name} marketing implementation plan is ready for ${company.name}.

Package: ${pkg.name} (A$${pkg.priceAudMonthly}/mo)
Channels: ${channels}
Cadence: ${cadence}

Upcoming calendar highlights (next 4 weeks):
${highlightText}

Calendar: ${calendarHref}
Approvals: ${approvalsHref}

Nothing publishes without your approval.`;

  if (!to) {
    await logAction(systemActor(args.tenantId), "managed_delivery.implementation_plan_emailed", {
      targetType: "managed_delivery_run",
      targetId: args.runId,
      companyId: args.companyId,
      detail: "no_recipient",
    });
    return { ok: false, detail: "no_recipient", emailed: false };
  }

  const result = await sendEmail({ to, subject, html, text });
  await logAction(systemActor(args.tenantId), "managed_delivery.implementation_plan_emailed", {
    targetType: "managed_delivery_run",
    targetId: args.runId,
    companyId: args.companyId,
    detail: `${to}: ${result.detail}`,
  });

  // Soft no-op when email isn't configured still counts as "attempted" for the stamp.
  return {
    ok: result.ok || result.detail.includes("not configured"),
    detail: result.detail,
    emailed: true,
  };
}
