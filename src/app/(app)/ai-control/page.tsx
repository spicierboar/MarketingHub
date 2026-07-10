import { requireAdmin } from "@/lib/auth/rbac";
import { listAiRuns, listCompanies } from "@/lib/db";
import { aiConfigured, AI_MODEL } from "@/lib/ai/claude";
import { buildIntegrationHealthAlerts, buildIntegrationHealthBundle } from "@/lib/security-slice";
import { SecurityHealthPanel, IntegrationHealthAlertsPanel } from "@/components/security-health-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, titleCase } from "@/lib/utils";

// AI Risk Control Centre foundation (Phase 3, master prompt §52):
// every AI invocation is recorded — prompt, model, sources, output size, cost —
// and the standing guardrails are visible in one place.

const GUARDRAILS = [
  { label: "Prompt injection patterns filtered on AI inputs", ok: true },
  { label: "Human approval required before anything is published", ok: true },
  { label: "AI cannot approve, publish, or change settings", ok: true },
  { label: "Users never see credentials or API keys", ok: true },
  { label: "Prohibited claims enforced per company (Brand Brain)", ok: true },
  { label: "Claims outside the Claims Library flagged as unsupported", ok: true },
  { label: "Consent Register checked for named/shown customers", ok: true },
  { label: "High-risk content routed to compliance review", ok: true },
  { label: "Auto-responses disabled (Phase 7+ feature, off by default)", ok: true },
];

export default async function AiControlPage() {
  const user = await requireAdmin();
  const runs = await listAiRuns(user.tenantId);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));
  const integrationHealth = buildIntegrationHealthBundle(user.tenantId);
  const integrationAlerts = buildIntegrationHealthAlerts(integrationHealth);
  const totalCost = runs.reduce((s, r) => s + r.estCostUsd, 0);
  const byKind = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="AI Risk Control Centre"
        description="Every AI run recorded: prompt, model, sources and cost. Guardrails at a glance."
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">AI runs</p>
              <p className="mt-1 text-3xl font-bold">{runs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Est. cost (USD)</p>
              <p className="mt-1 text-3xl font-bold">${totalCost.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Model</p>
              <p className="mt-1 truncate text-lg font-bold">
                {aiConfigured() ? AI_MODEL : "Template (no API key)"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Runs by kind</p>
              <p className="mt-1 text-sm font-medium">
                {Object.entries(byKind)
                  .map(([k, v]) => `${titleCase(k)}: ${v}`)
                  .join(" · ") || "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        <SecurityHealthPanel
          bundle={integrationHealth}
          title="AI & integration health"
          description="Anthropic provider status plus platform live gates. Failures are recorded when live calls fail; simulated hints show when gates are off."
        />

        <IntegrationHealthAlertsPanel alertBundle={integrationAlerts} />

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-semibold">Guardrails</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {GUARDRAILS.map((g) => (
                <li key={g.label} className="flex items-center gap-2 text-sm">
                  <Badge tone={g.ok ? "success" : "danger"}>{g.ok ? "ON" : "OFF"}</Badge>
                  {g.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <h2 className="border-b border-border p-5 font-semibold">AI run log</h2>
            {runs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No AI runs yet. Generate a draft or a social reply and it will appear here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Company</th>
                    <th className="px-4 py-3 font-medium">Prompt</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Sources</th>
                    <th className="px-4 py-3 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.slice(0, 50).map((r) => (
                    <tr key={r.id} className="align-top hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="primary">{titleCase(r.kind)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.companyId ? companyById.get(r.companyId)?.name : "—"}
                      </td>
                      <td className="max-w-56 px-4 py-3 text-muted-foreground">
                        <span className="line-clamp-2">{r.promptSummary}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.model}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.sourcesUsed.length}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.estCostUsd ? `$${r.estCostUsd.toFixed(4)}` : "$0"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
