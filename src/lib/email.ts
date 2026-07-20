// Transactional email via Resend (production notifications).
//
// Env-gated: EMAIL_SEND_LIVE=true and RESEND_API_KEY are both required. Local
// demo and Preview remain simulated with zero provider calls. Supabase Auth sends its own magic-link
// / OTP emails (configure Resend as the Supabase SMTP provider for those); this
// module is for APP notifications — "content awaiting approval", automation
// digests, publishing-failure alerts, etc.

import { createHash } from "node:crypto";
import { appEnv, emailActivation, localDemoEnabled } from "@/lib/env";
import {
  currentScheduledExecution,
  throwIfScheduledAborted,
} from "@/lib/scheduled-execution";

const FROM = process.env.EMAIL_FROM || "Marketing Command Centre <noreply@wattlegroup.dev>";

export function emailConfigured(): boolean {
  return emailActivation().mode === "live";
}

export function emailSimulationReason(): string | null {
  if (localDemoEnabled()) {
    return "SIMULATED LOCAL DEMO — no email provider request was made";
  }
  const activation = emailActivation();
  if (!activation.liveRequested) {
    return "email simulated (EMAIL_SEND_LIVE is not true)";
  }
  if (!activation.credentialConfigured) {
    return "email blocked (EMAIL_SEND_LIVE=true but RESEND_API_KEY is not configured)";
  }
  if (!activation.environmentAllowed) {
    return `email simulated (${appEnv()} blocks live provider requests)`;
  }
  return null;
}

// Compose the From header, overriding only the display name (T6 white-label)
// while keeping the verified sender address from EMAIL_FROM.
function fromHeader(fromName?: string): string {
  if (!fromName) return FROM;
  const addr = FROM.match(/<([^>]+)>/)?.[1] ?? FROM;
  return `${fromName} <${addr}>`;
}

export function resendIdempotencyOptions(
  idempotencyKey?: string,
): { idempotencyKey: string } | undefined {
  return idempotencyKey ? { idempotencyKey } : undefined;
}

function scheduledEmailIdempotencyKey(
  payload: unknown,
  provided?: string,
  prefix = "scheduled-email",
): string | undefined {
  if (provided) return provided;
  if (!currentScheduledExecution()) return undefined;
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}/${digest}`;
}

async function resendRequest(
  path: "/emails" | "/emails/batch",
  payload: unknown,
  idempotencyKey?: string,
): Promise<{ ok: boolean; id?: string; detail: string }> {
  const execution = currentScheduledExecution();
  throwIfScheduledAborted(execution, 500);
  const response = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
    signal: execution?.signal,
  });
  const body = (await response.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;
  if (!response.ok) {
    return {
      ok: false,
      detail: body?.message ?? `Resend returned HTTP ${response.status}`,
    };
  }
  return { ok: true, id: body?.id, detail: "sent" };
}

export async function sendEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string; // T6: per-tenant white-label sender display name
  /** Stable operation key forwarded to Resend (retained for 24 hours). */
  idempotencyKey?: string;
}): Promise<{ ok: boolean; detail: string; simulated: boolean }> {
  throwIfScheduledAborted(currentScheduledExecution(), 500);
  const simulationReason = emailSimulationReason();
  if (simulationReason) {
    console.info(`[email] ${simulationReason}: "${input.subject}" to ${input.to}`);
    return {
      ok: false,
      detail: simulationReason,
      simulated: true,
    };
  }
  try {
    const payload = {
      from: fromHeader(input.fromName),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
    };
    const result = await resendRequest(
      "/emails",
      payload,
      scheduledEmailIdempotencyKey(payload, input.idempotencyKey),
    );
    if (!result.ok) return { ok: false, detail: result.detail, simulated: false };
    return { ok: true, detail: `sent (id: ${result.id ?? "?"})`, simulated: false };
  } catch (err) {
    const execution = currentScheduledExecution();
    if (
      execution?.signal.aborted ||
      (execution && Date.now() >= execution.deadlineMs)
    ) throw err;
    // Log the full error to the SERVER only. Never return the raw error string
    // — it can flow into publish logs / the audit trail (admin-visible), and a
    // third-party SDK gives no guarantee about what its exception text contains.
    console.error("[email] send failed:", err);
    return { ok: false, detail: "email send failed (see server logs)", simulated: false };
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
): Promise<{ sent: number; failed: number; simulated: number; detail?: string }> {
  throwIfScheduledAborted(currentScheduledExecution(), 500);
  if (messages.length === 0) return { sent: 0, failed: 0, simulated: 0 };
  const simulationReason = emailSimulationReason();
  if (simulationReason) {
    console.info(`[email] ${simulationReason}: ${messages.length} bulk emails`);
    return {
      sent: 0,
      failed: 0,
      simulated: messages.length,
      detail: simulationReason,
    };
  }
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
  for (let i = 0; i < messages.length; i += 100) {
    throwIfScheduledAborted(currentScheduledExecution(), 500);
    const chunk = messages.slice(i, i + 100);
    const batch = chunk.map(payload);
    try {
      const result = await resendRequest(
        "/emails/batch",
        batch,
        scheduledEmailIdempotencyKey(
          batch,
          undefined,
          "batch-scheduled-email",
        ),
      );
      if (result.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        console.error("[email] batch failed:", result.detail);
      }
    } catch (err) {
      if (currentScheduledExecution()?.signal.aborted) throw err;
      failed += chunk.length;
      console.error("[email] batch threw:", err);
    }
  }
  return { sent, failed, simulated: 0 };
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
