import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCompanyReviews } from "@/lib/db";
import type { ReviewStatus } from "@/lib/types";
import {
  assertCompanyInScope,
  checkPublicApiRouteRate,
  companyAllowed,
  resolveApiKey,
  requireScope,
} from "@/lib/public-api/auth";
import { serializeReview } from "@/lib/public-api/serializers";

const STATUSES: ReviewStatus[] = ["new", "drafted", "responded", "archived"];

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "reviews:read");
  if (denied) return denied;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const scopeErr = await assertCompanyInScope(auth, companyId);
    if (scopeErr) return scopeErr;
  }
  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam && STATUSES.includes(statusParam as ReviewStatus)
      ? (statusParam as ReviewStatus)
      : undefined;
  const companyFilter = companyId
    ? [companyId]
    : auth.apiKey.companyIds?.length
      ? auth.apiKey.companyIds
      : undefined;
  let reviews = await listCompanyReviews(auth.tenantId, companyFilter, status);
  reviews = reviews.filter((r) => companyAllowed(auth, r.companyId));
  return NextResponse.json({ data: reviews.map(serializeReview) });
}
