import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant, listRequests } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  ClientExtraWorkPanel,
  type ExtraWorkPromoCard,
} from "@/components/client-extra-work-panel";
import { ClientOrderCataloguePicker } from "@/components/client-order-catalogue-picker";
import { isMenuOrderRequest } from "@/lib/client-order-menu";
import {
  promoAllowanceSummary,
  resolveCustomWorkFeeAud,
  resolvePromoBillingClass,
} from "@/lib/promo-allowance";
import { computePromoPricing, templatesForCompany } from "@/lib/promo-catalog";
import { formatDate } from "@/lib/utils";

/**
 * Extras — single ordering page: content add-ons, promos, and custom paid orders.
 * Ask us stays free-form messaging only (not for buying work).
 */
export default async function ClientOrderMenuPage() {
  const { user, companyId } = await requirePortalUser();
  const [company, tenant, allRequests] = await Promise.all([
    getCompany(companyId),
    getTenant(user.tenantId),
    listRequests(user.tenantId),
  ]);

  const recent = allRequests
    .filter((r) => r.companyId === companyId && isMenuOrderRequest(r.notes, r.offer))
    .slice(0, 8);

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
        title="Extras"
        explainer="Everything orderable outside your subscription — content add-ons, ready-made campaigns, or a custom order."
      >
        {allowance.limit > 0 ? (
          <Badge tone={allowance.remaining > 0 ? "success" : "warning"}>
            {allowance.remaining > 0
              ? `${allowance.remaining} promo included left`
              : "Promo allowance used"}
          </Badge>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:px-6">
        <section id="add-ons" className="scroll-mt-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Content add-ons</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Browse by category, pick an item, then place your order. One-off work
              outside your package.
            </p>
          </div>
          <ClientOrderCataloguePicker />
        </section>

        {company ? (
          <ClientExtraWorkPanel
            promos={promoCards}
            allowance={allowance}
            customWorkFeeAud={customWorkFeeAud}
          />
        ) : null}

        <p className="text-xs text-muted-foreground">
          Included package posts stay on your schedule. Items here are charged separately
          (unless marked included). Payment checkout is next; orders still reach the agency
          as special jobs today. For a free message that isn&apos;t an order, use{" "}
          <Link href="/client/requests/new" className="text-primary hover:underline">
            Ask us
          </Link>
          .
        </p>

        {recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent add-on orders</h2>
            <ul className="space-y-2 text-sm">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/client/requests/${r.id}`}
                    className="text-primary hover:underline"
                  >
                    {r.topic}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatDate(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
