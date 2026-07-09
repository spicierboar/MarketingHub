// Cross-tenant isolation self-test endpoint (SaaS T7 hardening).
//
// The permanent, runnable form of src/lib/selftest/isolation.ts — it provisions
// two throwaway tenants, asserts the whole isolation matrix, purges both, and
// returns a pass/fail report. HTTP 200 when every check passes, 500 when any
// regressed, so CI / an ops probe can gate on the status code alone.
//
// Access (mirrors the cron route's env-gating):
//   • CC_SELFTEST_SECRET set → require it (Authorization: Bearer <secret> or
//     ?key=<secret>), constant-time compared.
//   • secret unset + non-production → open (dev convenience: `curl` it locally).
//   • secret unset + production → refused (403) so it can't be probed in prod
//     without an operator explicitly enabling it.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runIsolationSelfTest } from "@/lib/selftest/isolation";
import { runPortalSelfTest } from "@/lib/selftest/portal";
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
  // No secret configured: OPEN on development + staging (all dev-tools), LOCKED
  // in production. Note: on Vercel a staging (preview) build has NODE_ENV=
  // production, so we gate on appEnv() (VERCEL_ENV-aware), NOT NODE_ENV.
  if (!devToolsOpen()) {
    return { ok: false, status: 403, error: "self-test disabled in production (set CC_SELFTEST_SECRET to enable)" };
  }
  return { ok: true };
}

async function handle(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [iso, portal] = await Promise.all([runIsolationSelfTest(), runPortalSelfTest()]);
  const checks = [...iso.checks, ...portal.checks];
  const failed = checks.filter((c) => !c.ok).length;
  const report = {
    ok: iso.ok && portal.ok,
    passed: checks.length - failed,
    failed,
    purgeFailed: [...iso.purgeFailed, ...portal.purgeFailed],
    durationMs: iso.durationMs + portal.durationMs,
    checks,
  };
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
