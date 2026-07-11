import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listContent, listLegalHolds } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import { applyLegalHoldAction, releaseLegalHoldAction } from "../actions";

export default async function LegalHoldPage() {
  const user = await requireAdmin();
  const companies = await listCompanies(user.tenantId);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const holds = await listLegalHolds(user.tenantId);
  const active = holds.filter((h) => h.active);
  const released = holds.filter((h) => !h.active);
  // A few recent content ids to make applying a content hold convenient.
  const recentContent = (await listContent(user.tenantId)).slice(0, 12);

  return (
    <div>
      <PageHeader
        title="Legal Hold registry"
        description="Preserve records for legal or regulatory matters. Held records cannot be edited, archived or overwritten (§54)."
      >
        <Link href="/admin" className="text-sm text-primary hover:underline">
          ← Admin &amp; Security
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Active holds ({active.length})</h2>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active legal holds.</p>
              ) : (
                <div className="space-y-3">
                  {active.map((h) => (
                    <div key={h.id} className="rounded-md border border-red-200 bg-red-50/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="danger">{titleCase(h.scope)}</Badge>
                        <span className="font-mono text-xs">{h.targetId}</span>
                        <span className="text-muted-foreground">{companyById.get(h.companyId)?.name}</span>
                      </div>
                      <p className="mt-1">{h.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied {formatDate(h.appliedAt)}
                      </p>
                      <form action={releaseLegalHoldAction} className="mt-2">
                        <input type="hidden" name="holdId" value={h.id} />
                        <Button type="submit" variant="ghost" size="sm">Release hold</Button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {released.length > 0 && (
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Released holds ({released.length})
              </summary>
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {released.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{titleCase(h.scope)} · {h.targetId} — {h.reason}</span>
                    <span className="whitespace-nowrap text-xs">released {formatDate(h.releasedAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Apply a legal hold</h2>
            <form action={applyLegalHoldAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Scope" htmlFor="scope">
                  <Select id="scope" name="scope" defaultValue="content">
                    <option value="content">Content item</option>
                    <option value="social">Social response</option>
                    <option value="company">Whole company</option>
                  </Select>
                </Field>
                <Field label="Client" htmlFor="companyId">
                  <Select id="companyId" name="companyId" required>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field
                label="Target ID"
                htmlFor="targetId"
                hint="Content/social id under hold. For a company-wide hold, use the company id."
              >
                <Input id="targetId" name="targetId" required placeholder="ct_… / sr_… / c_…" />
              </Field>
              <Field label="Reason" htmlFor="reason">
                <Input id="reason" name="reason" required placeholder="e.g. Preserved for ACCC enquiry" />
              </Field>
              <Button type="submit">Apply hold</Button>
            </form>

            {recentContent.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent content ids
                </p>
                <ul className="space-y-1 text-xs">
                  {recentContent.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">{c.title}</span>
                      <span className="whitespace-nowrap font-mono">{c.id}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
