import { requirePermission, canAccessCompany, accessibleCompanyIds, isAdmin } from "@/lib/auth/rbac";
import { listAudit } from "@/lib/audit";
import { getCompany, listCompanies } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  // Additive RBAC: analyst capability OR admin (legacy admins unchanged).
  const user = await requirePermission("view_audit");
  const { company: companyParam } = await searchParams;
  const scopedCompany =
    companyParam && (await canAccessCompany(user, companyParam))
      ? await getCompany(companyParam)
      : null;
  // Non-admins without ?company= only see audit rows for companies they can access.
  const companyFilter = scopedCompany
    ? [scopedCompany.id]
    : isAdmin(user)
      ? undefined
      : await accessibleCompanyIds(user);
  const entries = await listAudit(user.tenantId, companyFilter);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title={
          scopedCompany ? `Audit log · ${scopedCompany.name}` : "Audit log"
        }
        description={
          scopedCompany
            ? "Append-only material actions for this client. Cannot be edited or deleted."
            : "Append-only record of every material action. Cannot be edited or deleted."
        }
      >
        {scopedCompany ? (
          <Link
            href={`/companies/${scopedCompany.id}`}
            className="text-sm text-primary hover:underline"
          >
            ← Client overview
          </Link>
        ) : null}
      </PageHeader>
      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                {!scopedCompany ? (
                  <th className="px-4 py-3 font-medium">Client</th>
                ) : null}
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={scopedCompany ? 4 : 5}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No audit entries{scopedCompany ? " for this client" : ""} yet.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.actorEmail}</td>
                    <td className="px-4 py-3">
                      <Badge tone="primary">{e.action}</Badge>
                    </td>
                    {!scopedCompany ? (
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.companyId
                          ? companyById.get(e.companyId)?.name ?? e.companyId
                          : "—"}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 text-muted-foreground">{e.detail ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
