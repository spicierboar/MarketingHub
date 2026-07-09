// Paid-ad lead-ingestion webhook (Module 6 — behind ADS_LIVE).
//
// Meta Lead Ads + Google lead-form extensions POST new leads here. Each
// platform's signature is verified before ingestAdLead() resolves the company
// from the delegated ad account's external id and createLead() for attribution.
//
// Isolation: the tenant is resolved from OUR ad_accounts row (external id match
// → company → tenantId) — never from anything the caller supplies in the body.
// GET handles Meta's hub.verify_token challenge when ADS_LIVE is on.

import { NextRequest, NextResponse } from "next/server";
import { adsLive } from "@/lib/ad-connectors";
import {
  googleLeadWebhookSecret,
  ingestAdLead,
  metaLeadVerifyToken,
  metaLeadWebhookSecret,
  parseGoogleLeadPayload,
  parseMetaLeadPayload,
  verifyGoogleLeadSignature,
  verifyMetaLeadSignature,
} from "@/lib/ad-leads";
import type { AdPlatform } from "@/lib/types";

function asPlatform(raw: string | null): AdPlatform | null {
  if (raw === "meta_ads" || raw === "google_ads") return raw;
  return null;
}

// Meta subscription verification (hub.mode=subscribe).
export async function GET(req: NextRequest) {
  if (!adsLive()) {
    return NextResponse.json({ error: "ads not live" }, { status: 503 });
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const platform = asPlatform(url.searchParams.get("platform"));
  if (platform !== "meta_ads" || mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const expected = metaLeadVerifyToken();
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "verify token mismatch" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  if (!adsLive()) {
    return NextResponse.json({ error: "ads not live" }, { status: 503 });
  }
  const url = new URL(req.url);
  const platform = asPlatform(url.searchParams.get("platform"));
  if (!platform) {
    return NextResponse.json({ error: "platform query required (meta_ads|google_ads)" }, { status: 400 });
  }
  const accountOverride = url.searchParams.get("account")?.trim() || undefined;
  const rawBody = await req.text();

  if (platform === "meta_ads") {
    const secret = metaLeadWebhookSecret();
    if (!secret) {
      return NextResponse.json({ error: "META_APP_SECRET not configured" }, { status: 503 });
    }
    if (!verifyMetaLeadSignature(rawBody, req.headers.get("x-hub-signature-256"), secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
  } else {
    const secret = googleLeadWebhookSecret();
    if (!secret) {
      return NextResponse.json({ error: "GOOGLE_ADS_LEAD_WEBHOOK_SECRET not configured" }, { status: 503 });
    }
    if (!verifyGoogleLeadSignature(rawBody, req.headers.get("x-goog-signature"), secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const parsed =
    platform === "meta_ads"
      ? parseMetaLeadPayload(payload, accountOverride)
      : parseGoogleLeadPayload(payload, accountOverride);
  if (!parsed) {
    return NextResponse.json({ error: "unrecognised lead payload" }, { status: 400 });
  }

  try {
    const result = await ingestAdLead(parsed);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({
      received: true,
      created: result.created,
      ...(result.created ? { leadId: result.leadId } : { reason: result.reason }),
    });
  } catch (err) {
    console.error("[ads] lead webhook handler failed:", err);
    return NextResponse.json({ received: true, error: "handler failed" });
  }
}
