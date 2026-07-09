import Link from "next/link";
import { requireTenantOwner } from "@/lib/auth/rbac";
import { getTenant, listCompanies } from "@/lib/db";
import { stripeConfigured, tenantUsage } from "@/lib/billing";
import { tenantAddonSummary } from "@/lib/entitlements";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import { ADDONS, ADDON_ORDER } from "@/lib/addons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import type { AddonId } from "@/lib/types";
import {
  changePlanAction,
  deleteTenantAction,
  disableAddonAction,
  enableAddonAction,
  openBillingPortalAction,
} from "./actions";

function Meter({
  value,
  max,
  label,
  display,
}: {
  value: number;
  max: number | null;
  label: string;
  display?: string; // human-readable readout; defaults to `${value} of ${max}`
}) {
  const pct =
    max === null || max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const tone =
    max !== null && pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {display ?? (max === null ? `${value} · unlimited` : `${value} of ${max}`)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${max === null ? 4 : pct}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; addon?: string }>;
}) {
  const user = await requireTenantOwner();
  const [tenant, usage, companies, addonSummary, params] = await Promise.all([
    getTenant(user.tenantId),
    tenantUsage(user.tenantId),
    listCompanies(user.tenantId),
    tenantAddonSummary(user.tenantId),
    searchParams,
  ]);
  const live = stripeConfigured();

  // Which add-ons are active for each company (built once from the tenant roll-up
  // so the matrix is a single query, not N).
  const activeByCompany = new Map<string, Set<AddonId>>();
  for (const e of addonSummary.entitlements) {
    const set = activeByCompany.get(e.companyId) ?? new Set<AddonId>();
    set.add(e.addonId);
    activeByCompany.set(e.companyId, set);
  }

  return (
    <div>
      <PageHeader
        title="Billing & Plan"
        description="Plans are priced per client company. AI usage is platform-billed and metered per workspace — each plan includes a monthly AI allowance."
      >
        <Badge tone="primary">{usage.plan.name} plan</Badge>
      </PageHeader>

      <div className="space-y-6 p-6">
        {params.checkout === "success" && (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            Checkout complete. Your plan updates as soon as Stripe confirms the
            subscription (webhook) — refresh in a moment if it hasn&apos;t yet.
          </p>
        )}
        {params.checkout === "cancelled" && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            Checkout cancelled — your plan is unchanged.
          </p>
        )}
        {params.addon === "success" && (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            Add-on checkout complete. It activates for the company as soon as
            Stripe confirms the subscription (webhook).
          </p>
        )}
        {params.addon === "cancelled" && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            Add-on checkout cancelled — nothing changed.
          </p>
        )}
        {!live && (
          <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-700">
            Demo billing: Stripe is not configured, so plan changes apply
            immediately without payment. Set <code>STRIPE_SECRET_KEY</code> (see
            .env.example) to run real subscriptions.
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Usage this month</h2>
                  <p className="text-sm text-muted-foreground">
                    {tenant?.name} · {usage.plan.name} plan
                  </p>
                </div>
                {live && (
                  <form action={openBillingPortalAction}>
                    <Button type="submit" variant="outline">
                      Manage subscription
                    </Button>
                  </form>
                )}
              </div>
              <Meter
                label="Client companies"
                value={usage.companiesUsed}
                max={usage.companyLimit}
              />
              <Meter
                label="AI usage this month"
                value={Math.round(usage.aiSpendUsd * 100)}
                max={Math.round(usage.aiCapUsd * 100)}
                display={`US$${usage.aiSpendUsd.toFixed(2)} of US$${usage.aiCapUsd} allowance`}
              />
              <p className="text-xs text-muted-foreground">
                The effective AI cap is the lower of your plan allowance
                (US${usage.plan.aiIncludedUsd}) and the cap set in Admin &amp;
                Security (US${usage.adminCapUsd}). In template mode (no API key)
                AI runs cost $0.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">What&apos;s included</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Client companies</span>
                  <span className="font-medium">
                    {usage.companyLimit === null ? "Unlimited" : usage.companyLimit}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Monthly AI allowance</span>
                  <span className="font-medium">US${usage.plan.aiIncludedUsd}</span>
                </li>
                <li className="flex justify-between">
                  <span>Enterprise automation</span>
                  <span className="font-medium">{usage.plan.automations ? "Included" : "—"}</span>
                </li>
                <li className="flex justify-between">
                  <span>White-label &amp; client links</span>
                  <span className="font-medium">{usage.plan.whiteLabel ? "Included" : "—"}</span>
                </li>
                <li className="flex justify-between">
                  <span>Team seats</span>
                  <span className="font-medium">Fair use</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 font-semibold">Change plan</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((id) => {
              const p = PLANS[id];
              const current = id === usage.plan.id;
              return (
                <Card key={id} className={current ? "ring-2 ring-indigo-500" : undefined}>
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="font-semibold">{p.name}</h3>
                      {current && <Badge tone="primary">Current</Badge>}
                    </div>
                    <p className="text-2xl font-bold">
                      A${p.priceAudMonthly}
                      <span className="text-sm font-normal text-muted-foreground">/month</span>
                    </p>
                    <p className="mb-4 mt-2 text-sm text-muted-foreground">{p.blurb}</p>
                    <ul className="mb-5 space-y-1 text-sm text-muted-foreground">
                      <li>
                        {p.companyLimit === null
                          ? "Unlimited client companies"
                          : `Up to ${p.companyLimit} client compan${p.companyLimit === 1 ? "y" : "ies"}`}
                      </li>
                      <li>US${p.aiIncludedUsd}/month AI allowance</li>
                      <li>{p.automations ? "Enterprise automation" : "No automation"}</li>
                      <li>{p.whiteLabel ? "White-label + client links" : "Standard branding"}</li>
                    </ul>
                    <form action={changePlanAction} className="mt-auto">
                      <input type="hidden" name="plan" value={id} />
                      <Button type="submit" className="w-full" disabled={current} variant={current ? "outline" : "default"}>
                        {current ? "Current plan" : live ? "Switch via Stripe Checkout" : "Switch plan"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Downgrading never deletes anything: existing client companies keep
            working — only adding new ones is blocked while you&apos;re over the
            limit.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            By subscribing you agree to our{" "}
            <a href="/terms" className="underline">Terms of Service</a>. Payments are
            processed by Stripe — we don&apos;t store your card details.
          </p>
        </div>

        {/* Module 3: per-company add-ons */}
        <div>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Client add-ons</h2>
            <span className="text-sm text-muted-foreground">
              {addonSummary.activeCount} add-on{addonSummary.activeCount === 1 ? "" : "s"} active
              {addonSummary.estMonthlyAud > 0 && ` · ~A$${addonSummary.estMonthlyAud}/mo on top of your plan`}
            </span>
          </div>
          <p className="mb-3 text-sm text-muted-foreground">
            Add-ons are enabled per client company on top of your base plan.
            {live
              ? " Enabling one opens Stripe Checkout for a separate subscription; we never store card details."
              : " Demo mode: Stripe is not configured, so toggling applies immediately without payment."}
          </p>

          {/* Add-on catalogue legend */}
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ADDON_ORDER.map((id) => {
              const a = ADDONS[id];
              return (
                <div key={id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      <span aria-hidden className="mr-1">{a.icon}</span>
                      {a.name}
                    </span>
                    <span className="text-sm text-muted-foreground">A${a.priceAudMonthly}/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.blurb}</p>
                  {a.segment === "restaurant" && (
                    <Badge tone="neutral" className="mt-2">Restaurants</Badge>
                  )}
                </div>
              );
            })}
          </div>

          {companies.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No client companies yet. Add one, then enable add-ons for it here.
            </p>
          ) : (
            <div className="space-y-3">
              {companies.map((c) => {
                const active = activeByCompany.get(c.id) ?? new Set<AddonId>();
                return (
                  <Card key={c.id}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        {ADDON_ORDER.map((id) => {
                          const a = ADDONS[id];
                          const on = active.has(id);
                          const action = on ? disableAddonAction : enableAddonAction;
                          return (
                            <form key={id} action={action}>
                              <input type="hidden" name="companyId" value={c.id} />
                              <input type="hidden" name="addonId" value={id} />
                              <button
                                type="submit"
                                title={on ? `Disable ${a.name}` : live ? `Enable ${a.name} via Stripe Checkout` : `Enable ${a.name}`}
                                className={
                                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                                  (on
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground")
                                }
                              >
                                <span aria-hidden>{a.icon}</span>
                                <span>{a.name}</span>
                                <span aria-hidden className="opacity-70">{on ? "✓" : "+"}</span>
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Enabling an add-on unlocks its deliverable for that company (video &amp;
            photo creation, restaurant menus, the &ldquo;Order Now&rdquo; button).
            Disabling stops future billing; existing work is kept.
          </p>
        </div>

        {/* Data & privacy — GDPR / Privacy Act */}
        <div>
          <h2 className="mb-3 font-semibold">Data &amp; privacy</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-medium">Export your data</h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  Download everything this workspace holds — companies, content,
                  approvals, audit trail and more — as a single JSON file
                  (portability / data-subject access).
                </p>
                <a
                  href="/api/tenant/export"
                  className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                >
                  Download export
                </a>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-6">
                <h3 className="font-medium text-red-700">Delete this workspace</h3>
                <p className="mb-3 mt-1 text-sm text-muted-foreground">
                  Permanently erases the workspace and ALL its data (right to
                  erasure). This cannot be undone. Shared team members who belong
                  to other workspaces keep their accounts.
                </p>
                <form action={deleteTenantAction} className="space-y-2">
                  <Input
                    name="confirmName"
                    placeholder={`Type "${tenant?.name}" to confirm`}
                    required
                  />
                  <Button type="submit" variant="destructive" className="w-full">
                    Delete workspace permanently
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
