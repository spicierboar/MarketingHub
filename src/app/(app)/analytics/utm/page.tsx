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

const CONTENT_TYPES: { value: string; label: string }[] = [
  { value: "social_post", label: "Social post" },
  { value: "email_newsletter", label: "Email newsletter" },
  { value: "ad_copy", label: "Ad copy" },
  { value: "landing_page", label: "Landing page" },
  { value: "blog_article", label: "Blog article" },
];

const UTM_SOURCES = [
  "facebook",
  "instagram",
  "google",
  "tiktok",
  "email",
  "sms",
  "linkedin",
  "newsletter",
] as const;

const UTM_MEDIUMS = [
  "social",
  "email",
  "cpc",
  "organic",
  "referral",
  "sms",
] as const;

export default async function UtmRoiPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const allCompanies = await listCompanies(user.tenantId);
  const companies = allCompanies.filter((c) => c.status !== "archived");
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && companies.some((c) => c.id === companyParam)
      ? companyParam
      : undefined;
  const formCompanies = companyId
    ? companies.filter((c) => c.id === companyId)
    : companies;
  const links = (await listUtmLinks(user.tenantId)).filter(
    (l) => !companyId || l.companyId === companyId,
  );
  const r = await buildReport(
    user.tenantId,
    companyId ? [companyId] : undefined,
  );
  const analyticsHref = companyId
    ? `/analytics?company=${companyId}`
    : "/analytics";

  const scopedName = companyId ? companyById.get(companyId)?.name : undefined;

  return (
    <div>
      <PageHeader
        title={
          scopedName ? `UTM & ROI · ${scopedName}` : "UTM & ROI attribution"
        }
        description={
          scopedName
            ? `Trackable links and attributed leads/revenue for ${scopedName}.`
            : "Build trackable links and see attributed leads and revenue by campaign, company and platform (§42)."
        }
      >
        <Link href={analyticsHref} className="text-sm text-primary hover:underline">
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
                  {companyId ? (
                    <Field label="Client" htmlFor="companyId">
                      <input type="hidden" name="companyId" value={companyId} />
                      <p
                        id="companyId"
                        className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium"
                      >
                        {companyById.get(companyId)?.name ?? "Client"}
                      </p>
                    </Field>
                  ) : (
                    <Field label="Client" htmlFor="companyId">
                      <Select
                        id="companyId"
                        name="companyId"
                        required
                        defaultValue={companyId}
                      >
                        {formCompanies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Content type" htmlFor="contentType">
                    <Select id="contentType" name="contentType" defaultValue="social_post">
                      {CONTENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field
                  label="Destination URL"
                  htmlFor="destinationUrl"
                  hint="Full landing URL including https://"
                >
                  <Input
                    id="destinationUrl"
                    name="destinationUrl"
                    required
                    placeholder="https://www.example.com/offer"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Source" htmlFor="source" hint="utm_source">
                    <Select id="source" name="source" defaultValue="facebook">
                      {UTM_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Medium" htmlFor="medium" hint="utm_medium">
                    <Select id="medium" name="medium" defaultValue="social">
                      {UTM_MEDIUMS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Campaign" htmlFor="campaign" hint="utm_campaign slug">
                    <Input
                      id="campaign"
                      name="campaign"
                      defaultValue="general"
                      placeholder="e.g. winter-lunch-jul"
                    />
                  </Field>
                </div>
                <Field
                  label="Request ID (optional)"
                  htmlFor="requestId"
                  hint="Stored as utm_term for request attribution"
                >
                  <Input id="requestId" name="requestId" placeholder="e.g. r_…" />
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
