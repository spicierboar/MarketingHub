import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleContent, visibleRequests } from "@/lib/scope";
import { buildClientRoiReport } from "@/lib/client-reports";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function ClientDashboardPage() {
  const { user, companyId } = await requirePortalUser();
  const [requests, content, roi] = await Promise.all([
    visibleRequests(user),
    visibleContent(user),
    buildClientRoiReport(user.tenantId, companyId),
  ]);
  const openRequests = requests.filter((r) => !["completed", "cancelled", "published"].includes(r.status));
  const pendingApprovals = content.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );

  return (
    <div>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Track requests and approve content.">
        <Link href="/client/requests/new" className={buttonClasses()}>New request</Link>
      </PageHeader>
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
