// Cron endpoint — the production scheduler driver (Vercel Cron hits this on a
// schedule; see vercel.json). Authenticated with CRON_SECRET so only the
// scheduler (or an operator holding the secret) can trigger a tick — never an
// anonymous request. Env-gated: with no CRON_SECRET it refuses (503).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScheduledTick } from "@/lib/scheduler";

function authorized(req: NextRequest, secret: string): boolean {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; also accept ?key=
  // for manual/self-hosted triggers. Constant-time compare.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = new URL(req.url).searchParams.get("key");
  const provided = bearer || key || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  if (!authorized(req, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runScheduledTick();
  const totals = results.reduce(
    (t, r) => ({
      published: t.published + r.published,
      failed: t.failed + r.failed,
      skipped: t.skipped + r.skipped,
      deferred: t.deferred + r.deferred,
      dead: t.dead + r.dead,
      automationOutcomes: t.automationOutcomes + r.automationOutcomes,
    }),
    { published: 0, failed: 0, skipped: 0, deferred: 0, dead: 0, automationOutcomes: 0 },
  );
  return NextResponse.json({ ok: true, tenants: results.length, totals });
}

// Vercel Cron issues GET; POST supported for manual triggers.
export const GET = handle;
export const POST = handle;
