import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { listCompanies, listAiMosOpportunities } from "@/lib/db";
import { listOpenOpportunitiesForTenant } from "@/lib/ai-mos";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/utils";
import type { AiMosOpportunity } from "@/lib/types";
import { AiMosOpportunityCard } from "@/components/ai-mos-opportunity-cards";
import { scanAiMosAction } from "./actions";

export default async function AiMosPage() {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter((c) => c.status !== "archived");
  const scope = await accessibleCompanyIds(user);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c.name]));

  const open = await listOpenOpportunitiesForTenant(user.tenantId, scope, 50);
  const history = (await listAiMosOpportunities(user.tenantId, scope)).filter(
    (o) => o.status !== "open",
  );

  const byCompany = new Map<string, AiMosOpportunity[]>();
  for (const opp of open) {
    if (!byCompany.has(opp.companyId)) byCompany.set(opp.companyId, []);
    byCompany.get(opp.companyId)!.push(opp);
  }

  return (
    <div>
      <PageHeader
        title="AI-MOS"
        description="Suggest-only marketing operating system — monitors health scores, calendar gaps, and recommendations, then surfaces opportunity cards. Accept converts to draft campaigns or content requests; nothing publishes or spends without approval."
      >
        <form action={scanAiMosAction}>
          <Button type="submit" variant="outline">
            Scan all companies
          </Button>
        </form>
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
                    {aiReady
                      ? "No open opportunities — scan to monitor health, calendar, and recommendation signals."
                      : "Company must be AI-ready before AI-MOS can scan."}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {opps.map((opp) => (
                      <AiMosOpportunityCard key={opp.id} opp={opp} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {history.length > 0 && (
          <details className="rounded-lg border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">
              History ({history.length} converted / dismissed)
            </summary>
            <ul className="mt-3 space-y-1 text-sm">
              {history.slice(0, 30).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    {companyById.get(o.companyId)} — {o.title}
                    {o.dismissReason ? ` — “${o.dismissReason}”` : ""}
                  </span>
                  <Badge tone={o.status === "converted" ? "success" : "neutral"}>
                    {titleCase(o.status)}
                    {o.resultType ? ` → ${o.resultType}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
