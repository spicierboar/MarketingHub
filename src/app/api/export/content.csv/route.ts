import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { visibleContent } from "@/lib/scope";
import { listCompanies } from "@/lib/db";
import { contentToCsv } from "@/lib/export";
import { logAction } from "@/lib/audit";

// Export approved content the user is allowed to see (master prompt Phase 1).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const approved = (await visibleContent(user)).filter((c) =>
    ["approved", "scheduled", "published"].includes(c.status),
  );
  const companiesById = new Map(
    (await listCompanies(user.tenantId)).map((c) => [c.id, c]),
  );
  const csv = contentToCsv(approved, (id) => companiesById.get(id)?.name ?? id);

  await logAction(user, "content.exported", {
    detail: `CSV · ${approved.length} items`,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="approved-content.csv"',
    },
  });
}
