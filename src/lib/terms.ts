// Legal-doc update broadcast (Terms & Privacy).
//
// When a new Terms or Privacy version is published, email every active client
// that the document changed and that they'll be asked to re-accept on next
// sign-in. Fires best-effort on publish and is re-sendable from Settings /
// Platform Admin. Env-gated: with no RESEND_API_KEY the recipients are counted
// but nothing is sent. The force-re-acceptance gate (requireUser) is the actual
// enforcement; this email is the courtesy heads-up.

import { getMembership, getTenant, listActiveRecipients, updateTermsVersion } from "@/lib/db";
import { isPlatformAdmin, isTenantOwner } from "@/lib/auth/rbac";
import { ensurePlatformAgencyPublisherContext } from "@/lib/platform-agency";
import { emailConfigured, sendBulkEmail } from "@/lib/email";
import { logAction } from "@/lib/audit";
import { now } from "@/lib/utils";
import { publicLegalPath } from "@/lib/legal-display";
import type { ActingUser, LegalDocKind, TermsVersion } from "@/lib/types";

/** Agency ops roles that may publish platform legal docs (DB membership, not session stamp). */
function isAgencyPublisherRole(role: string | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Who may publish platform Terms / Privacy: platform admins, and agency ops
 * (owner/admin) on the platform agency seat — including after kind repair and
 * leftover-admin promote outside production.
 *
 * Client (business_group) seats cannot publish. Session `tenantRole` alone is
 * not trusted: stale admin stamps + orphan duplicate agency rows caused the
 * false “You can’t publish from this workspace” lockout.
 */
export async function canPublishLegalDocs(user: ActingUser): Promise<boolean> {
  if (isPlatformAdmin(user)) return true;

  const { agency, active } = await ensurePlatformAgencyPublisherContext(user);

  // DB membership after heal/promote — session stamp may still say "admin".
  const agencyMem = await getMembership(agency.id, user.id);
  if (agency?.kind === "agency" && isAgencyPublisherRole(agencyMem?.role)) {
    return true;
  }

  // Signed-in seat after in-place name/kind heal (duplicate Staging Agency rows).
  if (active && active.id !== agency.id && active.kind === "agency") {
    const activeMem = await getMembership(active.id, user.id);
    if (isAgencyPublisherRole(activeMem?.role)) return true;
  }

  // Last resort: re-read active id from session tenant (heal returned stale active).
  const tenant = await getTenant(user.tenantId);
  if (tenant?.kind === "agency") {
    const mem = await getMembership(tenant.id, user.id);
    if (isAgencyPublisherRole(mem?.role)) return true;
    // Session owner stamp only when DB membership is missing but seat is agency
    // (demo/edge) — still never allow business_group.
    if (isTenantOwner(user)) return true;
  }

  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function legalDocLabel(kind: LegalDocKind): string {
  return kind === "privacy" ? "Privacy Policy" : "Terms of Service";
}

function legalDocEmailHtml(version: TermsVersion, name: string, origin: string): string {
  const label = legalDocLabel(version.kind);
  const summary = version.summary ? `<p><strong>What changed:</strong> ${escapeHtml(version.summary)}</p>` : "";
  const publicPath = publicLegalPath(version.kind);
  const link = `<p><a href="${origin}${publicPath}">Read the full ${escapeHtml(label)} →</a></p>
<p><a href="${origin}/accept-terms">Review and accept →</a></p>`;
  return `<p>Hi ${escapeHtml(name || "there")},</p>
<p>We've updated our ${escapeHtml(label)} (version ${version.version}, effective ${escapeHtml(version.effectiveDate)}).</p>
${summary}
<p>The next time you sign in you'll be asked to review and accept the updated document before continuing.</p>
${link}
<p style="color:#888">Marketing Command Centre</p>`;
}

/** @deprecated Prefer broadcastLegalDocUpdate — kept for platform-admin call sites. */
export async function broadcastTermsUpdate(
  actor: ActingUser,
  version: TermsVersion,
  origin: string,
): Promise<{ recipients: number; sent: number; failed: number; emailConfigured: boolean }> {
  return broadcastLegalDocUpdate(actor, version, origin);
}

// Send the "legal doc updated" email to every active recipient. Records notifiedAt/
// notifiedCount on the version and audits the outcome. Never throws — a mail
// failure must not undo a successful publish.
export async function broadcastLegalDocUpdate(
  actor: ActingUser,
  version: TermsVersion,
  origin: string,
): Promise<{ recipients: number; sent: number; failed: number; emailConfigured: boolean }> {
  // WHOLLY best-effort: the version is already durably published before we
  // get here, so NOTHING in the broadcast (recipient gather, send, stamp, audit)
  // may throw out of the caller — a transient blip must not make a successful
  // publish look failed (which would tempt a retry → duplicate version).
  try {
    const label = legalDocLabel(version.kind);
    const recipients = await listActiveRecipients();
    const messages = recipients.map((r) => ({
      to: r.email,
      subject: `Our ${label} has been updated (v${version.version})`,
      html: legalDocEmailHtml(version, r.name, origin),
    }));
    const result = await sendBulkEmail(messages);
    await updateTermsVersion(version.id, { notifiedAt: now(), notifiedCount: result.sent });
    const auditAction = version.kind === "privacy" ? "privacy.notified" : "terms.notified";
    await logAction(actor, auditAction, {
      detail: emailConfigured()
        ? `${label} v${version.version}: emailed ${result.sent}/${recipients.length} client(s)${result.failed ? `, ${result.failed} failed` : ""}`
        : `${label} v${version.version}: ${recipients.length} recipient(s) — email NOT sent (RESEND_API_KEY not configured)`,
    });
    return { recipients: recipients.length, sent: result.sent, failed: result.failed, emailConfigured: emailConfigured() };
  } catch (err) {
    console.error("[legal-docs] broadcast failed (publish already succeeded):", err);
    return { recipients: 0, sent: 0, failed: 0, emailConfigured: emailConfigured() };
  }
}
