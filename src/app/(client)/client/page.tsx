import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { listManagedDeliveryRuns } from "@/lib/db";
import { visibleContent, visibleRequests } from "@/lib/scope";
import { buildClientRoiReport } from "@/lib/client-reports";
import { clientStatusMessage } from "@/lib/managed-service/status-copy";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function ClientDashboardPage() {
  const { user, companyId } = await requirePortalUser();
  const [requests, content, roi, deliveryRuns] = await Promise.all([
    visibleRequests(user),
    visibleContent(user),
    buildClientRoiReport(user.tenantId, companyId),
    listManagedDeliveryRuns(user.tenantId, companyId),
  ]);
  const openRequests = requests.filter((r) => !["completed", "cancelled", "published"].includes(r.status));
  const pendingApprovals = content.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );
  const latestDelivery = deliveryRuns[0];
  const statusLine = latestDelivery
    ? clientStatusMessage(latestDelivery.statusMessageKey)
    : "Your marketing service is active";

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="We manage your marketing. Review approvals and track progress here."
      >
        <Link href="/client/requests/new" className={buttonClasses()}>New request</Link>
      </PageHeader>
      <div className="px-6 pt-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm font-medium">{statusLine}</p>
            {latestDelivery && (
              <Badge
                tone={
                  latestDelivery.phase === "awaiting_approval" || latestDelivery.phase === "active"
                    ? "success"
                    : latestDelivery.phase === "blocked" || latestDelivery.phase === "failed"
                      ? "warning"
                      : "neutral"
                }
              >
                {latestDelivery.phase.replace(/_/g, " ")}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        {[
          { label: "Open requests", value: openRequests.length, href: "/client/requests" },
          { label: "Awaiting your approval", value: pendingApprovals.length, href: "/client/approvals" },
          { label: "Leads (30 days)", value: roi.combined.totalLeads, href: "/client/reports" },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-3xl font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 px-6 pb-2 sm:grid-cols-2">
        <Link href="/client/calendar">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="p-5">
              <p className="font-medium">Calendar</p>
              <p className="mt-1 text-sm text-muted-foreground">Your social media schedule</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/client/payments">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="p-5">
              <p className="font-medium">Payments</p>
              <p className="mt-1 text-sm text-muted-foreground">Subscription and ad spending limits</p>
            </CardContent>
          </Card>
        </Link>
      </div>
      <div className="grid gap-6 px-6 pb-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Pending approvals</h2>
            <Badge tone={pendingApprovals.length ? "warning" : "neutral"}>{pendingApprovals.length}</Badge>
          </div>
          {pendingApprovals.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nothing awaiting sign-off.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((c) => (
                <Link key={c.id} href={`/client/approvals/${c.id}`} className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40">
                  <p className="font-medium">{c.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Open requests</h2>
            <Badge tone={openRequests.length ? "primary" : "neutral"}>{openRequests.length}</Badge>
          </div>
          {openRequests.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No open requests.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {openRequests.slice(0, 5).map((r) => (
                <Link key={r.id} href={`/client/requests/${r.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary/40">
                  <span className="font-medium">{r.topic}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
