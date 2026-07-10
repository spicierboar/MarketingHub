import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createContent, getCompany, listContent } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  apiActor,
  assertCompanyInScope,
  companyAllowed,
  resolveApiKey,
  requireScope,
  checkPublicApiRouteRate,
} from "@/lib/public-api/auth";
import { dispatchPartnerWebhook } from "@/lib/public-api/partner-webhooks";
import { serializeContent } from "@/lib/public-api/serializers";

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "content:read");
  if (denied) return denied;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const scopeErr = await assertCompanyInScope(auth, companyId);
    if (scopeErr) return scopeErr;
  }
  let items = await listContent(auth.tenantId);
  items = items.filter((i) => companyAllowed(auth, i.companyId));
  if (companyId) items = items.filter((i) => i.companyId === companyId);
  return NextResponse.json({ data: items.map(serializeContent) });
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "write");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "content:write");
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const companyId = String(body.companyId ?? "");
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!companyId || !title || !text) {
    return NextResponse.json({ error: "companyId, title, body required" }, { status: 400 });
  }
  const scopeErr = await assertCompanyInScope(auth, companyId);
  if (scopeErr) return scopeErr;
  const company = await getCompany(companyId);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  const item = await createContent({
    companyId,
    type: "social_post",
    title,
    body: text,
    status: "ai_draft",
    createdById: auth.apiKey.id,
  });
  await logAction(apiActor(auth), "api.content_created", {
    targetType: "content",
    targetId: item.id,
    companyId,
    detail: `via public API key ${auth.apiKey.name}`,
  });
  await dispatchPartnerWebhook(auth.tenantId, "content.created", serializeContent(item));
  return NextResponse.json({ data: serializeContent(item) }, { status: 201 });
}
