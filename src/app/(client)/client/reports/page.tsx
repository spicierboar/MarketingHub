import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant } from "@/lib/db";
import { buildClientRoiReport, buildClientReportSummary } from "@/lib/client-reports";
import { emailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const n = (x: number) => x.toLocaleString("en-AU");
const money = (x: number) => `$${Math.round(x).toLocaleString("en-AU")}`;
const roasFmt = (x: number | null) => (x === null ? "—" : `${x.toFixed(1)}×`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function ClientReportsPage() {
  const { user, companyId } = await requirePortalUser();
  const [report, company, tenant, summary] = await Promise.all([
    buildClientRoiReport(user.tenantId, companyId),
    getCompany(companyId),
    getTenant(user.tenantId),
    buildClientReportSummary(user.tenantId, companyId),
  ]);
  const scheduled = company?.profile.clientReports?.scheduledEmail !== false;

  return (
    <div>
      <PageHeader
        title="Performance report"
        description={`${report.periodLabel} — organic, paid, and leads for ${report.companyName}.`}
      >
        <div className="flex gap-2">
          <Badge tone={scheduled ? "success" : "neutral"}>{scheduled ? "Weekly email on" : "Email off"}</Badge>
          <Badge tone={emailConfigured() ? "success" : "neutral"}>
            {emailConfigured() ? "Email live" : "Email simulated"}
          </Badge>
        </div>
      </PageHeader>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Total leads" value={n(report.combined.totalLeads)} />
          <Stat label="Est. revenue" value={money(report.combined.totalEstRevenue)} />
          <Stat label="Total spend" value={money(report.combined.totalSpend)} />
          <Stat label="Blended ROAS" value={roasFmt(report.combined.blendedRoas)} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardContent className="p-6">
            <h3 className="mb-3 font-semibold">Organic social</h3>
            <p className="text-sm text-muted-foreground">
              {n(report.organic.publishedPosts)} posts · {n(report.organic.reach)} reach · {n(report.organic.leads)} leads
            </p>
          </CardContent></Card>
          <Card><CardContent className="p-6">
            <h3 className="mb-3 font-semibold">Paid advertising</h3>
            <p className="text-sm text-muted-foreground">
              {money(report.paid.spendUsd)} spend · {n(report.paid.leads)} leads · ROAS {roasFmt(report.paid.roas)}
            </p>
          </CardContent></Card>
        </div>
        <Card><CardContent className="p-6">
          <h3 className="mb-3 font-semibold">Summary</h3>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary.text}</p>
          {tenant?.branding?.emailFromName && (
            <p className="mt-2 text-xs text-muted-foreground">Branded as {tenant.branding.emailFromName}</p>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
