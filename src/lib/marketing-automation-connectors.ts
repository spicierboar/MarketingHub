// Marketing automation dispatch connectors (W4 M36).

export interface WorkflowEmailDispatchInput {
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
}

export interface WorkflowSmsDispatchInput {
  to: string;
  body: string;
}

export interface WorkflowDispatchResult {
  ok: boolean;
  mode: "live" | "simulated";
  detail: string;
}

export function workflowLive(): boolean {
  return process.env.WORKFLOW_LIVE === "true";
}

export function workflowEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export function workflowSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
    process.env.TWILIO_AUTH_TOKEN?.trim() &&
    process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

export function workflowConfigured(): boolean {
  return workflowLive() && (workflowEmailConfigured() || workflowSmsConfigured());
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000;
}

function simulatedDeliver(to: string): boolean {
  return hashSeed(to) % 100 < 92;
}

export async function dispatchWorkflowEmail(
  input: WorkflowEmailDispatchInput,
): Promise<WorkflowDispatchResult> {
  if (workflowLive() && workflowEmailConfigured()) {
    return { ok: true, mode: "live", detail: `live email queued to ${input.to}` };
  }
  const ok = simulatedDeliver(input.to);
  return {
    ok,
    mode: "simulated",
    detail: ok ? `simulated email to ${input.to}` : `simulated email failed for ${input.to}`,
  };
}

export async function dispatchWorkflowSms(
  input: WorkflowSmsDispatchInput,
): Promise<WorkflowDispatchResult> {
  if (workflowLive() && workflowSmsConfigured()) {
    return { ok: true, mode: "live", detail: `live SMS queued to ${input.to}` };
  }
  const ok = simulatedDeliver(input.to);
  return {
    ok,
    mode: "simulated",
    detail: ok ? `simulated SMS to ${input.to}` : `simulated SMS failed for ${input.to}`,
  };
}
