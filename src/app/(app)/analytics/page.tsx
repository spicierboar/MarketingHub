import Link from "next/link";
import { requireAdmin, accessibleCompanyIds } from "@/lib/auth/rbac";
import { buildReport } from "@/lib/analytics";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { AiSummary } from "@/components/ai-summary";
import { titleCase } from "@/lib/utils";
import type { DimensionRow } from "@/lib/analytics";

const n = (x: number) => x.toLocaleString("en-AU");
const money = (x: number) => `$${Math.round(x).toLocaleString("en-AU")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DimTable({
  title,
  rows,
  showRevenue = true,
}: {
  title: string;
  rows: DimensionRow[];
  showRevenue?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="border-b border-border p-4 font-semibold">{title}</h3>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No published data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{title.replace("By ", "")}</th>
                  <th className="px-4 py-2 text-right font-medium">Posts</th>
                  <th className="px-4 py-2 text-right font-medium">Reach</th>
                  <th className="px-4 py-2 text-right font-medium">Engmt</th>
                  <th className="px-4 py-2 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2 text-right font-medium">Leads</th>
                  {showRevenue && <th className="px-4 py-2 text-right font-medium">Est. rev</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">{r.label}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{n(r.posts)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{n(r.reach)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{n(r.engagement)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{n(r.clicks)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{n(r.leads)}</td>
                    {showRevenue && (
                      <td className="px-4 py-2 text-right font-medium">{money(r.revenue)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const allowed = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;
  const scopedCompany = companyId ? await getCompany(companyId) : null;
  const r = await buildReport(
    user.tenantId,
    companyId ? [companyId] : undefined,
  );
  const t = r.timeliness;
  const utmHref = companyId
    ? `/analytics/utm?company=${companyId}`
    : "/analytics/utm";

  return (
    <div>
      <PageHeader
        title={scopedCompany ? `Analytics · ${scopedCompany.name}` : "Analytics & reporting"}
        description={
          scopedCompany
            ? `${scopedCompany.name} performance. Engagement is simulated per published post until live platform data is connected.`
            : "Group-wide performance. Engagement is simulated per published post until live platform data is connected."
        }
      >
        <Link href={utmHref} className={buttonClasses("outline")}>
          UTM &amp; ROI builder
        </Link>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Funnel */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Content funnel
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
            <Stat label="Requests" value={n(r.funnel.requests)} />
            <Stat label="Drafts" value={n(r.funnel.drafts)} />
            <Stat label="Pending" value={n(r.funnel.pendingApproval)} />
            <Stat label="Approved" value={n(r.funnel.approved)} />
            <Stat label="Scheduled" value={n(r.funnel.scheduled)} />
            <Stat label="Published" value={n(r.funnel.published)} />
            <Stat label="Rejected" value={n(r.funnel.rejected)} />
          </div>
        </div>

        {/* Performance + ROI */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Performance &amp; ROI
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Reach" value={n(r.totals.reach)} sub={`${r.totals.publishedPosts} posts`} />
            <Stat label="Engagement" value={n(r.totals.engagement)} />
            <Stat label="Clicks" value={n(r.totals.clicks)} />
            <Stat label="Leads" value={n(r.roi.leads)} sub={`${pct(r.roi.conversionRate)} of clicks`} />
            <Stat label="Est. revenue" value={money(r.roi.estRevenue)} />
            <Stat
              label="AI spend"
              value={money(r.ai.costUsd)}
              sub={r.roi.costPerLead !== null ? `${money(r.roi.costPerLead)} / lead` : "—"}
            />
          </div>
        </div>

        {/* Dimension tables */}
        <div className={`grid gap-6 ${companyId ? "" : "lg:grid-cols-2"}`}>
          <DimTable title="By platform" rows={r.byPlatform} />
          {!companyId && <DimTable title="By company" rows={r.byCompany} />}
        </div>
        <DimTable title="By campaign" rows={r.byCampaign} />

        {/* Best / worst + AI summary */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">Best &amp; worst content</h3>
              {r.topContent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published content yet.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">
                      Top performers
                    </p>
                    <ul className="space-y-1 text-sm">
                      {r.topContent.map((c) => (
                        <li key={c.id} className="flex justify-between gap-2">
                          <Link href={`/content/${c.id}`} className="truncate hover:text-primary">
                            {c.title}
                          </Link>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {n(c.engagement)} eng · {c.leads} leads
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700">
                      Underperformers
                    </p>
                    <ul className="space-y-1 text-sm">
                      {r.bottomContent.map((c) => (
                        <li key={c.id} className="flex justify-between gap-2">
                          <Link href={`/content/${c.id}`} className="truncate hover:text-primary">
                            {c.title}
                          </Link>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {n(c.engagement)} eng
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">AI management summary</h3>
              <AiSummary companyId={companyId} />
            </CardContent>
          </Card>
        </div>

        {/* Social + governance/timeliness */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">Social engagement</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Interactions:</span> {n(r.social.total)}</div>
                <div><span className="text-muted-foreground">Published replies:</span> {n(r.social.published)}</div>
                <div><span className="text-muted-foreground">Escalated:</span> {n(r.social.escalated)}</div>
                <div><span className="text-muted-foreground">Handled rate:</span> {pct(r.social.draftAcceptanceRate)}</div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sentiment</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(r.social.bySentiment).map(([s, c]) => (
                    <Badge key={s} tone="neutral">{titleCase(s)}: {c}</Badge>
                  ))}
                  {Object.keys(r.social.bySentiment).length === 0 && (
                    <span className="text-sm text-muted-foreground">No social data yet.</span>
                  )}
                </div>
              </div>
              {r.social.topIntents.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Top enquiry types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.social.topIntents.map((i) => (
                      <Badge key={i.intent} tone="info">{titleCase(i.intent)}: {i.count}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">Governance &amp; timeliness</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI draft acceptance</span>
                  <span className="font-medium">{pct(r.ai.acceptanceRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Human edit rate</span>
                  <span className="font-medium">{pct(r.ai.editRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg approval time</span>
                  <span className="font-medium">
                    {t.avgApprovalHours !== null ? `${t.avgApprovalHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg request turnaround</span>
                  <span className="font-medium">
                    {t.avgRequestTurnaroundHours !== null ? `${t.avgRequestTurnaroundHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved, awaiting scheduling</span>
                  <span className="font-medium">{n(t.unpublishedApproved)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI runs</span>
                  <span className="font-medium">{n(r.ai.runs)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
