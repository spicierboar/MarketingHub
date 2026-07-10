import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCompanyReview } from "@/lib/db";
import {
  assertCompanyInScope,
  checkPublicApiRouteRate,
  resolveApiKey,
  requireScope,
} from "@/lib/public-api/auth";
import { serializeReview } from "@/lib/public-api/serializers";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "reviews:read");
  if (denied) return denied;
  const { id } = await ctx.params;
  const review = await getCompanyReview(id);
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
  const scopeErr = await assertCompanyInScope(auth, review.companyId);
  if (scopeErr) return scopeErr;
  return NextResponse.json({ data: serializeReview(review) });
}
