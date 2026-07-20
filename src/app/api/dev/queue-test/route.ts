// Publish-queue self-test endpoint (scale pass).
//
// The permanent, runnable form of src/lib/selftest/queue.ts — provisions
// throwaway tenants, asserts the queue invariants (atomic claim, cross-tenant
// refusal, backoff, dead-letter/requeue, platform ceilings, skip semantics),
// purges everything and returns a pass/fail report. HTTP 200 when every check
// passes, 500 when any regressed — CI / an ops probe can gate on status alone.
//
// Access gating is identical to /api/dev/self-test (CC_SELFTEST_SECRET).

import { NextRequest, NextResponse } from "next/server";
import { runQueueSelfTest } from "@/lib/selftest/queue";
import { diagnosticAccessAllowed } from "@/lib/dev-access";
import { getCurrentUser } from "@/lib/auth/session";

async function authorize(req: NextRequest): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = new URL(req.url).searchParams.get("key");
  const user = await getCurrentUser();
  return diagnosticAccessAllowed({
    headers: req.headers,
    requestUrl: req.url,
    providedSecret: bearer || key,
    user,
  })
    ? { ok: true }
    : {
        ok: false,
        status: process.env.CC_SELFTEST_SECRET?.trim() ? 401 : 403,
        error: process.env.CC_SELFTEST_SECRET?.trim()
          ? "unauthorized"
          : "queue-test disabled in production (set CC_SELFTEST_SECRET to enable)",
      };
}

/** Queue fixture hits real Supabase on staging — allow up to 60s on Vercel. */
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const report = await runQueueSelfTest();
    return NextResponse.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        passed: 0,
        failed: 1,
        purgeFailed: [],
        durationMs: 0,
        checks: [{ name: "queue.suiteCrashed", ok: false, detail: message }],
        hint:
          "If this mentions a missing relation/table: apply numbered supabase/migrations (0001→0045) to the staging project.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
