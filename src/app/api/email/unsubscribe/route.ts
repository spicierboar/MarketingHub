import { NextResponse } from "next/server";
import { unsubscribeById } from "@/lib/email-marketing";

export async function GET(req: Request) {
  const subscriber = new URL(req.url).searchParams.get("subscriber");
  if (!subscriber) {
    return new NextResponse("Missing subscriber id.", { status: 400, headers: { "content-type": "text/plain" } });
  }
  const updated = await unsubscribeById(subscriber);
  if (!updated) {
    return new NextResponse("Subscriber not found.", { status: 404, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("You have been unsubscribed.", { status: 200, headers: { "content-type": "text/plain" } });
}
