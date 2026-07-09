import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/db";
import { resolveApiKey, requireScope, companyAllowed } from "@/lib/public-api/auth";
import { serializeCompany } from "@/lib/public-api/serializers";

export async function GET(req: NextRequest) {
  const auth = await resolveApiKey(req);
  if (auth instanceof NextResponse) return auth;
  const denied = requireScope(auth, "companies:read");
  if (denied) return denied;
  const companies = await listCompanies(auth.tenantId);
  const filtered = companies.filter((c) => companyAllowed(auth, c.id));
  return NextResponse.json({ data: filtered.map(serializeCompany) });
}
