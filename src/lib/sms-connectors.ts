// SMS provider connectors (W3 M32).

export interface SmsDispatchResult {
  ok: boolean;
  detail: string;
  delivered: number;
  failed: number;
  actualCostUsd: number;
}

export function smsLive(): boolean {
  return process.env.SMS_LIVE === "true";
}

export function smsPlatformConfigured(): boolean {
  return (
    !!process.env.TWILIO_ACCOUNT_SID?.trim() &&
    !!process.env.TWILIO_AUTH_TOKEN?.trim() &&
    !!process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

export function smsConfigured(): boolean {
  return smsLive() && smsPlatformConfigured();
}

function seed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function simulatedDeliver(to: string): boolean {
  return seed(to) > 0.08;
}

export async function dispatchSmsBatch(input: {
  messages: { to: string; body: string }[];
  costPerSegmentUsd: number;
  segmentsPerMessage: number;
}): Promise<SmsDispatchResult> {
  const { messages, costPerSegmentUsd, segmentsPerMessage } = input;
  if (messages.length === 0) {
    return { ok: true, detail: "no messages", delivered: 0, failed: 0, actualCostUsd: 0 };
  }
  let delivered = 0;
  let failed = 0;
  for (const m of messages) {
    if (simulatedDeliver(m.to)) delivered += 1;
    else failed += 1;
  }
  const actualCostUsd = Math.round(delivered * segmentsPerMessage * costPerSegmentUsd * 100) / 100;
  const mode = smsConfigured() ? "live stub" : "simulated";
  console.info(`[sms] (${mode}) ${delivered}/${messages.length} delivered`);
  return { ok: true, detail: `${mode}: ${delivered} delivered, ${failed} failed`, delivered, failed, actualCostUsd };
}
