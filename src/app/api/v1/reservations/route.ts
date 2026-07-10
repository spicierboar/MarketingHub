import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listReservations } from "@/lib/db";
import {
  assertCompanyInScope,
  checkPublicApiRouteRate,
  companyAllowed,
  resolveApiKey,
  requireScope,
} from "@/lib/public-api/auth";
import { serializeReservation } from "@/lib/public-api/serializers";

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const rateErr = checkPublicApiRouteRate(auth, "read");
  if (rateErr) return rateErr;
  const denied = requireScope(auth, "reservations:read");
  if (denied) return denied;
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (companyId) {
    const scopeErr = await assertCompanyInScope(auth, companyId);
    if (scopeErr) return scopeErr;
  }
  let reservations = await listReservations(auth.tenantId, companyId ?? undefined);
  reservations = reservations.filter((r) => companyAllowed(auth, r.companyId));
  return NextResponse.json({ data: reservations.map(serializeReservation) });
}
