import { requirePortalUser } from "@/lib/auth/rbac";
import {
  getAdBudget,
  getCompany,
  getTenant,
  listAdCampaigns,
  listTaxInvoices,
} from "@/lib/db";
import {
  MIN_CREDIT_FLOOR_USD,
  getOrCreateCreditWallet,
} from "@/lib/credit-wallet";
import { stripeConfigured } from "@/lib/billing";
import { planFor } from "@/lib/plans";
import { AD_PLATFORMS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import Link from "next/link";
import {
  openClientBillingPortalAction,
  saveClientAutoTopUpAction,
  topUpClientCreditAction,
} from "./actions";
import { formatMoney } from "@/lib/utils";

const money = (x: number) => formatMoney(x);
const money2 = (x: number) => formatMoney(x, { fractionDigits: 2 });

const platformLabel = (key: string) =>
  AD_PLATFORMS.find((p) => p.key === key)?.label ?? key;

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default async function ClientPaymentsPage() {
  const { user, companyId } = await requirePortalUser();
  const [tenant, company, budget, campaigns, wallet, invoices] = await Promise.all([
    getTenant(user.tenantId),
    getCompany(companyId),
    getAdBudget(companyId),
    listAdCampaigns(user.tenantId, companyId),
    getOrCreateCreditWallet(companyId),
    listTaxInvoices(user.tenantId, { companyId }),
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
  const liveCard = stripeConfigured();

  const balanceOk = wallet.balanceUsd >= MIN_CREDIT_FLOOR_USD;

  return (
    <div>
      <PageHeader
        title="Billing"
        explainerId="client-billing"
        explainer="Account credit, plan overview, and advertising budget. Top up credit or manage your saved card here."
      />
      <ClientAccountLinks />

      <div className="space-y-5 p-4 sm:p-5">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Account credit</h2>
          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Available balance</p>
                  <p className="mt-1 text-4xl font-semibold tracking-tight">
                    {money2(wallet.balanceUsd)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Minimum required: {money2(MIN_CREDIT_FLOOR_USD)}
                  </p>
                </div>
                <Badge tone={balanceOk ? "success" : "danger"}>
                  {balanceOk ? "OK" : "Below minimum — paid ads paused"}
                </Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Prepaid credit must stay at or above {money2(MIN_CREDIT_FLOOR_USD)} before paid
                campaigns can activate. Ad platforms may still bill connected ad accounts for
                delivery.
              </p>

              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-sm font-medium">
                  {liveCard ? "Add credit (card)" : "Add credit (simulated)"}
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {liveCard
                    ? "You will be redirected to Stripe Checkout to pay by card. Credit is applied after payment, and a tax invoice is issued."
                    : "Demo top-up only — no card is captured here. A tax invoice is still issued for the ledger credit."}
                </p>
                <form action={topUpClientCreditAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <Field
                    label="Amount (AUD)"
                    htmlFor="topUpAmount"
                    hint="Typical top-ups are $50–$500"
                  >
                    <Input
                      id="topUpAmount"
                      name="amountUsd"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={100}
                      placeholder="e.g. 100"
                      className="w-36"
                      required
                    />
                  </Field>
                  <Button type="submit" size="sm">
                    {liveCard ? "Pay & add credit" : "Add credit"}
                  </Button>
                </form>
              </div>

              {liveCard && (
                <div className="rounded-md border border-border p-4">
                  <p className="mb-2 text-sm font-medium">Payment methods</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {wallet.stripePaymentMethodId
                      ? "A card is saved for auto top-up. Manage it in the Stripe portal."
                      : "After your first card top-up, you can manage payment methods here."}
                  </p>
                  <form action={openClientBillingPortalAction}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <Button type="submit" size="sm" variant="outline">
                      Open card portal
                    </Button>
                  </form>
                </div>
              )}

              <div className="rounded-md border border-border p-4">
                <p className="mb-3 text-sm font-medium">Auto top-up</p>
                <form action={saveClientAutoTopUpAction} className="space-y-4">
                  <input type="hidden" name="companyId" value={companyId} />
                  {/* Preserve advanced limits with current values — UI is on/off + amount only */}
                  <input
                    type="hidden"
                    name="topUpTriggerBalanceUsd"
                    value={wallet.topUpTriggerBalanceUsd}
                  />
                  <input
                    type="hidden"
                    name="maxTopUpAmountUsd"
                    value={wallet.maxTopUpAmountUsd}
                  />
                  <input
                    type="hidden"
                    name="maxTopUpPerDay"
                    value={wallet.maxTopUpPerDay}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="autoTopUpEnabled"
                      value="on"
                      defaultChecked={wallet.autoTopUpEnabled}
                      className="h-4 w-4"
                    />
                    Enable auto top-up when balance is low
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {liveCard
                      ? wallet.stripePaymentMethodId
                        ? "When balance hits the trigger, we charge your saved card off-session and credit the wallet."
                        : "Complete a card top-up first so a payment method is saved; until then demo mode simulates the credit."
                      : "Demo mode simulates ledger credit only — no card is charged."}
                  </p>
                  <Field
                    label="Top-up amount (AUD)"
                    htmlFor="topUpAmt"
                    hint="Charged when balance hits the trigger"
                  >
                    <Input
                      id="topUpAmt"
                      name="topUpAmountUsd"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={wallet.topUpAmountUsd}
                      placeholder="100"
                      className="w-36"
                      required
                    />
                  </Field>
                  <Button type="submit" size="sm" variant="outline">
                    Save auto top-up
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Subscription &amp; plan</h2>
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
                  Your agency manages SaaS billing on the {plan.name} plan
                  {plan.priceAudMonthly > 0
                    ? ` (from ${money(plan.priceAudMonthly)}/mo).`
                    : "."}{" "}
                  Plan changes stay agency-managed.
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
                      Your agreed monthly advertising budget. Prepaid credit gates activation;
                      platforms may still bill connected ad accounts for delivery.
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
                when SaaS billing is agency-managed.
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
                live. Balance must stay at or above {money2(MIN_CREDIT_FLOOR_USD)}.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Tax invoices</h2>
          <Card>
            <CardContent className="space-y-3 p-6">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tax invoices yet. Topping up credit issues a GST tax invoice
                  (amounts include 10% GST). Subscription plan invoices may still
                  come from your agency separately.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {invoices.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{inv.invoiceNumber}</p>
                        <p className="text-muted-foreground">
                          {new Date(inv.issuedAt).toLocaleDateString("en-AU")} ·{" "}
                          {inv.kind.replace(/_/g, " ")} · {inv.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>
                          {money2(inv.totalIncGst)} {inv.currency.toUpperCase()}
                        </span>
                        <Link
                          href={`/client/payments/invoices/${inv.id}`}
                          className={buttonClasses("outline", "sm")}
                        >
                          View
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Open an invoice and use your browser print dialog to save a PDF.
                {supportMailto ? (
                  <>
                    {" "}
                    Questions?{" "}
                    <a
                      href={`mailto:${supportMailto}`}
                      className="font-medium text-primary underline"
                    >
                      Email {supportMailto}
                    </a>
                    .
                  </>
                ) : null}
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
                    ? `Based on your monthly ad budget of ${money(budget.monthlyBudgetUsd)}, platforms may bill roughly that amount over the month. Prepaid credit is separate and must stay at or above ${money2(MIN_CREDIT_FLOOR_USD)}. This is an estimate only.`
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
