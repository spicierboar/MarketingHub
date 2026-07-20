import { NextResponse } from "next/server";
import { appEnv, providerActivationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const providers = providerActivationStatuses();
  const inconsistent = providers.some(
    (provider) => provider.issue === "live_flag_without_credential",
  );
  return NextResponse.json(
    {
      ok: !inconsistent,
      environment: appEnv(),
      providers,
    },
    { status: inconsistent ? 503 : 200 },
  );
}
