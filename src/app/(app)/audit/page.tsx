import { requireAdmin } from "@/lib/auth/rbac";
import { listAudit } from "@/lib/audit";
import { listCompanies } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function AuditPage() {
  const user = await requireAdmin();
  const entries = await listAudit(user.tenantId);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only record of every material action. Cannot be edited or deleted."
      />
      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.actorEmail}</td>
                  <td className="px-4 py-3">
                    <Badge tone="primary">{e.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {e.companyId ? companyById.get(e.companyId)?.name ?? e.companyId : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
