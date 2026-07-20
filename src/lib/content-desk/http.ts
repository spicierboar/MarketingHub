import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { runInServiceContext } from "@/lib/db/service-context";
import { authenticateContentDeskRequest } from "./auth";
import { ContentDeskOperatorError } from "./service";
import type { ContentDeskActor } from "./auth";

type AuthenticatedActorResult =
  | { actor: ContentDeskActor }
  | { response: NextResponse };

export async function authenticatedActor(
  request: NextRequest,
): Promise<AuthenticatedActorResult> {
  const auth = await authenticateContentDeskRequest(request);
  if (!auth.ok) {
    return {
      response: NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      ),
    };
  }
  return { actor: auth.actor };
}

export async function strictJson<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      response: NextResponse.json({ error: "invalid JSON" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: "invalid request", issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}

export function operatorErrorResponse(error: unknown): NextResponse {
  if (error instanceof ContentDeskOperatorError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Content Desk operator request failed", error);
  return NextResponse.json({ error: "operator request failed" }, { status: 500 });
}

export function runAsContentDeskService<T>(
  actor: ContentDeskActor,
  task: () => Promise<T>,
): Promise<T> {
  return runInServiceContext(actor.tenantId, task);
}
