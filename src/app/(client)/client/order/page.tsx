import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { listRequests } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui/button";
import {
  CLIENT_ORDER_MENU,
  formatMenuPriceFrom,
  isMenuOrderRequest,
} from "@/lib/client-order-menu";
import { formatDate } from "@/lib/utils";

/**
 * Client à la carte Order menu — separate portal page (not Ask us).
 * Special jobs outside the subscription; agency + AI fulfil via Client asks.
 */
export default async function ClientOrderMenuPage() {
  const { user, companyId } = await requirePortalUser();
  const recent = (await listRequests(user.tenantId))
    .filter((r) => r.companyId === companyId && isMenuOrderRequest(r.notes, r.offer))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Order menu"
        explainer="Special jobs outside your subscription — pick a dish, we’ll deliver."
      />

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
        <ul className="divide-y divide-border border-y border-border">
          {CLIENT_ORDER_MENU.map((sku) => (
            <li
              key={sku.id}
              className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-foreground">{sku.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{sku.blurb}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatMenuPriceFrom(sku.priceFromAud)}
                </p>
                <Link
                  href={`/client/order/${sku.id}`}
                  className={buttonClasses("default", "sm")}
                >
                  Order
                </Link>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Included package posts stay on your schedule. These are à la carte specials —
          charged separately from your subscription (payment checkout coming soon; your
          order reaches the agency as a special job today).
        </p>

        {recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Recent menu orders</h2>
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

        <p className="text-xs text-muted-foreground">
          Need something not on the menu?{" "}
          <Link href="/client/requests/new" className="text-primary hover:underline">
            Ask us
          </Link>{" "}
          in plain language.
        </p>
      </div>
    </div>
  );
}
