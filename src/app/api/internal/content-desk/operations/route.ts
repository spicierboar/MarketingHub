import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedActor,
  operatorErrorResponse,
  runAsContentDeskService,
} from "@/lib/content-desk/http";
import { getOperationsOverview } from "@/lib/content-desk/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticatedActor(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(
      await runAsContentDeskService(auth.actor, () =>
        getOperationsOverview(auth.actor),
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
