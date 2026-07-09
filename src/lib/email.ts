// Transactional email via Resend (production notifications).
//
// Env-gated: with no RESEND_API_KEY the calls are safe no-ops (logged), so the
// demo runs with zero external accounts. Supabase Auth sends its own magic-link
// / OTP emails (configure Resend as the Supabase SMTP provider for those); this
// module is for APP notifications — "content awaiting approval", automation
// digests, publishing-failure alerts, etc.

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "Marketing Command Centre <noreply@wattlegroup.dev>";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Compose the From header, overriding only the display name (T6 white-label)
// while keeping the verified sender address from EMAIL_FROM.
function fromHeader(fromName?: string): string {
  if (!fromName) return FROM;
  const addr = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
  return `${fromName} <${addr}>`;
}

export async function sendEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string; // T6: per-tenant white-label sender display name
}): Promise<{ ok: boolean; detail: string }> {
  if (!emailConfigured()) {
    // Demo / unconfigured: don't fail the surrounding action, just record it.
    console.info(`[email] (no RESEND_API_KEY) would send "${input.subject}" to ${input.to}`);
    return { ok: false, detail: "email not configured (no RESEND_API_KEY)" };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: fromHeader(input.fromName),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
    });
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: `sent (id: ${data?.id ?? "?"})` };
  } catch (err) {
    // Log the full error to the SERVER only. Never return the raw error string
    // — it can flow into publish logs / the audit trail (admin-visible), and a
    // third-party SDK gives no guarantee about what its exception text contains.
    console.error("[email] send failed:", err);
    return { ok: false, detail: "email send failed (see server logs)" };
  }
}

// Send many DISTINCT emails (one per recipient — never a shared To/CC, which
// would leak recipients to each other). Uses Resend's batch endpoint (≤100 per
// call) when available, falling back to per-message sends. Best-effort: returns
// how many sent vs failed; never throws. Env-gated: no key → all "failed"
// (unsent) but the caller records the intent. NOTE: for a very large fleet this
// belongs on the job queue — a server action shouldn't fan out thousands of
// sends synchronously; batching keeps it to ceil(N/100) API calls for now.
export async function sendBulkEmail(
  messages: { to: string; subject: string; html: string }[],
  fromName?: string,
): Promise<{ sent: number; failed: number }> {
  if (messages.length === 0) return { sent: 0, failed: 0 };
  if (!emailConfigured()) {
    console.info(`[email] (no RESEND_API_KEY) would send ${messages.length} bulk emails`);
    return { sent: 0, failed: messages.length };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = fromHeader(fromName);
  const payload = (m: { to: string; subject: string; html: string }) => ({
    from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: m.html.replace(/<[^>]+>/g, " "),
  });
  let sent = 0;
  let failed = 0;
  const canBatch = typeof (resend as { batch?: { send?: unknown } }).batch?.send === "function";
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    if (canBatch) {
      try {
        const { error } = await resend.batch.send(chunk.map(payload));
        if (error) { failed += chunk.length; console.error("[email] batch failed:", error.message); }
        else { sent += chunk.length; }
        continue;
      } catch (err) {
        console.error("[email] batch error, falling back to per-message:", err);
      }
    }
    // Per-message fallback.
    for (const m of chunk) {
      const r = await sendEmail({ to: m.to, subject: m.subject, html: m.html, fromName });
      if (r.ok) sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed };
}

// Notify an approver that content is waiting. Safe no-op without Resend.
export async function notifyApprovalNeeded(args: {
  to: string;
  title: string;
  company: string;
  href: string;
}): Promise<void> {
  await sendEmail({
    to: args.to,
    subject: `Approval needed: ${args.title}`,
    html: `<p>New content is awaiting your approval for <strong>${args.company}</strong>.</p>
           <p><a href="${args.href}">Review &amp; approve →</a></p>
           <p style="color:#888">AI drafts · you review · admins approve — nothing publishes without you.</p>`,
  });
}
