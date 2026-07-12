import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant, listAssetsForCompany, listTaxInvoices } from "@/lib/db";
import { visibleRequests } from "@/lib/scope";
import {
  MIN_CREDIT_FLOOR_USD,
  getOrCreateCreditWallet,
} from "@/lib/credit-wallet";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import {
  promoAllowanceSummary,
  resolveCustomWorkFeeAud,
  resolvePromoBillingClass,
} from "@/lib/promo-allowance";
import { computePromoPricing, templatesForCompany } from "@/lib/promo-catalog";
import { storageConfigured } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import {
  ClientExtraWorkPanel,
  type ExtraWorkPromoCard,
} from "@/components/client-extra-work-panel";
import { ActivityHubsGrid } from "@/components/activity-hubs-grid";
import { clientPortalActivityHubs } from "@/lib/client-activity-hubs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createClientAssetAction } from "../assets/actions";
import { formatMoney } from "@/lib/utils";

const money2 = (x: number) => formatMoney(x, { fractionDigits: 2 });

export default async function ClientAccountPage() {
  const { user, companyId } = await requirePortalUser();
  const [company, tenant, wallet, invoices, requests, assets] = await Promise.all([
    getCompany(companyId),
    getTenant(user.tenantId),
    getOrCreateCreditWallet(companyId),
    listTaxInvoices(user.tenantId, { companyId }),
    visibleRequests(user),
    listAssetsForCompany(companyId),
  ]);

  const marketingPkg = company ? resolveCompanyPackage(company, tenant) : null;
  const openAsks = requests.filter(
    (r) => !["completed", "cancelled", "published"].includes(r.status),
  ).length;
  const balanceOk = wallet.balanceUsd >= MIN_CREDIT_FLOOR_USD;
  const canStore = storageConfigured();
  const hours = company?.profile.tradingHours?.trim();
  const contact = company?.profile.approvalContact?.trim();

  const allowance = company
    ? promoAllowanceSummary(company, tenant)
    : { periodKey: "", used: 0, limit: 0, remaining: 0, promosIncludedPerMonth: 0 };
  const billingClass = company
    ? resolvePromoBillingClass(company, tenant)
    : "extra";
  const templates = company
    ? templatesForCompany(company, tenant?.promoCatalog, tenant?.promoIndustries)
    : [];
  const promoCards: ExtraWorkPromoCard[] = templates.map((template) => {
    const pricing = computePromoPricing(
      template.suggestedClientPriceUsd,
      template.markupPercent,
    );
    return {
      template,
      billingClass,
      expectedFeeUsd: billingClass === "included" ? 0 : pricing.totalUsd,
      totalUsd: pricing.totalUsd,
      feeUsd: pricing.feeUsd,
    };
  });
  const customWorkFeeAud = company
    ? resolveCustomWorkFeeAud(company, tenant)
    : null;

  return (
    <div>
      <PageHeader
        title="Account"
        explainerId="client-account"
        explainer="Billing, strategy, content status, messages to us, and optional file drops — everything for your account in one place."
      />
      <ClientAccountLinks />

      <div className="space-y-5 p-4 sm:p-5">
        <ActivityHubsGrid
          hubs={clientPortalActivityHubs()}
          title="Your account"
          subtitle="Strategy, content, schedule, asks, and billing for your business — the same client account your agency works in."
        />

        {marketingPkg ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Marketing package</h2>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{marketingPkg.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A${marketingPkg.priceAudMonthly}/mo · {marketingPkg.imageQuotaPerMonth}{" "}
                    AI images + {marketingPkg.videoQuotaPerMonth} short videos / mo included ·
                    package changes are agency-managed
                  </p>
                </div>
                <Link href="/client/requests/new" className={buttonClasses("outline", "sm")}>
                  Ask us to change
                </Link>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {company ? (
          <ClientExtraWorkPanel
            promos={promoCards}
            allowance={allowance}
            customWorkFeeAud={customWorkFeeAud}
          />
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold">Billing &amp; credit</h2>
            <Link href="/client/payments" className="text-xs text-primary hover:underline">
              Full billing →
            </Link>
          </div>
          <Card>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Available balance</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {money2(wallet.balanceUsd)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Minimum {money2(MIN_CREDIT_FLOOR_USD)} · {invoices.length} invoice
                  {invoices.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={balanceOk ? "success" : "danger"}>
                  {balanceOk ? "OK" : "Below minimum"}
                </Badge>
                <Link href="/client/payments" className={buttonClasses("default", "sm")}>
                  Top up
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold">Ask us</h2>
            {openAsks > 0 ? (
              <Badge tone="primary">{openAsks} open</Badge>
            ) : null}
          </div>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Send a plain-language message — we already have your business context.
              </p>
              <Link href="/client/requests/new" className={buttonClasses("default", "sm")}>
                New message
              </Link>
            </CardContent>
          </Card>
          {openAsks > 0 ? (
            <Link href="/client/requests" className="text-xs text-primary hover:underline">
              View your asks →
            </Link>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Share a photo</h2>
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-xs text-muted-foreground">
                Drop a logo or photo for us to review before we use it.
                {assets.length > 0
                  ? ` You have ${assets.length} file${assets.length === 1 ? "" : "s"} on file.`
                  : null}
              </p>
              {!canStore ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  File storage isn&apos;t set up yet — you can still register a name for us.
                </p>
              ) : null}
              <form action={createClientAssetAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="assetType" value="image" />
                <Field label="Name" htmlFor="acct-name">
                  <Input
                    id="acct-name"
                    name="name"
                    required
                    placeholder="e.g. Shopfront photo"
                  />
                </Field>
                <Field
                  label="File"
                  htmlFor="acct-file"
                  hint={canStore ? undefined : "Unavailable until storage is configured"}
                >
                  <Input
                    id="acct-file"
                    name="file"
                    type="file"
                    disabled={!canStore}
                    accept="image/*,video/*,.pdf"
                  />
                </Field>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="consentObtained"
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span>
                    If people appear in this file, I confirm we have consent to use it in marketing.
                  </span>
                </label>
                <Button type="submit" size="sm">
                  Submit for review
                </Button>
              </form>
              <Link href="/client/assets" className="block text-xs text-primary hover:underline">
                View all files →
              </Link>
            </CardContent>
          </Card>
        </section>

        {(contact || hours) ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Contact &amp; hours</h2>
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                {contact ? (
                  <p>
                    <span className="text-muted-foreground">Approval contact · </span>
                    {contact}
                  </p>
                ) : null}
                {hours ? (
                  <p>
                    <span className="text-muted-foreground">Hours · </span>
                    {hours}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Need a correction?{" "}
                  <Link href="/client/requests/new" className="text-primary hover:underline">
                    Ask us
                  </Link>
                  {" · "}
                  <Link href="/client/profile" className="text-primary hover:underline">
                    Edit contact details
                  </Link>
                </p>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Contact &amp; hours</h2>
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No contact details on file yet.{" "}
                <Link href="/client/profile" className="text-primary hover:underline">
                  Add contact &amp; hours
                </Link>
                {" · "}
                <Link href="/client/requests/new" className="text-primary hover:underline">
                  Ask us
                </Link>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">How it works</h2>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
              <p>
                We prepare your marketing on your behalf. When something needs your say-so, it
                appears under Approvals.
              </p>
              <p>
                Nothing goes live without the usual checks. AI never publishes or spends on its own.
              </p>
              <Link href="/client/help" className="inline-block text-xs text-primary hover:underline">
                More help →
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
