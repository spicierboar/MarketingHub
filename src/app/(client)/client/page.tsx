import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, listGaps, listManagedDeliveryRuns } from "@/lib/db";
import { visibleContent, visibleRequests } from "@/lib/scope";
import { buildClientRoiReport } from "@/lib/client-reports";
import { clientStatusMessage } from "@/lib/managed-service/status-copy";
import {
  MIN_CREDIT_FLOOR_USD,
  getOrCreateCreditWallet,
} from "@/lib/credit-wallet";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function ClientDashboardPage() {
  const { user, companyId } = await requirePortalUser();
  const [requests, content, roi, deliveryRuns, company, openGaps, wallet] =
    await Promise.all([
      visibleRequests(user),
      visibleContent(user),
      buildClientRoiReport(user.tenantId, companyId),
      listManagedDeliveryRuns(user.tenantId, companyId),
      getCompany(companyId),
      listGaps({ companyId, openOnly: true }),
      getOrCreateCreditWallet(companyId),
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

  const creditLow = wallet.balanceUsd < MIN_CREDIT_FLOOR_USD;
  const needsCount =
    pendingApprovals.length + openGaps.length + (creditLow ? 1 : 0);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        explainerId="client-home"
        explainer="We handle delivery. You only step in when something needs your approval, an answer, or a top-up."
      >
        {pendingApprovals.length > 0 ? (
          <Link href="/client/approvals" className={buttonClasses("default", "sm")}>
            Review ({pendingApprovals.length})
          </Link>
        ) : creditLow ? (
          <Link href="/client/payments" className={buttonClasses("default", "sm")}>
            Top up credit
          </Link>
        ) : null}
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-md border border-border bg-card px-3 py-2.5">
          <p className="text-sm font-medium">{statusLine}</p>
          <p className="text-xs text-muted-foreground">
            {needsCount === 0
              ? "Nothing waiting on you right now."
              : `${needsCount} item${needsCount === 1 ? "" : "s"} need${needsCount === 1 ? "s" : ""} your attention.`}
            {company ? ` · ${company.name}` : null}
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
          <Link href="/client/account">
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

        {creditLow && (
          <section>
            <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-medium">Credit below minimum</p>
              <p className="text-xs opacity-90">
                Balance {formatMoney(wallet.balanceUsd, { fractionDigits: 2 })} — paid ads stay
                paused until you top up to at least{" "}
                {formatMoney(MIN_CREDIT_FLOOR_USD, { fractionDigits: 2 })}.
              </p>
              <Link
                href="/client/payments"
                className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
              >
                Top up →
              </Link>
            </div>
          </section>
        )}

        {openGaps.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Questions for you</h2>
              <Badge tone="warning">{openGaps.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {openGaps.slice(0, 5).map((g) => (
                <Link
                  key={g.id}
                  href={g.requestId ? `/client/requests/${g.requestId}` : "/client/requests"}
                  className="block rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:border-primary/40"
                >
                  <p className="font-medium">{g.question}</p>
                  {g.blocking ? (
                    <p className="mt-0.5 text-[11px] text-amber-700">Required answer</p>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        )}

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
