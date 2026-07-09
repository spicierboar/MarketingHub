// Terms-update broadcast (Phase B).
//
// When a new Terms version is published, email every active client that the
// terms changed and that they'll be asked to re-accept on next sign-in. Fires
// best-effort on publish and is re-sendable from Platform Admin (e.g. if Resend
// wasn't configured at publish time). Env-gated: with no RESEND_API_KEY the
// recipients are counted but nothing is sent, so the demo still records the
// intent. The force-re-acceptance gate (requireUser) is the actual enforcement;
// this email is the courtesy heads-up.

import { listActiveRecipients, updateTermsVersion } from "@/lib/db";
import { emailConfigured, sendBulkEmail } from "@/lib/email";
import { logAction } from "@/lib/audit";
import { now } from "@/lib/utils";
import type { ActingUser, TermsVersion } from "@/lib/types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function termsEmailHtml(version: TermsVersion, name: string, origin: string): string {
  const summary = version.summary ? `<p><strong>What changed:</strong> ${escapeHtml(version.summary)}</p>` : "";
  return `<p>Hi ${escapeHtml(name || "there")},</p>
<p>We've updated our Terms of Service (version ${version.version}, effective ${escapeHtml(version.effectiveDate)}).</p>
${summary}
<p>The next time you sign in you'll be asked to review and accept the updated terms before continuing.</p>
<p><a href="${origin}/terms">Read the full terms →</a></p>
<p style="color:#888">Marketing Command Centre</p>`;
}

// Send the "terms updated" email to every active recipient. Records notifiedAt/
// notifiedCount on the version and audits the outcome. Never throws — a mail
// failure must not undo a successful publish.
export async function broadcastTermsUpdate(
  actor: ActingUser,
  version: TermsVersion,
  origin: string,
): Promise<{ recipients: number; sent: number; failed: number; emailConfigured: boolean }> {
  // WHOLLY best-effort: the terms version is already durably published before we
  // get here, so NOTHING in the broadcast (recipient gather, send, stamp, audit)
  // may throw out of the caller — a transient blip must not make a successful
  // publish look failed (which would tempt a retry → duplicate version).
  try {
    const recipients = await listActiveRecipients();
    const messages = recipients.map((r) => ({
      to: r.email,
      subject: `Our Terms of Service have been updated (v${version.version})`,
      html: termsEmailHtml(version, r.name, origin),
    }));
    const result = await sendBulkEmail(messages);
    await updateTermsVersion(version.id, { notifiedAt: now(), notifiedCount: result.sent });
    await logAction(actor, "terms.notified", {
      detail: emailConfigured()
        ? `Terms v${version.version}: emailed ${result.sent}/${recipients.length} client(s)${result.failed ? `, ${result.failed} failed` : ""}`
        : `Terms v${version.version}: ${recipients.length} recipient(s) — email NOT sent (RESEND_API_KEY not configured)`,
    });
    return { recipients: recipients.length, sent: result.sent, failed: result.failed, emailConfigured: emailConfigured() };
  } catch (err) {
    console.error("[terms] broadcast failed (publish already succeeded):", err);
    return { recipients: 0, sent: 0, failed: 0, emailConfigured: emailConfigured() };
  }
}
