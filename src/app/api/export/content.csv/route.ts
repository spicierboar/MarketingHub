import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { listCompanies } from "@/lib/db";
import { contentToCsv } from "@/lib/export";
import { logAction } from "@/lib/audit";

// Export approved content the user is allowed to see (master prompt Phase 1).
// Optional ?company= scopes to one client (company workspace).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const allowed = new Set(await accessibleCompanyIds(user));
  const companyParam = req.nextUrl.searchParams.get("company") ?? undefined;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;

  const approved = (await visibleContent(user)).filter(
    (c) =>
      ["approved", "scheduled", "published"].includes(c.status) &&
      (!companyId || c.companyId === companyId),
  );
  const companiesById = new Map(
    (await listCompanies(user.tenantId)).map((c) => [c.id, c]),
  );
  const csv = contentToCsv(approved, (id) => companiesById.get(id)?.name ?? id);

  await logAction(user, "content.exported", {
    companyId,
    detail: `CSV · ${approved.length} items${companyId ? ` · ${companyId}` : ""}`,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="approved-content.csv"',
    },
  });
}
