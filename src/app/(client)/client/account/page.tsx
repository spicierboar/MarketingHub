import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant, listAssetsForCompany, listTaxInvoices } from "@/lib/db";
import { visibleRequests } from "@/lib/scope";
import {
  MIN_CREDIT_FLOOR_USD,
  getOrCreateCreditWallet,
} from "@/lib/credit-wallet";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { listClientPackageOptions } from "@/lib/client-package-change";
import { ClientPackageChangePanel } from "@/components/client-package-change-panel";
import { currentPackageId } from "@/lib/managed-service-billing";
import { storageConfigured } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
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
  const packageOptions = listClientPackageOptions(tenant);
  const packageChangePendingBilling = Boolean(
    company?.profile.managedService?.packageChangePendingBilling,
  );
  const activePackageId = currentPackageId(
    company?.profile.managedService?.serviceBilling?.activePackageId ??
      company?.profile.managedService?.marketingPackageId ??
      marketingPkg?.id ??
      "starter",
  );
  const openAsks = requests.filter(
    (r) => !["completed", "cancelled", "published"].includes(r.status),
  ).length;
  const balanceOk = wallet.balanceUsd >= MIN_CREDIT_FLOOR_USD;
  const canStore = storageConfigured();
  const hours = company?.profile.tradingHours?.trim();
  const contact = company?.profile.approvalContact?.trim();
  const phone = company?.profile.phone?.trim();
  const address = company?.profile.businessAddress?.trim();
  const website = company?.profile.website?.trim();

  return (
    <div>
      <PageHeader
        title="Overview"
        explainerId="client-account"
        explainer="Your package, credit, and quick actions. Order extras from Extras — messaging stays under Ask us."
      />

      <div className="space-y-5 p-4 sm:p-5">
        {marketingPkg ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Marketing package</h2>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{marketingPkg.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A${marketingPkg.priceAudMonthly}/mo excl GST · {marketingPkg.imageQuotaPerMonth}{" "}
                    campaign images + {marketingPkg.videoQuotaPerMonth} short videos / mo included
                  </p>
                  {packageChangePendingBilling ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Your package payment is still being confirmed. Strategy prep can continue;
                      nothing publishes without approval.
                    </p>
                  ) : null}
                </div>
                <ClientPackageChangePanel
                  companyId={companyId}
                  currentPackageId={activePackageId}
                  currentPackageName={marketingPkg.name}
                  currentPriceAud={marketingPkg.priceAudMonthly}
                  options={packageOptions}
                  creditBalanceUsd={wallet.balanceUsd}
                  packageChangePendingBilling={packageChangePendingBilling}
                  periodEndIso={
                    company?.profile.managedService?.serviceBilling?.currentPeriodEnd
                  }
                />
              </CardContent>
            </Card>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Need extra work?</h2>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Promos, content add-ons, and custom paid orders live on one page.
              </p>
              <Link href="/client/order" className={buttonClasses("default", "sm")}>
                Open Extras
              </Link>
            </CardContent>
          </Card>
        </section>

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
                    placeholder="e.g. Storefront or product photo"
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

        {(contact || hours || phone || address || website) ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Business info</h2>
            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                {address ? (
                  <p>
                    <span className="text-muted-foreground">Address · </span>
                    {address}
                  </p>
                ) : null}
                {phone ? (
                  <p>
                    <span className="text-muted-foreground">Phone · </span>
                    {phone}
                  </p>
                ) : null}
                {website ? (
                  <p>
                    <span className="text-muted-foreground">Website · </span>
                    {website}
                  </p>
                ) : null}
                {hours ? (
                  <p>
                    <span className="text-muted-foreground">Hours · </span>
                    {hours}
                  </p>
                ) : null}
                {contact ? (
                  <p>
                    <span className="text-muted-foreground">Approvals contact · </span>
                    {contact}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  <Link href="/client/profile" className="text-primary hover:underline">
                    Edit business info
                  </Link>
                  {" · "}
                  <Link href="/client/requests/new" className="text-primary hover:underline">
                    Ask us
                  </Link>
                </p>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Business info</h2>
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                No address, phone, or hours on file yet.{" "}
                <Link href="/client/profile" className="text-primary hover:underline">
                  Add business info
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
                Nothing goes live without the usual checks. The automated content service never
                publishes or spends on its own.
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
