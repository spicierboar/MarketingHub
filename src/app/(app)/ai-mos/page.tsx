import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { listCompanies, listAiMosOpportunities } from "@/lib/db";
import {
  aiMosExecutionMode,
  listOpenOpportunitiesForTenant,
  listRecentSignalRunsForTenant,
} from "@/lib/ai-mos";
import { aiMosConfigured } from "@/lib/ai-mos-connectors";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import type { AiMosOpportunity, AiMosSignalRun } from "@/lib/types";
import { AiMosOpportunityCard } from "@/components/ai-mos-opportunity-cards";
import { scanAiMosAction } from "./actions";

export default async function AiMosPage() {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter((c) => c.status !== "archived");
  const scope = await accessibleCompanyIds(user);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c.name]));

  const open = await listOpenOpportunitiesForTenant(user.tenantId, scope, 50);
  const history = (await listAiMosOpportunities(user.tenantId, scope)).filter((o) => o.status !== "open");
  const signalRuns = await listRecentSignalRunsForTenant(user.tenantId, scope, 30);

  const byCompany = new Map<string, AiMosOpportunity[]>();
  for (const opp of open) {
    if (!byCompany.has(opp.companyId)) byCompany.set(opp.companyId, []);
    byCompany.get(opp.companyId)!.push(opp);
  }

  return (
    <div>
      <PageHeader
        title="Signals"
        explainerId="signals"
        explainer="Ops radar: scan clients for health, calendar gaps, cadence, approvals, reviews, and loyalty. Convert a signal into a draft or dismiss it — never auto-publishes."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/recommendations" className={buttonClasses("outline", "sm")}>
            Recommendations
          </Link>
          <Badge tone="info">{titleCase(aiMosExecutionMode().replace(/_/g, " "))}</Badge>
          <Badge tone={aiMosConfigured() ? "success" : "neutral"}>
            {aiMosConfigured() ? "Live connectors" : "Simulated signals"}
          </Badge>
          <form action={scanAiMosAction}>
            <Button type="submit" variant="outline">Scan all clients</Button>
          </form>
        </div>
      </PageHeader>

      <div className="space-y-6 p-6">
        {companies.map((company) => {
          const opps = byCompany.get(company.id) ?? [];
          const aiReady = company.status === "ai_ready" || company.status === "approved";
          return (
            <Card key={company.id}>
              <CardContent className="p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{company.name}</h2>
                  <form action={scanAiMosAction}>
                    <input type="hidden" name="companyId" value={company.id} />
                    <Button type="submit" variant="outline" size="sm" disabled={!aiReady}>
                      {opps.length ? "Rescan signals" : "Scan signals"}
                    </Button>
                  </form>
                </div>
                {opps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {aiReady ? "No open opportunities — scan to monitor signals." : "Company must be AI-ready before AI-MOS can scan."}
                  </p>
                ) : (
                  <div className="space-y-4">{opps.map((opp) => <AiMosOpportunityCard key={opp.id} opp={opp} />)}</div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {signalRuns.length > 0 && (
          <details className="rounded-lg border border-border bg-card p-4" open>
            <summary className="cursor-pointer text-sm font-medium">Signal log ({signalRuns.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {signalRuns.map((run: AiMosSignalRun) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="text-muted-foreground">{companyById.get(run.companyId)} — {formatDate(run.createdAt)}</span>
                  <div className="flex gap-1.5">
                    <Badge tone="neutral">{titleCase(run.mode)}</Badge>
                    <Badge tone="info">{run.signalCount} signal(s)</Badge>
                    <Badge tone="primary">{run.opportunityCount} draft(s)</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}

        {history.length > 0 && (
          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">History ({history.length})</summary>
            <ul className="mt-3 space-y-1 text-sm">
              {history.slice(0, 30).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">{companyById.get(o.companyId)} — {o.title}</span>
                  <Badge tone={o.status === "converted" ? "success" : "neutral"}>{titleCase(o.status)}</Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
