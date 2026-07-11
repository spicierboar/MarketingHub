import { requirePortalUser } from "@/lib/auth/rbac";
import { getAdBudget, getTenant, listAdCampaigns } from "@/lib/db";
import { planFor } from "@/lib/plans";
import { AD_PLATFORMS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";

const money = (x: number) =>
  `$${Math.round(x).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

const platformLabel = (key: string) =>
  AD_PLATFORMS.find((p) => p.key === key)?.label ?? key;

export default async function ClientPaymentsPage() {
  const { user, companyId } = await requirePortalUser();
  const [tenant, budget, campaigns] = await Promise.all([
    getTenant(user.tenantId),
    getAdBudget(companyId),
    listAdCampaigns(user.tenantId, companyId),
  ]);

  const plan = planFor(tenant?.plan);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const allocationEntries = budget
    ? Object.entries(budget.allocation).filter(([, frac]) => typeof frac === "number" && frac > 0)
    : [];

  return (
    <div>
      <PageHeader
        title="Payments & spending"
        description="Your subscription and advertising budget at a glance. Ad spend is billed by the platforms you advertise on — not as prepaid credit here."
      />

      <div className="space-y-8 p-6">
        <nav className="flex flex-wrap gap-3 text-sm">
          {[
            { href: "#overview", label: "Overview" },
            { href: "#spending-limits", label: "Spending limits" },
            { href: "#tax-invoices", label: "Tax invoices" },
            { href: "#upcoming", label: "Upcoming" },
          ].map((a) => (
            <a key={a.href} href={a.href} className={buttonClasses("outline", "sm")}>
              {a.label}
            </a>
          ))}
        </nav>

        <section id="overview" className="scroll-mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Subscription</p>
                <p className="mt-1 text-2xl font-semibold">{plan.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Managed by your agency on the {plan.name} plan
                  {plan.priceAudMonthly > 0
                    ? ` (from $${plan.priceAudMonthly}/mo agency pricing).`
                    : "."}
                </p>
                <p className="mt-4 text-sm">
                  <span className={buttonClasses("outline", "sm")}>
                    Manage billing with your agency
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Plan changes and invoices are handled by your agency — this portal is read-only for billing.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Advertising spend</p>
                {budget ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold">
                      {money(budget.monthlyBudgetUsd)}
                      <span className="text-base font-normal text-muted-foreground"> / month</span>
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This is your agreed monthly ad budget. Platforms (Google, Meta, etc.) bill your
                      connected ad accounts directly — we never hold advertising credit in a wallet.
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
                      No monthly ad budget is configured yet. Ask your agency when you&apos;re ready
                      to run paid campaigns.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="spending-limits" className="scroll-mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Spending limits</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              {budget ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Monthly ad budget</span>
                  <Badge tone="primary">{money(budget.monthlyBudgetUsd)}</Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No monthly budget set.</p>
              )}

              {activeCampaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active ad campaigns with daily limits right now.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {activeCampaigns.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-muted-foreground">{platformLabel(c.platform)}</p>
                      </div>
                      <Badge tone="info">
                        {money(c.dailyBudgetUsd)} / day
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Daily campaign limits are set with your agency. Changes require approval before they go live.
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="tax-invoices" className="scroll-mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Tax invoices</h2>
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              <p>
                Subscription invoices are issued by your agency through Stripe. For copies of tax
                invoices or payment history, contact your agency account manager — they are not
                listed in this portal.
              </p>
              <p className="mt-3">
                Advertising charges appear on your Google Ads / Meta billing statements for the
                accounts connected to your business.
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="upcoming" className="scroll-mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Your agency will notify you of upcoming subscription charges. Estimated advertising
              spend is shown above when a budget is set.
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
