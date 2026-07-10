import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { buildTenantExecDash, execPortfolioAttention } from "@/lib/exec-dash";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function tone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export default async function ExecutiveDashboardPage() {
  const user = await requireAdmin();
  const rows = await buildTenantExecDash(user.tenantId);
  const attention = execPortfolioAttention(rows, { limit: 8 });

  return (
    <div>
      <PageHeader
        title="Executive dashboard"
        description="Scorecards across marketing, reputation, local SEO, engagement, and retention — with next best actions, not charts-only."
      >
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          Daily dashboard
        </Link>
      </PageHeader>

      <div className="space-y-8 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Who needs attention</CardTitle>
            <CardDescription>
              Lowest overall scores first. Open a client to see factor evidence and next steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All clients are above the attention threshold.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {attention.map((r) => (
                  <li
                    key={r.companyId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <Link
                        href={`/companies/${r.companyId}`}
                        className="font-medium hover:underline"
                      >
                        {r.companyName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.businessTypeHint || "Business"} · next:{" "}
                        {r.nextBest[0]?.title ?? "Review scorecards"}
                      </p>
                    </div>
                    <Badge tone={tone(r.overall)}>{r.overall}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {rows.map((row) => (
            <Card key={row.companyId} className={row.needsAttention ? "border-amber-200" : undefined}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      <Link href={`/companies/${row.companyId}`} className="hover:underline">
                        {row.companyName}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      Overall {row.overall}/100 · marketing health {row.health.score}
                    </CardDescription>
                  </div>
                  <Badge tone={tone(row.overall)}>
                    {row.needsAttention ? "Needs attention" : "On track"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {row.scorecards.map((c) => (
                    <div key={c.id} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                        <p className="text-lg font-semibold tabular-nums">{c.score}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{c.evidence}</p>
                    </div>
                  ))}
                </div>

                {row.nextBest.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Next best actions</h3>
                    <ul className="space-y-2">
                      {row.nextBest.map((a, i) => (
                        <li
                          key={`${row.companyId}-nba-${i}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.reason}</p>
                          </div>
                          <Link href={a.href}>
                            <Button type="button" size="sm" variant="secondary">
                              Open
                            </Button>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No companies in this tenant yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
