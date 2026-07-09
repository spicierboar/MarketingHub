import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import { listCompanies } from "@/lib/db";
import { listAudit, logAction } from "@/lib/audit";

function cell(v: string): string {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Audit log export (§57 "exportable by authorised Admin roles").
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!isAdmin(user)) return new NextResponse("Forbidden", { status: 403 });

  const header = ["timestamp", "actor", "action", "company", "targetType", "targetId", "detail"];
  const companiesById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));
  const rows = (await listAudit(user.tenantId)).map((e) =>
    [
      e.createdAt,
      e.actorEmail,
      e.action,
      e.companyId ? companiesById.get(e.companyId)?.name ?? e.companyId : "",
      e.targetType ?? "",
      e.targetId ?? "",
      e.detail ?? "",
    ]
      .map(cell)
      .join(","),
  );

  await logAction(user, "audit.exported", { detail: `${rows.length} entries` });

  return new NextResponse([header.join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
