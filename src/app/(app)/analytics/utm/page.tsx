import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listUtmLinks } from "@/lib/db";
import { buildReport } from "@/lib/analytics";
import { buildUtmUrl } from "@/lib/utm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { CopyButton } from "@/components/copy-button";
import { formatDate } from "@/lib/utils";
import { createUtmLinkAction } from "../actions";

const money = (x: number) => `$${Math.round(x).toLocaleString("en-AU")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

const CONTENT_TYPES = ["social_post", "email_newsletter", "ad_copy", "landing_page", "blog_article"];

export default async function UtmRoiPage() {
  const user = await requireAdmin();
  const allCompanies = await listCompanies(user.tenantId);
  const companies = allCompanies.filter((c) => c.status !== "archived");
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const links = await listUtmLinks(user.tenantId);
  const r = await buildReport(user.tenantId);

  return (
    <div>
      <PageHeader
        title="UTM & ROI attribution"
        description="Build trackable links and see attributed leads and revenue by campaign, company and platform (§42)."
      >
        <Link href="/analytics" className="text-sm text-primary hover:underline">
          ← Analytics
        </Link>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* ROI band */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-bold">{r.roi.leads.toLocaleString("en-AU")}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Conversion</p><p className="mt-1 text-2xl font-bold">{pct(r.roi.conversionRate)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost / lead</p><p className="mt-1 text-2xl font-bold">{r.roi.costPerLead !== null ? money(r.roi.costPerLead) : "—"}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Est. revenue</p><p className="mt-1 text-2xl font-bold">{money(r.roi.estRevenue)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">AI spend</p><p className="mt-1 text-2xl font-bold">{money(r.roi.costUsd)}</p></CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Attribution by campaign */}
          <Card>
            <CardContent className="p-0">
              <h3 className="border-b border-border p-4 font-semibold">Leads &amp; revenue by campaign</h3>
              {r.roi.byCampaign.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No campaign-attributed leads yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Campaign</th>
                      <th className="px-4 py-2 text-right font-medium">Leads</th>
                      <th className="px-4 py-2 text-right font-medium">Est. revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.roi.byCampaign.map((c) => (
                      <tr key={c.key}>
                        <td className="px-4 py-2 font-medium">{c.label}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{c.leads}</td>
                        <td className="px-4 py-2 text-right font-medium">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Attribution by platform */}
          <Card>
            <CardContent className="p-0">
              <h3 className="border-b border-border p-4 font-semibold">Leads &amp; revenue by platform</h3>
              {r.byPlatform.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No published data yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Platform</th>
                      <th className="px-4 py-2 text-right font-medium">Leads</th>
                      <th className="px-4 py-2 text-right font-medium">Est. revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.byPlatform.map((c) => (
                      <tr key={c.key}>
                        <td className="px-4 py-2 font-medium">{c.label}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{c.leads}</td>
                        <td className="px-4 py-2 text-right font-medium">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* UTM builder */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 font-semibold">Build a tracking link</h3>
              <form action={createUtmLinkAction} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Company" htmlFor="companyId">
                    <Select id="companyId" name="companyId" required>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Content type" htmlFor="contentType">
                    <Select id="contentType" name="contentType" defaultValue="social_post">
                      {CONTENT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Destination URL" htmlFor="destinationUrl">
                  <Input id="destinationUrl" name="destinationUrl" required placeholder="https://…" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Source" htmlFor="source">
                    <Input id="source" name="source" defaultValue="facebook" />
                  </Field>
                  <Field label="Medium" htmlFor="medium">
                    <Input id="medium" name="medium" defaultValue="social" />
                  </Field>
                  <Field label="Campaign" htmlFor="campaign">
                    <Input id="campaign" name="campaign" defaultValue="general" />
                  </Field>
                </div>
                <Field label="Request ID (optional)" htmlFor="requestId">
                  <Input id="requestId" name="requestId" placeholder="r_…" />
                </Field>
                <Button type="submit">Create tracking link</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 font-semibold">Tracking links</h3>
              <div className="space-y-3">
                {links.map((l) => {
                  const url = buildUtmUrl(l);
                  return (
                    <div key={l.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{companyById.get(l.companyId)?.name}</span>
                        <Badge tone="info">{l.source}/{l.medium}</Badge>
                        <Badge tone="neutral">{l.campaign}</Badge>
                      </div>
                      <p className="mb-2 break-all font-mono text-xs text-muted-foreground">{url}</p>
                      <div className="flex items-center gap-2">
                        <CopyButton text={url} />
                        <span className="text-xs text-muted-foreground">{formatDate(l.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
                {links.length === 0 && (
                  <p className="text-sm text-muted-foreground">No tracking links yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
