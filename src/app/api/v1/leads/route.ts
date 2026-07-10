import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createLead, listLeads } from "@/lib/db";
import { logAction } from "@/lib/audit";
import type { AdPlatform, LeadStatus } from "@/lib/types";
import { now } from "@/lib/utils";
import {
  apiActor,
  assertCompanyInScope,
  companyAllowed,
  resolveApiKey,
  requireScope,
  checkPublicApiRouteRate,
} from "@/lib/public-api/auth";
import { dispatchPartnerWebhook } from "@/lib/public-api/partner-webhooks";
import { serializeLead } from "@/lib/public-api/serializers";

const PLATFORMS: AdPlatform[] = ["meta_ads", "google_ads"];
const STATUSES: LeadStatus[] = ["new", "qualified", "won", "lost"];

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "leads:read");
  if (denied) return denied;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const scopeErr = await assertCompanyInScope(auth, companyId);
    if (scopeErr) return scopeErr;
  }
  let leads = await listLeads(auth.tenantId, companyId ?? undefined);
  leads = leads.filter((l) => companyAllowed(auth, l.companyId));
  return NextResponse.json({ data: leads.map(serializeLead) });
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "write");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "leads:write");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = String(body.companyId ?? "");
  const contact = String(body.contact ?? "").trim();
  if (!companyId || !contact) {
    return NextResponse.json({ error: "companyId and contact required" }, { status: 400 });
  }
  const scopeErr = await assertCompanyInScope(auth, companyId);
  if (scopeErr) return scopeErr;
  const platform = (body.platform ? String(body.platform) : "meta_ads") as AdPlatform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "invalid platform" }, { status: 400 });
  }
  const status = (body.status ? String(body.status) : "new") as LeadStatus;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  const lead = await createLead({
    companyId,
    platform,
    contact,
    source: "api",
    status,
    capturedAt: now(),
    valueUsd: body.valueUsd !== undefined ? Number(body.valueUsd) : undefined,
  });
  await logAction(apiActor(auth), "api.lead_created", {
    targetType: "lead",
    targetId: lead.id,
    companyId,
    detail: `via public API key ${auth.apiKey.name}`,
  });
  await dispatchPartnerWebhook(auth.tenantId, "lead.created", serializeLead(lead));
  return NextResponse.json({ data: serializeLead(lead) }, { status: 201 });
}
