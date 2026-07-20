import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedActor,
  operatorErrorResponse,
  runAsContentDeskService,
  strictJson,
} from "@/lib/content-desk/http";
import { updateClientMode } from "@/lib/content-desk/service";
import { ModeMutationSchema } from "@/lib/content-desk/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ companyId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authenticatedActor(request);
  if ("response" in auth) return auth.response;
  const parsed = await strictJson(request, ModeMutationSchema);
  if ("response" in parsed) return parsed.response;
  const { companyId } = await context.params;
  try {
    return NextResponse.json(
      await runAsContentDeskService(auth.actor, () =>
        updateClientMode(auth.actor, companyId, parsed.data.mode),
      ),
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
