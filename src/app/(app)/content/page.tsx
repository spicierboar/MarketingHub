import Link from "next/link";
import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, RiskBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const allowed = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;
  const content = (await visibleContent(user)).filter(
    (c) => !companyId || c.companyId === companyId,
  );
  const approvedCount = content.filter((c) =>
    ["approved", "scheduled", "published"].includes(c.status),
  ).length;
  const companyIds = [...new Set(content.map((c) => c.companyId))];
  const companiesById = new Map(
    (await Promise.all(companyIds.map((cid) => getCompany(cid)))).map(
      (co, i) => [companyIds[i], co] as const,
    ),
  );

  return (
    <div>
      <PageHeader
        title="Content"
        explainerId="content-library"
        explainer="All drafted marketing content and its approval status. Export approved items when you need a CSV."
      >
        <a
          href="/api/export/content.csv"
          className={buttonClasses("outline")}
          aria-disabled={approvedCount === 0}
        >
          Export approved (CSV)
        </a>
      </PageHeader>

      <div className="p-6">
        {content.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              No content yet. Open a{" "}
              <Link href="/requests" className="text-primary hover:underline">
                request
              </Link>{" "}
              and generate an AI draft.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {content.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/content/${c.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {companiesById.get(c.companyId)?.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {titleCase(c.type)}
                    </td>
                    <td className="px-4 py-3">
                      {c.compliance ? (
                        <RiskBadge level={c.compliance.riskLevel} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(c.createdAt)}
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
