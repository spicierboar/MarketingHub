import { requirePortalUser } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import { buildClientRoiReport, buildClientReportSummary } from "@/lib/client-reports";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

const n = (x: number) => x.toLocaleString("en-AU");
const money = (x: number) => `$${Math.round(x).toLocaleString("en-AU")}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function ClientReportsPage() {
  const { user, companyId } = await requirePortalUser();
  const [report, tenant, summary] = await Promise.all([
    buildClientRoiReport(user.tenantId, companyId),
    getTenant(user.tenantId),
    buildClientReportSummary(user.tenantId, companyId),
  ]);

  const loopLine =
    report.combined.totalSpend > 0 || report.combined.totalLeads > 0
      ? `${money(report.combined.totalSpend)} ad spend → ${n(report.combined.totalLeads)} leads` +
        (report.combined.totalEstRevenue > 0
          ? ` → ~${money(report.combined.totalEstRevenue)} estimated revenue`
          : "") +
        (report.combined.blendedRoas != null
          ? ` (blended ROAS ${report.combined.blendedRoas.toFixed(1)}×)`
          : "")
      : "No spend or leads in this period yet — we’ll show the closed loop here once campaigns run.";

  return (
    <div>
      <PageHeader
        title="How things are going"
        explainerId="client-results"
        explainer="Results for your marketing — leads, estimated revenue, and what’s working. Ask us if something looks off."
        description={`${report.periodLabel} · ${report.companyName}`}
      />
      <div className="space-y-4 p-4 sm:p-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium">Closed-loop snapshot</p>
            <p className="mt-1 text-sm text-foreground">{loopLine}</p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Leads" value={n(report.combined.totalLeads)} />
          <Stat
            label="Estimated revenue"
            value={money(report.combined.totalEstRevenue)}
          />
          <Stat
            label="Ad spend"
            value={money(report.combined.totalSpend)}
            hint={
              report.paid.cplUsd != null
                ? `CPL ${money(report.paid.cplUsd)}`
                : undefined
            }
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Posts &amp; reach</h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {n(report.organic.publishedPosts)} posts · {n(report.organic.reach)}{" "}
                reach · {n(report.organic.leads)} organic leads ·{" "}
                {n(report.organic.engagement)} engagement
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Ads</h3>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {money(report.paid.spendUsd)} spend · {n(report.paid.leads)} paid
                leads
                {report.paid.roas != null
                  ? ` · ROAS ${report.paid.roas.toFixed(1)}×`
                  : ""}
                {report.paid.campaigns
                  ? ` · ${report.paid.campaigns} campaign(s)`
                  : ""}
              </p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Summary</h3>
            <p className="whitespace-pre-wrap text-xs text-muted-foreground sm:text-sm">
              {summary.text}
            </p>
            {tenant?.branding?.emailFromName && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Branded as {tenant.branding.emailFromName}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
