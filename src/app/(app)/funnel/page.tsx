import { requireAdmin } from "@/lib/auth/rbac";
import {
  visibleCompanies,
  visibleConversionFunnels,
  visibleFunnelAbExperiments,
  visibleFunnelJourneys,
  visibleFunnelLandingPages,
} from "@/lib/scope";
import {
  computeCtaMetrics,
  computeStageMetrics,
  determineAbWinner,
  totalDropOffPct,
} from "@/lib/funnel";
import { funnelConfigured } from "@/lib/funnel-connectors";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  activateFunnelAction,
  completeAbExperimentAction,
  createAbExperimentAction,
  createConversionFunnelAction,
  createJourneyAction,
  createLandingPageAction,
  importLandingAnalyticsAction,
  runAbExperimentAction,
} from "./actions";

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await visibleCompanies(user)).filter((c) => c.status !== "archived");
  const companyId =
    params.company && companies.some((c) => c.id === params.company)
      ? params.company
      : companies[0]?.id;

  const [journeys, funnels, landingPages, experiments] = companyId
    ? await Promise.all([
        visibleFunnelJourneys(user, companyId),
        visibleConversionFunnels(user, companyId),
        visibleFunnelLandingPages(user, companyId),
        visibleFunnelAbExperiments(user, companyId),
      ])
    : [[], [], [], []];

  const primaryFunnel = funnels[0];
  const stageMetrics = primaryFunnel ? computeStageMetrics(primaryFunnel) : [];
  const dropOff = totalDropOffPct(stageMetrics);

  return (
    <div>
      <PageHeader
        title="Funnels & A/B"
        description="Journey mapping, conversion stages, landing analytics, and simulated A/B tests."
      >
        <Badge tone={funnelConfigured() ? "success" : "neutral"}>
          {funnelConfigured() ? "FUNNEL_LIVE on" : "Simulated (FUNNEL_LIVE off)"}
        </Badge>
      </PageHeader>

      {!funnelConfigured() && (
        <div className="mx-6 mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Landing analytics and A/B results are deterministic simulations until FUNNEL_LIVE=true and
          FUNNEL_API_KEY are set.
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-end gap-4 p-6">
            <form method="get" className="flex gap-3">
              <Field label="Client" htmlFor="company">
                <Select id="company" name="company" defaultValue={companyId ?? ""}>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary">
                Switch
              </Button>
            </form>
            {primaryFunnel && (
              <p className="text-sm text-muted-foreground">
                Funnel drop-off: {dropOff}% across {stageMetrics.length} stages
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Journeys</h2>
            {journeys.map((j) => (
              <div key={j.id} className="mb-2 rounded border p-2 text-sm">
                <div className="font-medium">{j.name}</div>
                <div className="text-muted-foreground">{j.touchpoints.length} touchpoints</div>
                <StatusBadge status={j.status} />
              </div>
            ))}
            {companyId && (
              <form action={createJourneyAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" htmlFor="journey-name">
                  <Input id="journey-name" name="name" required placeholder="Guest booking journey" />
                </Field>
                <Button type="submit">Add journey</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Conversion funnels</h2>
            {funnels.map((f) => (
              <div key={f.id} className="mb-2 rounded border p-2 text-sm">
                <div className="font-medium">{f.name}</div>
                <div className="text-muted-foreground">{f.stages.length} stages</div>
                <StatusBadge status={f.status} />
                {f.status === "draft" && (
                  <form action={activateFunnelAction} className="mt-2">
                    <input type="hidden" name="funnelId" value={f.id} />
                    <Button size="sm" type="submit">
                      Activate
                    </Button>
                  </form>
                )}
              </div>
            ))}
            {companyId && (
              <form action={createConversionFunnelAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" htmlFor="funnel-name">
                  <Input id="funnel-name" name="name" required placeholder="Booking funnel" />
                </Field>
                {journeys[0] && (
                  <input type="hidden" name="journeyId" value={journeys[0].id} />
                )}
                <Button type="submit">Add funnel</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Stage metrics</h2>
            {stageMetrics.length === 0 && (
              <p className="text-sm text-muted-foreground">Create a funnel to see drop-off.</p>
            )}
            {stageMetrics.map((m) => (
              <div key={m.stageId} className="mb-2 rounded border p-2 text-sm">
                <div className="font-medium">
                  {m.order}. {m.stageName}
                </div>
                <div className="text-muted-foreground">
                  {m.entrants} entrants · {m.dropOffPct}% drop-off
                  {m.ctaKind ? ` · CTA: ${m.ctaKind}` : ""}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Landing pages</h2>
            {landingPages.map((p) => {
              const cta = computeCtaMetrics(p);
              return (
                <div key={p.id} className="mb-3 rounded border p-3 text-sm">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-muted-foreground">/{p.slug}</div>
                  <p className="mt-1">
                    {p.viewCount} views · {p.uniqueVisitors} visitors · {p.ctaClicks} CTA clicks ·{" "}
                    {p.formSubmissions} forms
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CTA rate {cta.ctaClickRatePct}% · Form conv. {cta.formConversionRatePct}%
                  </p>
                  {companyId && (
                    <form action={importLandingAnalyticsAction} className="mt-2">
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="landingPageId" value={p.id} />
                      <Button size="sm" variant="outline" type="submit">
                        Refresh analytics
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
            {companyId && (
              <form action={createLandingPageAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                {primaryFunnel && (
                  <input type="hidden" name="funnelId" value={primaryFunnel.id} />
                )}
                <Field label="Slug" htmlFor="lp-slug">
                  <Input id="lp-slug" name="slug" required placeholder="summer-offer" />
                </Field>
                <Field label="Title" htmlFor="lp-title">
                  <Input id="lp-title" name="title" required placeholder="Summer offer" />
                </Field>
                <Button type="submit">Add landing page</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">A/B experiments</h2>
            {experiments.map((e) => {
              const projectedWinner =
                e.winnerVariantId ?? (e.status !== "completed" ? determineAbWinner(e) : null);
              return (
                <div key={e.id} className="mb-3 rounded border p-3 text-sm">
                  <div className="font-medium">{e.name}</div>
                  <StatusBadge status={e.status} />
                  <p className="mt-1 text-muted-foreground">{e.variants.length} variants</p>
                  {projectedWinner && (
                    <p className="text-xs">
                      Winner: {e.variants.find((v) => v.id === projectedWinner)?.label ?? projectedWinner}
                    </p>
                  )}
                  {e.status === "draft" && (
                    <form action={runAbExperimentAction} className="mt-2">
                      <input type="hidden" name="experimentId" value={e.id} />
                      <Button size="sm" type="submit">
                        Start test
                      </Button>
                    </form>
                  )}
                  {e.status === "running" && (
                    <form action={completeAbExperimentAction} className="mt-2">
                      <input type="hidden" name="experimentId" value={e.id} />
                      <Button size="sm" variant="outline" type="submit">
                        Complete
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
            {companyId && (
              <form action={createAbExperimentAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                {primaryFunnel && (
                  <input type="hidden" name="funnelId" value={primaryFunnel.id} />
                )}
                {landingPages[0] && (
                  <input type="hidden" name="landingPageId" value={landingPages[0].id} />
                )}
                <Field label="Name" htmlFor="ab-name">
                  <Input id="ab-name" name="name" required placeholder="Headline test" />
                </Field>
                <Button type="submit">Add experiment</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
