import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import {
  listAiCampaignRecommendations,
  listRecommendations,
  resurfaceExpiredSnoozedRecommendations,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/utils";
import {
  buildAgencyPortfolioAttention,
  dismissReasonOf,
  recommendationScore,
} from "@/lib/recommendations";
import type { AiCampaignRecommendation, Recommendation } from "@/lib/types";
import { AgencyPortfolioStrip, RecommendationCard } from "@/components/recommendation-cards";
import { AiCampaignRecommendationsPanel } from "@/components/ai-campaign-recommendations-panel";
import { generateRecommendationsAction } from "./actions";

export default async function RecommendationsPage() {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter((c) => c.status !== "archived");
  const scope = await accessibleCompanyIds(user);
  await resurfaceExpiredSnoozedRecommendations(user.tenantId, scope);
  const allRecs = await listRecommendations(user.tenantId, scope);
  const open = allRecs.filter((r) => r.status === "open");
  const history = allRecs.filter((r) => r.status !== "open" && r.status !== "snoozed");
  const portfolio = buildAgencyPortfolioAttention(companies, allRecs, { limit: 8 });

  const aiCampaignRecs: AiCampaignRecommendation[] = (
    await Promise.all(scope.map((id) => listAiCampaignRecommendations(id)))
  ).flat();
  const companyById = new Map(companies.map((c) => [c.id, c.name]));

  const byCompany = new Map<string, Recommendation[]>();
  for (const r of open) {
    if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, []);
    byCompany.get(r.companyId)!.push(r);
  }
  for (const recs of byCompany.values()) {
    recs.sort(
      (a, b) =>
        (recommendationScore(b) ?? 0) - (recommendationScore(a) ?? 0) ||
        a.title.localeCompare(b.title),
    );
  }

  return (
    <div>
      <PageHeader
        title="Recommendations"
        description="Ranked, evidence-backed next steps from analytics, calendar gaps, reviews, loyalty, and Brand Brain signals."
      />

      <div className="space-y-6 p-6">
        <AgencyPortfolioStrip rows={portfolio} />

        {aiCampaignRecs.some((r) => !r.humanDecision || r.humanDecision === "pending") && (
          <Card>
            <CardContent className="p-6">
              <AiCampaignRecommendationsPanel
                recommendations={aiCampaignRecs}
                companyById={companyById}
                title="AI campaign layer"
                showCampaignLink
                emptyMessage="No pending AI campaign recommendations."
              />
            </CardContent>
          </Card>
        )}

        {companies.map((company) => {
          const recs = byCompany.get(company.id) ?? [];
          const aiReady = company.status === "ai_ready" || company.status === "approved";
          return (
            <Card key={company.id}>
              <CardContent className="p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{company.name}</h2>
                  <form action={generateRecommendationsAction}>
                    <input type="hidden" name="companyId" value={company.id} />
                    <Button type="submit" variant="outline" size="sm" disabled={!aiReady}>
                      {recs.length ? "Regenerate" : "Generate recommendations"}
                    </Button>
                  </form>
                </div>

                {recs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {aiReady
                      ? "No open recommendations — generate a fresh ranked set from the latest data."
                      : "Company must be AI-ready before recommendations can be generated."}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recs.map((rec, i) => (
                      <RecommendationCard key={rec.id} rec={rec} rank={i} />
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
              History ({history.length} actioned / dismissed)
            </summary>
            <ul className="mt-3 space-y-1 text-sm">
              {history.slice(0, 30).map((r) => {
                const dismissReason = dismissReasonOf(r);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {r.title}
                      {dismissReason ? ` — “${dismissReason}”` : ""}
                    </span>
                    <Badge tone={r.status === "actioned" ? "success" : "neutral"}>
                      {titleCase(r.status)}
                      {r.resultType ? ` → ${r.resultType}` : ""}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
