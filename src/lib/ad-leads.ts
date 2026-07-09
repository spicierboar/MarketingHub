// Paid-ad lead ingestion (Module 6 — live path behind ADS_LIVE).
//
// Meta Lead Ads + Google lead-form webhooks POST new leads; we verify each
// platform's signature, resolve the company from the delegated ad account's
// external id, and createLead() for attribution. Until ADS_LIVE is set, the
// webhook route refuses and admins record leads manually (recordLeadAction).

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createLead,
  findAdAccountByExternalId,
  findLeadByExternalId,
  getCompany,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { logAction } from "@/lib/audit";
import type { AdPlatform } from "@/lib/types";

const WEBHOOK_ACTOR = { id: "ad_lead_webhook", email: "webhooks@command-centre.local" };

export function metaLeadWebhookSecret(): string | undefined {
  return process.env.META_APP_SECRET?.trim() || undefined;
}

export function metaLeadVerifyToken(): string | undefined {
  return process.env.META_LEAD_WEBHOOK_VERIFY_TOKEN?.trim() || undefined;
}

export function googleLeadWebhookSecret(): string | undefined {
  return process.env.GOOGLE_ADS_LEAD_WEBHOOK_SECRET?.trim() || undefined;
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Meta Graph API webhooks: X-Hub-Signature-256 = sha256=<hex-hmac of raw body>.
export function verifyMetaLeadSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeEquals(expected, provided);
}

// Google Lead Form Extensions: X-Goog-Signature = base64(HMAC-SHA256(body, key)).
export function verifyGoogleLeadSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return constantTimeEquals(expected, signatureHeader);
}

export interface ParsedAdLead {
  platform: AdPlatform;
  externalLeadId: string;
  externalAccountId: string;
  contact: string;
  capturedAt?: string;
  source: "meta_lead_ad" | "google_lead_form";
}

type UnknownRecord = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function numIso(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v * 1000).toISOString();
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s);
  if (Number.isFinite(n) && /^\d+$/.test(s)) return new Date(n * 1000).toISOString();
  const d = Date.parse(s);
  return Number.isFinite(d) ? new Date(d).toISOString() : undefined;
}

function normalizeMetaAccountId(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("act_")) return t;
  if (/^\d+$/.test(t)) return `act_${t}`;
  return t;
}

function contactFromGoogleColumns(columns: unknown): string {
  if (!Array.isArray(columns)) return "Google lead";
  const parts: string[] = [];
  for (const col of columns) {
    const row = col as UnknownRecord;
    const label = str(row.column_name) ?? str(row.column_id);
    const value = str(row.string_value) ?? str(row.column_value);
    if (label && value && /name|email|phone/i.test(label)) parts.push(value);
  }
  return parts.length ? parts.slice(0, 2).join(" · ") : "Google lead";
}

// Parse a Meta leadgen webhook payload. The webhook carries leadgen_id + optional
// ad_account_id; full PII is fetched via Graph API in production — we store a
// minimal contact handle until that drop-in lands.
export function parseMetaLeadPayload(
  payload: unknown,
  accountOverride?: string,
): ParsedAdLead | null {
  const root = payload as UnknownRecord;
  const entries = root.entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const changes = (entry as UnknownRecord).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const c = change as UnknownRecord;
      if (str(c.field) !== "leadgen") continue;
      const value = c.value as UnknownRecord | undefined;
      if (!value) continue;
      const externalLeadId = str(value.leadgen_id);
      if (!externalLeadId) continue;
      const externalAccountId = normalizeMetaAccountId(
        accountOverride ??
          str(value.ad_account_id) ??
          str(value.account_id) ??
          str(value.page_id) ??
          "",
      );
      if (!externalAccountId) continue;
      const capturedAt = numIso(value.created_time);
      return {
        platform: "meta_ads",
        externalLeadId,
        externalAccountId,
        contact: `Lead ${externalLeadId.slice(-8)}`,
        capturedAt,
        source: "meta_lead_ad",
      };
    }
  }
  return null;
}

// Parse a Google Lead Form Extension webhook payload.
export function parseGoogleLeadPayload(
  payload: unknown,
  accountOverride?: string,
): ParsedAdLead | null {
  const root = payload as UnknownRecord;
  const externalLeadId = str(root.lead_id) ?? str(root.leadId);
  if (!externalLeadId) return null;
  const customerId = str(root.customer_id) ?? str(root.google_key) ?? accountOverride;
  if (!customerId) return null;
  const externalAccountId = customerId.replace(/-/g, "");
  return {
    platform: "google_ads",
    externalLeadId,
    externalAccountId,
    contact: contactFromGoogleColumns(root.user_column_data ?? root.userColumnData),
    capturedAt: numIso(root.submission_date) ?? numIso(root.submitted_at),
    source: "google_lead_form",
  };
}

export type IngestLeadResult =
  | { ok: true; created: true; leadId: string }
  | { ok: true; created: false; reason: "duplicate" | "unknown_account" }
  | { ok: false; reason: "invalid_payload" };

// Resolve the delegated ad account → tenant → createLead (idempotent on
// externalLeadId). Session-less: runs in service context once tenant is known.
export async function ingestAdLead(parsed: ParsedAdLead): Promise<IngestLeadResult> {
  const account = await findAdAccountByExternalId(parsed.platform, parsed.externalAccountId);
  if (!account || account.status !== "connected") {
    return { ok: true, created: false, reason: "unknown_account" };
  }
  const company = await getCompany(account.companyId);
  if (!company) return { ok: true, created: false, reason: "unknown_account" };

  return runInServiceContext(company.tenantId, async () => {
    const existing = await findLeadByExternalId(
      account.companyId,
      parsed.platform,
      parsed.externalLeadId,
    );
    if (existing) return { ok: true, created: false, reason: "duplicate" as const };

    const lead = await createLead({
      companyId: account.companyId,
      platform: parsed.platform,
      adCampaignId: null,
      contact: parsed.contact,
      source: parsed.source,
      externalLeadId: parsed.externalLeadId,
      status: "new",
      capturedAt: parsed.capturedAt ?? new Date().toISOString(),
    });
    await logAction(WEBHOOK_ACTOR, "lead.ingested", {
      tenantId: company.tenantId,
      companyId: account.companyId,
      targetType: "lead",
      targetId: lead.id,
      detail: `${parsed.platform} ${parsed.source} (${parsed.externalLeadId})`,
    });
    return { ok: true, created: true, leadId: lead.id };
  });
}
