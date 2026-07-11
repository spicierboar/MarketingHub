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
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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
        description={`${report.periodLabel} for ${report.companyName}.`}
      />
      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium">Closed-loop snapshot</p>
            <p className="mt-1 text-base text-foreground">{loopLine}</p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">Posts &amp; reach</h3>
              <p className="text-sm text-muted-foreground">
                {n(report.organic.publishedPosts)} posts · {n(report.organic.reach)}{" "}
                reach · {n(report.organic.leads)} organic leads ·{" "}
                {n(report.organic.engagement)} engagement
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-3 font-semibold">Ads</h3>
              <p className="text-sm text-muted-foreground">
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
          <CardContent className="p-6">
            <h3 className="mb-3 font-semibold">Summary</h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {summary.text}
            </p>
            {tenant?.branding?.emailFromName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Branded as {tenant.branding.emailFromName}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
