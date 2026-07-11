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

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="We manage your marketing. When something needs your eye, it shows up here."
      >
        {pendingApprovals.length > 0 ? (
          <Link href="/client/approvals" className={buttonClasses()}>
            Review approvals ({pendingApprovals.length})
          </Link>
        ) : (
          <Link href="/client/requests/new" className={buttonClasses("secondary")}>
            Ask us for something
          </Link>
        )}
      </PageHeader>

      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium text-foreground">{statusLine}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You only need to step in for approvals or when you want to ask us something.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/client/approvals">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Needs your approval</p>
                <p className="mt-1 text-3xl font-semibold">{pendingApprovals.length}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/client/reports">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Leads this month</p>
                <p className="mt-1 text-3xl font-semibold">{roi.combined.totalLeads}</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/client/requests">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Open asks</p>
                <p className="mt-1 text-3xl font-semibold">{openRequests.length}</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Ready for your review</h2>
            <Badge tone={pendingApprovals.length ? "warning" : "neutral"}>
              {pendingApprovals.length}
            </Badge>
          </div>
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up — we&apos;ll let you know when something needs a look.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pendingApprovals.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/client/approvals/${c.id}`}
                  className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40"
                >
                  <p className="font-medium">{c.title}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {openRequests.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Things you&apos;ve asked us</h2>
              <Badge tone="primary">{openRequests.length}</Badge>
            </div>
            <div className="space-y-2">
              {openRequests.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={`/client/requests/${r.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4 hover:border-primary/40"
                >
                  <span className="font-medium">{r.topic}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
