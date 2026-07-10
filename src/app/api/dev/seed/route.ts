// Dev seed / clear — gated by devToolsOpen + CC_LOCAL_DEMO.
//   POST /api/dev/seed   → reset in-memory store to demo seed
//   POST /api/dev/clear  → end is N/A over HTTP; resets store (same as seed)

import { NextResponse } from "next/server";
import { resetStore } from "@/lib/db/store";
import { localDemoEnabled, devToolsOpen } from "@/lib/env";

function gate() {
  if (!devToolsOpen()) {
    return NextResponse.json({ error: "dev tools locked in production" }, { status: 403 });
  }
  if (!localDemoEnabled()) {
    return NextResponse.json(
      {
        error: "CC_LOCAL_DEMO not enabled",
        hint: "Set CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, restart npm run dev",
      },
      { status: 400 },
    );
  }
  return null;
}

export async function POST() {
  const blocked = gate();
  if (blocked) return blocked;
  resetStore();
  return NextResponse.json({ ok: true, action: "seed", message: "Demo data re-seeded" });
}

export async function GET() {
  return POST();
}
