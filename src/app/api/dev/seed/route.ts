// Dev seed / clear — gated by devToolsOpen + CC_LOCAL_DEMO.
//   POST /api/dev/seed   → reset in-memory store to demo seed
//   POST /api/dev/clear  → end is N/A over HTTP; resets store (same as seed)

import { NextRequest, NextResponse } from "next/server";
import { resetStore } from "@/lib/db/store";
import { localDemoPostAllowed } from "@/lib/dev-access";

function gate(req: NextRequest) {
  if (!localDemoPostAllowed(req.headers, req.url, req.method)) {
    return NextResponse.json(
      {
        error: "local-demo seed disabled",
        hint: "Use a same-origin POST with CC_LOCAL_DEMO on a non-deployed localhost development server.",
      },
      { status: 403 },
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = gate(req);
  if (blocked) return blocked;
  resetStore();
  return NextResponse.json({ ok: true, action: "seed", message: "Demo data re-seeded" });
}
