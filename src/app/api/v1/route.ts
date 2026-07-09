import { NextResponse } from "next/server";
import { catalogPayload } from "@/lib/public-api/catalog";
import { publicApiLive } from "@/lib/public-api/gate";

export async function GET() {
  if (!publicApiLive()) {
    return NextResponse.json({ error: "public API not live" }, { status: 503 });
  }
  return NextResponse.json(catalogPayload());
}
