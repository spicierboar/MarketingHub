// Exception-only client notify for managed delivery blockers/failures.
// Client-facing copy only — no AI jargon. sendEmail is a no-op without RESEND_API_KEY.

import { logAction } from "@/lib/audit";
import { getCompany } from "@/lib/db";
import { listPortalRecipientsForCompany } from "@/lib/client-reports";
import { sendEmail } from "@/lib/email";
import type { ActingUser } from "@/lib/types";

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
    id: "system:managed-exception",
    email: "managed-exception@marketing-command-centre.system",
    name: "Managed service",
    role: "super_admin",
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

export async function notifyClientException(args: {
  tenantId: string;
  companyId: string;
  kind: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; detail: string }> {
  const company = await getCompany(args.companyId);
  if (!company || company.tenantId !== args.tenantId) {
    return { ok: false, detail: "company_not_found" };
  }

  const recipients = new Map<string, string>();
  const contact = company.profile.approvalContact?.trim();
  if (contact && looksLikeEmail(contact)) {
    recipients.set(contact.toLowerCase(), contact);
  }

  const portal = await listPortalRecipientsForCompany(args.tenantId, args.companyId);
  for (const r of portal) {
    if (r.email && looksLikeEmail(r.email)) {
      recipients.set(r.email.toLowerCase(), r.email);
    }
  }

  if (recipients.size === 0) {
    await logAction(systemActor(args.tenantId), "managed_exception.notified", {
      targetType: "company",
      targetId: args.companyId,
      companyId: args.companyId,
      detail: `${args.kind}: no recipient`,
    });
    return { ok: false, detail: "no_recipient" };
  }

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#111">
<p>${escapeHtml(args.body)}</p>
<p style="color:#666;font-size:13px">This is an update about your marketing service for <strong>${escapeHtml(company.name)}</strong>.</p>
</div>`;

  let sent = 0;
  let lastDetail = "";
  for (const to of recipients.values()) {
    const r = await sendEmail({
      to,
      subject: args.subject,
      html,
      text: args.body,
    });
    lastDetail = r.detail;
    if (r.ok) sent += 1;
  }

  await logAction(systemActor(args.tenantId), "managed_exception.notified", {
    targetType: "company",
    targetId: args.companyId,
    companyId: args.companyId,
    detail: `${args.kind}: ${sent}/${recipients.size} · ${lastDetail}`,
  });

  // Never throw — missing RESEND key is a soft no-op (sendEmail returns ok:false).
  return {
    ok: sent > 0 || lastDetail.includes("not configured"),
    detail: lastDetail || (sent > 0 ? "sent" : "unsent"),
  };
}
