import Link from "next/link";
import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleRequests } from "@/lib/scope";
import { listCompanies, listUsers } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";

const URGENCY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
} as const;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const allowed = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;
  const requests = (await visibleRequests(user)).filter(
    (r) => !companyId || r.companyId === companyId,
  );
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));
  const userById = new Map((await listUsers(user.tenantId)).map((u) => [u.id, u]));

  return (
    <div>
      <PageHeader
        title="Marketing support requests"
        description="Requests from local managers become trackable tickets."
      >
        <Link href="/requests/new" className={buttonClasses()}>
          New request
        </Link>
      </PageHeader>

      <div className="p-6">
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No requests yet.{" "}
              <Link href="/requests/new" className="text-primary hover:underline">
                Submit the first one
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Urgency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/requests/${r.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {r.topic}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {companyById.get(r.companyId)?.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {titleCase(r.requestType)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {userById.get(r.requesterId)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={URGENCY_TONE[r.urgency]}>
                        {titleCase(r.urgency)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
