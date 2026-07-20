import { NextRequest, NextResponse } from "next/server";
import {
  authenticatedActor,
  operatorErrorResponse,
  runAsContentDeskService,
  strictJson,
} from "@/lib/content-desk/http";
import { regenerateClientConcept } from "@/lib/content-desk/service";
import { RegenerateMutationSchema } from "@/lib/content-desk/types";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ companyId: string; conceptId: string }>;
};

export async function POST(request: NextRequest, context: Context) {
  const auth = await authenticatedActor(request);
  if ("response" in auth) return auth.response;
  const parsed = await strictJson(request, RegenerateMutationSchema);
  if ("response" in parsed) return parsed.response;
  const { companyId, conceptId } = await context.params;
  if (parsed.data.conceptId !== conceptId) {
    return NextResponse.json({ error: "concept correlation mismatch" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await runAsContentDeskService(auth.actor, () =>
        regenerateClientConcept(auth.actor, companyId, conceptId),
      ),
      {
        status: 202,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
