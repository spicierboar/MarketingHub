import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate, now, titleCase } from "@/lib/utils";

// Content Reuse Library (Phase 5, §45): approved content that can be reused,
// adapted and repurposed — with review/expiry controls enforced.
export default async function LibraryPage() {
  const user = await requireUser();
  const today = now().slice(0, 10);
  const approved = (await visibleContent(user)).filter((c) =>
    ["approved", "scheduled", "published"].includes(c.status),
  );
  // Precompute company names for the table rows (getCompany is async).
  const rowCompanyIds = Array.from(new Set(approved.map((c) => c.companyId)));
  const rowCompanies = await Promise.all(
    rowCompanyIds.map((id) => getCompany(id)),
  );
  const companyNameById = new Map(
    rowCompanyIds.map((id, i) => [id, rowCompanies[i]?.name]),
  );

  return (
    <div>
      <PageHeader
        title="Content Reuse Library"
        description="Approved content available for reuse. Expired items must be reviewed before they can be repurposed."
      />
      <div className="p-6">
        {approved.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Nothing approved yet — approved content lands here automatically.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Reuse</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {approved.map((c) => {
                  const expired = !!c.expiryDate && c.expiryDate < today;
                  const reviewDue = !!c.reviewDate && c.reviewDate < today;
                  return (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/content/${c.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {companyNameById.get(c.companyId)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {titleCase(c.type)}
                      </td>
                      <td className="px-4 py-3">
                        {c.reusePermitted === false ? (
                          <Badge tone="danger">No reuse</Badge>
                        ) : c.reusePermitted ? (
                          <Badge tone="success">
                            Reusable
                            {c.reuseChannels && c.reuseChannels.length > 0
                              ? ` (${c.reuseChannels.join(", ")})`
                              : ""}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Not set</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <Badge tone="danger">Expired {c.expiryDate}</Badge>
                        ) : reviewDue ? (
                          <Badge tone="warning">Review due</Badge>
                        ) : c.expiryDate ? (
                          <span className="text-muted-foreground">{c.expiryDate}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(c.approvedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
