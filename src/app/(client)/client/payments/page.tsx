import { requirePortalUser } from "@/lib/auth/rbac";
import { getAdBudget, getCompany, getTenant, listAdCampaigns } from "@/lib/db";
import { planFor } from "@/lib/plans";
import { AD_PLATFORMS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const money = (x: number) =>
  `$${Math.round(x).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

const platformLabel = (key: string) =>
  AD_PLATFORMS.find((p) => p.key === key)?.label ?? key;

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default async function ClientPaymentsPage() {
  const { user, companyId } = await requirePortalUser();
  const [tenant, company, budget, campaigns] = await Promise.all([
    getTenant(user.tenantId),
    getCompany(companyId),
    getAdBudget(companyId),
    listAdCampaigns(user.tenantId, companyId),
  ]);

  const plan = planFor(tenant?.plan);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const allocationEntries = budget
    ? Object.entries(budget.allocation).filter(([, frac]) => typeof frac === "number" && frac > 0)
    : [];
  const dailyGuide = budget ? budget.monthlyBudgetUsd / 30 : null;
  const campaignDailyTotal = activeCampaigns.reduce((sum, c) => sum + c.dailyBudgetUsd, 0);
  const hasStripeSub = Boolean(tenant?.stripeSubscriptionId?.trim());
  const approvalContact = company?.profile.approvalContact?.trim() ?? "";
  const supportMailto = looksLikeEmail(approvalContact) ? approvalContact : null;

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Your plan and advertising budget at a glance."
      />

      <div className="space-y-8 p-6">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Subscription tier</p>
                <p className="mt-1 text-2xl font-semibold">{plan.name}</p>
                {plan.priceAudMonthly > 0 ? (
                  <p className="mt-1 text-lg font-medium">
                    {money(plan.priceAudMonthly)}
                    <span className="text-sm font-normal text-muted-foreground"> / month</span>
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  Your agency manages billing on the {plan.name} plan
                  {plan.priceAudMonthly > 0
                    ? ` (from ${money(plan.priceAudMonthly)}/mo).`
                    : "."}{" "}
                  This portal is read-only for billing.
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {supportMailto ? (
                    <>
                      Questions about billing?{" "}
                      <a
                        href={`mailto:${supportMailto}`}
                        className="font-medium text-primary underline"
                      >
                        Email {supportMailto}
                      </a>
                      .
                    </>
                  ) : approvalContact ? (
                    <>Questions about billing? Contact {approvalContact}.</>
                  ) : (
                    <>Questions about billing? Contact your agency.</>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Ad budget</p>
                {budget ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold">
                      {money(budget.monthlyBudgetUsd)}
                      <span className="text-base font-normal text-muted-foreground"> / month</span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your agreed monthly advertising budget. Platforms bill your ad accounts
                      directly — we don&apos;t hold ad credit here.
                    </p>
                    {allocationEntries.length > 0 ? (
                      <ul className="mt-4 space-y-1 text-sm">
                        {allocationEntries.map(([platform, frac]) => (
                          <li key={platform} className="flex justify-between gap-4">
                            <span>{platformLabel(platform)}</span>
                            <span className="text-muted-foreground">
                              {Math.round((frac as number) * 100)}% ·{" "}
                              {money(budget.monthlyBudgetUsd * (frac as number))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Platform split will appear once your agency sets an allocation.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-2xl font-semibold">Not set</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      No monthly ad budget yet. Ask your agency when you&apos;re ready to run paid
                      campaigns.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {!hasStripeSub ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Ask your agency if a payment failed — we don&apos;t show failed-payment details here
                when billing is agency-managed.
              </CardContent>
            </Card>
          ) : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Spending limits</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              {budget ? (
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly ad budget</p>
                    <p className="mt-1">
                      <Badge tone="primary">{money(budget.monthlyBudgetUsd)}</Badge>
                    </p>
                  </div>
                  {dailyGuide != null ? (
                    <div>
                      <p className="text-sm text-muted-foreground">Daily guide (budget ÷ 30)</p>
                      <p className="mt-1">
                        <Badge tone="info">{money(dailyGuide)} / day</Badge>
                      </p>
                    </div>
                  ) : null}
                  {activeCampaigns.length > 0 ? (
                    <div>
                      <p className="text-sm text-muted-foreground">Active campaign daily total</p>
                      <p className="mt-1">
                        <Badge tone="neutral">{money(campaignDailyTotal)} / day</Badge>
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No monthly budget set.</p>
              )}

              {activeCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active ad campaigns with daily limits right now.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Campaign daily budgets</p>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {activeCampaigns.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-muted-foreground">{platformLabel(c.platform)}</p>
                        </div>
                        <Badge tone="info">{money(c.dailyBudgetUsd)} / day</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Daily campaign limits are set with your agency. Changes need approval before they go
                live.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Tax invoices</h2>
          <Card>
            <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
              <p>
                Subscription invoices come from your agency. Ask them for copies — they aren&apos;t
                listed here. Ad charges appear on your Google Ads / Meta statements.
              </p>
              <p>
                {supportMailto ? (
                  <>
                    Need a copy?{" "}
                    <a
                      href={`mailto:${supportMailto}`}
                      className="font-medium text-primary underline"
                    >
                      Email {supportMailto}
                    </a>
                    .
                  </>
                ) : approvalContact ? (
                  <>Need a copy? Contact {approvalContact}.</>
                ) : (
                  <>Need a copy? Contact your agency.</>
                )}
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="rounded-md border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Confirmed</Badge>
                  <span className="text-sm font-medium">Subscription</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your {plan.name} subscription is billed via your agency
                  {plan.priceAudMonthly > 0
                    ? ` (from ${money(plan.priceAudMonthly)}/mo)`
                    : ""}
                  . Exact charge dates come from them.
                </p>
              </div>
              <div className="rounded-md border border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warning">Estimated</Badge>
                  <span className="text-sm font-medium">Ad spend</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {budget
                    ? `Based on your monthly ad budget of ${money(budget.monthlyBudgetUsd)}, platforms may bill roughly that amount over the month. This is an estimate only.`
                    : "No monthly ad budget is set, so there is no estimated ad spend to show."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
