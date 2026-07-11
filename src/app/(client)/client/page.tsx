import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant, listManagedDeliveryRuns } from "@/lib/db";
import { visibleContent, visibleRequests } from "@/lib/scope";
import { buildClientRoiReport } from "@/lib/client-reports";
import { clientStatusMessage } from "@/lib/managed-service/status-copy";
import { templatesForCompany } from "@/lib/promo-catalog";
import {
  listOpenPromoSelections,
  selectionsNotOnCalendar,
} from "@/lib/promo-requests";
import { PageHeader } from "@/components/page-header";
import { ClientPromoPicker } from "@/components/client-promo-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export default async function ClientDashboardPage() {
  const { user, companyId } = await requirePortalUser();
  const [requests, content, roi, deliveryRuns, company] = await Promise.all([
    visibleRequests(user),
    visibleContent(user),
    buildClientRoiReport(user.tenantId, companyId),
    listManagedDeliveryRuns(user.tenantId, companyId),
    getCompany(companyId),
  ]);
  const openRequests = requests.filter(
    (r) => !["completed", "cancelled", "published"].includes(r.status),
  );
  const pendingApprovals = content.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );
  const latestDelivery = deliveryRuns[0];
  const statusLine = latestDelivery
    ? clientStatusMessage(latestDelivery.statusMessageKey)
    : "Your marketing service is active";

  const templates = company
    ? templatesForCompany(
        company,
        (await getTenant(company.tenantId))?.promoCatalog,
      )
    : [];
  const openPromos = company ? listOpenPromoSelections(company) : [];
  const notOnCalendar = company ? selectionsNotOnCalendar(company) : [];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        explainerId="client-home"
        explainer="We handle delivery. You only step in for approvals, asks, or ready-made promo picks — start here for status and what’s waiting on you."
      >
        {pendingApprovals.length > 0 ? (
          <Link href="/client/approvals" className={buttonClasses("default", "sm")}>
            Review ({pendingApprovals.length})
          </Link>
        ) : (
          <Link href="/client/promos" className={buttonClasses("secondary", "sm")}>
            Promotions
          </Link>
        )}
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-md border border-border bg-card px-3 py-2.5">
          <p className="text-sm font-medium">{statusLine}</p>
          <p className="text-xs text-muted-foreground">
            Approvals and asks appear here when we need you. Ready-made promos are separate from
            your ongoing strategy.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Link href="/client/approvals">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Approvals</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {pendingApprovals.length}
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/client/reports">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Leads</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {roi.combined.totalLeads}
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/client/requests">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-3 sm:p-4">
                <p className="text-[11px] text-muted-foreground sm:text-xs">Open asks</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {openRequests.length}
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Ready-made promotions</h2>
              <p className="text-xs text-muted-foreground">
                Industry packages — you set price, start date, and channels. Posts are
                pre-written.
              </p>
            </div>
            <Link href="/client/promos" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>

          {notOnCalendar.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
              <p className="font-medium">
                {notOnCalendar.length} promo{notOnCalendar.length === 1 ? "" : "s"} not on your
                calendar yet
              </p>
              <p className="text-xs opacity-90">
                We&apos;ve received your request — it appears on the calendar once we place it into
                delivery.
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {notOnCalendar.slice(0, 3).map((s) => (
                  <li key={s.id}>
                    {s.templateName} · {formatDate(s.startDate)} · {money(s.totalUsd)} incl. fee
                  </li>
                ))}
              </ul>
            </div>
          )}

          {openPromos.filter((s) => s.status !== "requested").length > 0 && (
            <ul className="space-y-1.5">
              {openPromos
                .filter((s) => s.status !== "requested")
                .slice(0, 3)
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium">{s.templateName}</span>
                    <Badge tone="success">{s.status.replace(/_/g, " ")}</Badge>
                  </li>
                ))}
            </ul>
          )}

          <Card>
            <CardContent className="p-4">
              <ClientPromoPicker templates={templates.slice(0, 4)} />
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ready for your review</h2>
            <Badge tone={pendingApprovals.length ? "warning" : "neutral"}>
              {pendingApprovals.length}
            </Badge>
          </div>
          {pendingApprovals.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              All caught up — nothing needs approval right now.
            </p>
          ) : (
            <div className="space-y-1.5">
              {pendingApprovals.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/client/approvals/${c.id}`}
                  className="block rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:border-primary/40"
                >
                  <p className="font-medium">{c.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {openRequests.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your asks</h2>
              <Badge tone="primary">{openRequests.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {openRequests.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={`/client/requests/${r.id}`}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:border-primary/40"
                >
                  <span className="font-medium">{r.topic}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
