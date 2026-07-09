// Partner webhook registration, verification, and signed outbound delivery.

import { createHmac, randomBytes } from "node:crypto";
import {
  createPartnerWebhook,
  listPartnerWebhooks,
  updatePartnerWebhook,
} from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/crypto";
import type { PartnerWebhook, PartnerWebhookEvent } from "@/lib/types";
import { now } from "@/lib/utils";

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function signWebhookPayload(secret: string, body: string, timestamp: number): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null,
  toleranceSec = 300,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return expected === v1;
}

export interface RegisterPartnerWebhookInput {
  tenantId: string;
  label: string;
  url: string;
  events: PartnerWebhookEvent[];
  createdById: string;
}

export async function registerPartnerWebhook(
  input: RegisterPartnerWebhookInput,
): Promise<PartnerWebhook> {
  const secret = generateWebhookSecret();
  return createPartnerWebhook({
    tenantId: input.tenantId,
    label: input.label.trim(),
    url: input.url.trim(),
    events: input.events,
    secretEnc: encryptToken(secret),
    status: "pending",
    createdById: input.createdById,
    verifiedAt: null,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
  });
}

export async function verifyPartnerWebhookEndpoint(
  webhook: PartnerWebhook,
): Promise<{ ok: boolean; detail: string }> {
  const challenge = randomBytes(16).toString("hex");
  const url = new URL(webhook.url);
  url.searchParams.set("cc_challenge", challenge);
  url.searchParams.set("cc_mode", "verify");
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.text()).trim();
    if (res.ok && body === challenge) {
      await updatePartnerWebhook(webhook.id, { status: "active", verifiedAt: now() });
      return { ok: true, detail: "verified" };
    }
    return { ok: false, detail: `verification failed (${res.status})` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, detail: msg };
  }
}

export async function dispatchPartnerWebhook(
  tenantId: string,
  event: PartnerWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = (await listPartnerWebhooks(tenantId)).filter(
    (h) => h.status === "active" && h.events.includes(event),
  );
  const body = JSON.stringify({ event, data: payload, sentAt: now() });
  for (const hook of hooks) {
    const secret = decryptToken(hook.secretEnc);
    const ts = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(secret, body, ts);
    let status = "ok";
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CC-Event": event,
          "X-CC-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) status = `http_${res.status}`;
    } catch {
      status = "delivery_failed";
    }
    await updatePartnerWebhook(hook.id, {
      lastDeliveryAt: now(),
      lastDeliveryStatus: status,
    });
  }
}
