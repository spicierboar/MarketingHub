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
//
// Staging Preview note: a failed check OR a suite throw both return HTTP 500
// with a JSON body (never an opaque Next.js HTML 500). Inspect `checks`,
// `suiteErrors`, and `diag` — missing migrations / service role usually show
// up as createTenant / relation errors in those fields.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runIsolationSelfTest } from "@/lib/selftest/isolation";
import { runPortalSelfTest } from "@/lib/selftest/portal";
import { runClientReportsSelfTest } from "@/lib/selftest/client-reports";
import { runPublicApiSelfTest } from "@/lib/selftest/public-api";
import { runCrmSelfTest } from "@/lib/selftest/crm";
import { runCmsSelfTest } from "@/lib/selftest/cms";
import { runFunnelSelfTest } from "@/lib/selftest/funnel";
import { runLoyaltySelfTest } from "@/lib/selftest/loyalty";
import { runBookingsSelfTest } from "@/lib/selftest/bookings";
import { runExecDashSelfTest } from "@/lib/selftest/exec-dash";
import { runLocalSeoSelfTest } from "@/lib/selftest/local-seo";
import { runLearningSelfTest } from "@/lib/selftest/learning";
import { runRagSelfTest } from "@/lib/selftest/rag";
import { runAiMosSelfTest } from "@/lib/selftest/ai-mos";
import { appEnv, devToolsOpen } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/db/supabase";

/** Preview/staging suites hit real Supabase — allow up to 60s on Vercel. */
export const maxDuration = 60;

type SuiteReport = {
  ok: boolean;
  passed: number;
  failed: number;
  purgeFailed: string[];
  durationMs: number;
  checks: { name: string; ok: boolean; detail?: string }[];
};

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

function diagnostics() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  let supabaseHost: string | null = null;
  try {
    supabaseHost = url ? new URL(url).host : null;
  } catch {
    supabaseHost = "invalid-url";
  }
  return {
    appEnv: appEnv(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    supabaseConfigured: isSupabaseConfigured(),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    supabaseHost,
    hint:
      "If checks fail with relation/table errors: apply numbered supabase/migrations (0001→0046) to the staging project. " +
      "If this URL redirects to Vercel SSO: disable Deployment Protection for Preview, or use a bypass token.",
  };
}

function crashedSuite(name: string, err: unknown): SuiteReport {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    passed: 0,
    failed: 1,
    purgeFailed: [],
    durationMs: 0,
    checks: [{ name: `${name}.suiteCrashed`, ok: false, detail }],
  };
}

async function settle(
  name: string,
  fn: () => Promise<SuiteReport>,
): Promise<{ name: string; report: SuiteReport; error?: string }> {
  try {
    return { name, report: await fn() };
  } catch (e) {
    return {
      name,
      report: crashedSuite(name, e),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function handle(req: NextRequest) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, diag: diagnostics() },
      { status: auth.status },
    );
  }

  const startedAt = Date.now();
  try {
    const settled = await Promise.all([
      settle("isolation", runIsolationSelfTest),
      settle("portal", runPortalSelfTest),
      settle("clientReports", runClientReportsSelfTest),
      settle("publicApi", runPublicApiSelfTest),
      settle("crm", runCrmSelfTest),
      settle("cms", runCmsSelfTest),
      settle("funnel", runFunnelSelfTest),
      settle("loyalty", runLoyaltySelfTest),
      settle("bookings", runBookingsSelfTest),
      settle("execDash", runExecDashSelfTest),
      settle("localSeo", runLocalSeoSelfTest),
      settle("learning", runLearningSelfTest),
      settle("rag", runRagSelfTest),
      settle("aiMos", runAiMosSelfTest),
    ]);

    const checks = settled.flatMap((s) => s.report.checks);
    const failed = checks.filter((c) => !c.ok).length;
    const suiteErrors = settled
      .filter((s) => s.error)
      .map((s) => ({ suite: s.name, error: s.error! }));
    const report = {
      ok: settled.every((s) => s.report.ok) && suiteErrors.length === 0,
      passed: checks.length - failed,
      failed,
      purgeFailed: settled.flatMap((s) => s.report.purgeFailed),
      durationMs: Date.now() - startedAt,
      suiteErrors,
      diag: diagnostics(),
      checks,
    };
    return NextResponse.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    // Last-resort: never let an unhandled throw become an opaque HTML 500.
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        passed: 0,
        failed: 1,
        purgeFailed: [],
        durationMs: Date.now() - startedAt,
        suiteErrors: [{ suite: "handler", error: message }],
        diag: diagnostics(),
        checks: [{ name: "handler.crashed", ok: false, detail: message }],
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
