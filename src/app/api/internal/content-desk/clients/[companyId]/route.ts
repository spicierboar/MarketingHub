import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedActor,
  operatorErrorResponse,
  runAsContentDeskService,
} from "@/lib/content-desk/http";
import { getClientWorkspace } from "@/lib/content-desk/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ companyId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await authenticatedActor(request);
  if ("response" in auth) return auth.response;
  const { companyId } = await context.params;
  try {
    return NextResponse.json(
      await runAsContentDeskService(auth.actor, () =>
        getClientWorkspace(auth.actor, companyId),
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
