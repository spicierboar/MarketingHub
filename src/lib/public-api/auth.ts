import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiKeyByPrefix, getCompany, updateApiKey } from "@/lib/db";
import { checkRate } from "@/lib/ratelimit";
import type { ApiKey, ApiKeyScope } from "@/lib/types";
import { now } from "@/lib/utils";
import { hashApiKey } from "@/lib/public-api/api-keys";
import { publicApiLive } from "@/lib/public-api/gate";

const PUBLIC_API_AUTH_LIMIT = { bucket: "public_api_auth", limit: 60, windowSeconds: 60 };
const PUBLIC_API_READ_LIMIT = { bucket: "public_api_read", limit: 90, windowSeconds: 60 };
const PUBLIC_API_WRITE_LIMIT = { bucket: "public_api_write", limit: 40, windowSeconds: 60 };

export interface ApiAuthContext {
  apiKey: ApiKey;
  tenantId: string;
  scopes: Set<ApiKeyScope>;
}

export function apiActor(ctx: ApiAuthContext) {
  return { id: ctx.apiKey.id, email: `api-key:${ctx.apiKey.name}`, tenantId: ctx.tenantId };
}

export async function resolveApiKey(req: NextRequest): Promise<ApiAuthContext | NextResponse> {
  if (!publicApiLive()) return NextResponse.json({ error: "public API not live" }, { status: 503 });
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = auth.slice(7).trim();
  if (!token.startsWith("cc_live_")) return NextResponse.json({ error: "invalid API key format" }, { status: 401 });
  const record = await getApiKeyByPrefix(token.slice(0, 20));
  if (!record || record.revokedAt) return NextResponse.json({ error: "invalid API key" }, { status: 401 });
  const hash = hashApiKey(token);
  const a = Buffer.from(hash);
  const b = Buffer.from(record.keyHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "invalid API key" }, { status: 401 });
  }
  const rate = checkRate(
    PUBLIC_API_AUTH_LIMIT.bucket,
    record.id,
    PUBLIC_API_AUTH_LIMIT.limit,
    PUBLIC_API_AUTH_LIMIT.windowSeconds,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429 });
  }
  await updateApiKey(record.id, { lastUsedAt: now() });
  return { apiKey: record, tenantId: record.tenantId, scopes: new Set(record.scopes) };
}

export function checkPublicApiRouteRate(
  ctx: ApiAuthContext,
  kind: "read" | "write",
): NextResponse | null {
  const cfg = kind === "read" ? PUBLIC_API_READ_LIMIT : PUBLIC_API_WRITE_LIMIT;
  const rate = checkRate(cfg.bucket, ctx.apiKey.id, cfg.limit, cfg.windowSeconds);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429 });
  }
  return null;
}

export function requireScope(ctx: ApiAuthContext, scope: ApiKeyScope): NextResponse | null {
  if (!ctx.scopes.has(scope)) return NextResponse.json({ error: `missing scope: ${scope}` }, { status: 403 });
  return null;
}

export async function assertCompanyInScope(ctx: ApiAuthContext, companyId: string): Promise<NextResponse | null> {
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== ctx.tenantId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ctx.apiKey.companyIds?.length && !ctx.apiKey.companyIds.includes(companyId)) {
    return NextResponse.json({ error: "company not in key scope" }, { status: 403 });
  }
  return null;
}

export function companyAllowed(ctx: ApiAuthContext, companyId: string): boolean {
  if (!ctx.apiKey.companyIds?.length) return true;
  return ctx.apiKey.companyIds.includes(companyId);
}
