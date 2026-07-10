import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getContent, updateContent } from "@/lib/db";
import { logAction } from "@/lib/audit";
import type { ContentStatus } from "@/lib/types";
import {
  apiActor,
  assertCompanyInScope,
  resolveApiKey,
  requireScope,
  checkPublicApiRouteRate,
} from "@/lib/public-api/auth";
import { dispatchPartnerWebhook } from "@/lib/public-api/partner-webhooks";
import { serializeContent } from "@/lib/public-api/serializers";

const ALLOWED_STATUS: ContentStatus[] = [
  "ai_draft",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "archived",
];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "content:read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const item = await getContent(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const scopeErr = await assertCompanyInScope(auth, item.companyId);
  if (scopeErr) return scopeErr;
  return NextResponse.json({ data: serializeContent(item) });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "write");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "content:write");
  if (denied) return denied;
  const { id } = await ctx.params;
  const existing = await getContent(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const scopeErr = await assertCompanyInScope(auth, existing.companyId);
  if (scopeErr) return scopeErr;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const patch: { title?: string; body?: string; status?: ContentStatus } = {};
  if (body.title !== undefined) patch.title = String(body.title).trim();
  if (body.body !== undefined) patch.body = String(body.body).trim();
  if (body.status !== undefined) {
    const status = String(body.status) as ContentStatus;
    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = status;
  }
  const updated = await updateContent(id, patch);
  if (!updated) return NextResponse.json({ error: "update failed" }, { status: 500 });
  await logAction(apiActor(auth), "api.content_updated", {
    targetType: "content",
    targetId: id,
    companyId: existing.companyId,
    detail: `via public API key ${auth.apiKey.name}`,
  });
  await dispatchPartnerWebhook(auth.tenantId, "content.updated", serializeContent(updated));
  return NextResponse.json({ data: serializeContent(updated) });
}
