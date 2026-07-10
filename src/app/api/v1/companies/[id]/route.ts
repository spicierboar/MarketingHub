import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCompany } from "@/lib/db";
import { assertCompanyInScope, resolveApiKey, requireScope, checkPublicApiRouteRate } from "@/lib/public-api/auth";
import { serializeCompany } from "@/lib/public-api/serializers";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "companies:read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const scopeErr = await assertCompanyInScope(auth, id);
  if (scopeErr) return scopeErr;
  const company = await getCompany(id);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ data: serializeCompany(company) });
}
