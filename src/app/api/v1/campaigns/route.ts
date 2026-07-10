import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCampaigns } from "@/lib/db";
import {
  assertCompanyInScope,
  checkPublicApiRouteRate,
  companyAllowed,
  resolveApiKey,
  requireScope,
} from "@/lib/public-api/auth";
import { serializeCampaign } from "@/lib/public-api/serializers";

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "campaigns:read");
  if (denied) return denied;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const scopeErr = await assertCompanyInScope(auth, companyId);
    if (scopeErr) return scopeErr;
  }
  let campaigns = await listCampaigns(auth.tenantId);
  campaigns = campaigns.filter((c) => companyAllowed(auth, c.companyId));
  if (companyId) campaigns = campaigns.filter((c) => c.companyId === companyId);
  return NextResponse.json({ data: campaigns.map(serializeCampaign) });
}
