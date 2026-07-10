import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/db";
import {
  assertCompanyInScope,
  checkPublicApiRouteRate,
  resolveApiKey,
  requireScope,
} from "@/lib/public-api/auth";
import { serializeCampaign } from "@/lib/public-api/serializers";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "campaigns:read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  const scopeErr = await assertCompanyInScope(auth, campaign.companyId);
  if (scopeErr) return scopeErr;
  return NextResponse.json({ data: serializeCampaign(campaign) });
}
