import { NextRequest, NextResponse } from "next/server";
import {
  ManagedContentContractError,
  receiveManagedContentEvent,
} from "@/lib/managed-content-jobs/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const eventId = req.headers.get("x-content-event-id")?.trim() ?? "";
  const timestamp = req.headers.get("x-content-timestamp")?.trim() ?? "";
  const signature = req.headers.get("x-content-signature")?.trim() ?? "";
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing managed-content signature headers" },
      { status: 401 },
    );
  }
  const rawBody = await req.text();
  try {
    const outcome = await receiveManagedContentEvent({
      rawBody,
      eventId,
      timestamp,
      signature,
    });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    const status =
      error instanceof ManagedContentContractError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof ManagedContentContractError
            ? error.message
            : "Managed-content callback processing failed",
      },
      { status },
    );
  }
}
