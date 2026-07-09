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
import { timingSafeEqual } from "node:crypto";
import { runQueueSelfTest } from "@/lib/selftest/queue";
import { devToolsOpen } from "@/lib/env";

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function authorize(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CC_SELFTEST_SECRET?.trim();
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const key = new URL(req.url).searchParams.get("key");
    const provided = bearer || key || "";
    return constantTimeEquals(provided, secret)
      ? { ok: true }
      : { ok: false, status: 401, error: "unauthorized" };
  }
  // OPEN on development + staging; LOCKED in production (gate on appEnv(), since
  // a Vercel staging build has NODE_ENV=production).
  if (!devToolsOpen()) {
    return { ok: false, status: 403, error: "queue-test disabled in production (set CC_SELFTEST_SECRET to enable)" };
  }
  return { ok: true };
}

async function handle(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const report = await runQueueSelfTest();
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
