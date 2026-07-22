import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { listRequests } from "@/lib/db";
import { visibleRequests } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  CLIENT_ORDER_MENU,
  formatMenuPriceFrom,
  isMenuOrderRequest,
} from "@/lib/client-order-menu";
import { formatDate, titleCase } from "@/lib/utils";

const URGENCY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
} as const;

/**
 * One client surface for contacting the agency:
 * à la carte menu (priced specials) + free-form message + request history.
 */
export default async function ClientAskUsPage() {
  const { user, companyId } = await requirePortalUser();
  const [allVisible, tenantRequests] = await Promise.all([
    visibleRequests(user),
    listRequests(user.tenantId),
  ]);
  const requests = allVisible.filter((r) => r.companyId === companyId);
  const recentMenu = tenantRequests
    .filter((r) => r.companyId === companyId && isMenuOrderRequest(r.notes, r.offer))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Ask us"
        explainer="Order a special from the menu, or send a free-form message. Package posts stay on your schedule."
      >
        <Link href="/client/requests/new" className={buttonClasses("outline", "sm")}>
          New message
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:px-6">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Menu (à la carte)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Priced specials outside your subscription. Checkout coming soon — orders go
              to the agency as special jobs today.
            </p>
          </div>
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
        </section>

        <section className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4">
          <p className="text-sm font-medium text-foreground">Something else?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Timing changes, corrections, or ideas that aren’t on the menu — plain language
            is fine.
          </p>
          <Link href="/client/requests/new" className={buttonClasses("outline", "sm") + " mt-3"}>
            Send a message
          </Link>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Your requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Order from the menu or send a message.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Topic</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => {
                    const menu = isMenuOrderRequest(r.notes, r.offer);
                    return (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <Link
                            href={`/client/requests/${r.id}`}
                            className="font-medium hover:text-primary"
                          >
                            {r.topic}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{titleCase(r.requestType)}</span>
                            {menu && <Badge tone="warning">Menu</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(r.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {recentMenu.length > 0 && requests.length === 0 && (
            <ul className="space-y-2 text-sm">
              {recentMenu.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/client/requests/${r.id}`}
                    className="text-primary hover:underline"
                  >
                    {r.topic}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
