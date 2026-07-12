import Link from "next/link";
import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleContent, visibleCompanies } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, RiskBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { ContentHubActions } from "@/components/content-hub-actions";
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
  const scopedCompany = companyId ? await getCompany(companyId) : null;
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
  const aiCompanies = (await visibleCompanies(user))
    .filter((c) => c.status === "ai_ready" || c.status === "approved")
    .filter((c) => !companyId || c.id === companyId)
    .map((c) => ({ id: c.id, name: c.name }));
  const exportHref = companyId
    ? `/api/export/content.csv?company=${companyId}`
    : "/api/export/content.csv";

  return (
    <div>
      <PageHeader
        title={
          scopedCompany ? `Content · ${scopedCompany.name}` : "Content"
        }
        explainerId="content-library"
        explainer="Create with AI at the top, then manage the library below. Drafts always need review and approval — nothing publishes automatically."
      >
        <a
          href={exportHref}
          className={buttonClasses("outline")}
          aria-disabled={approvedCount === 0}
        >
          Export approved (CSV)
        </a>
      </PageHeader>

      <div className="space-y-8 p-6">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Create</h2>
            <p className="text-xs text-muted-foreground">
              Open a form to draft copy, image, video, or voiceover — company-scoped and governed.
            </p>
          </div>
          <ContentHubActions
            companies={aiCompanies}
            defaultCompanyId={companyId}
            lockCompany={Boolean(companyId)}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Library</h2>
            <p className="text-xs text-muted-foreground">
              All drafted marketing content and approval status
              {companyId ? " for this client" : ""}.
            </p>
          </div>

          {content.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                No content yet. Use{" "}
                <span className="font-medium text-foreground">AI Content</span> above, or open a{" "}
                <Link
                  href={companyId ? `/requests?company=${companyId}` : "/requests"}
                  className="text-primary hover:underline"
                >
                  client ask
                </Link>
                .
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
        </section>
      </div>
    </div>
  );
}
