import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleRequests } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { isMenuOrderRequest } from "@/lib/client-order-menu";
import { formatDate, titleCase } from "@/lib/utils";

const URGENCY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
} as const;

/**
 * Ask us — free-form messages only.
 * À la carte specials live on /client/order.
 */
export default async function ClientRequestsPage() {
  const { user, companyId } = await requirePortalUser();
  const requests = (await visibleRequests(user)).filter(
    (r) => r.companyId === companyId && !isMenuOrderRequest(r.notes, r.offer),
  );

  return (
    <div>
      <PageHeader
        title="Ask us"
        explainerId="client-requests"
        explainer="Send the agency a message in plain language — timing, corrections, ideas."
      >
        <Link href="/client/requests/new" className={buttonClasses()}>
          New message
        </Link>
      </PageHeader>
      <div className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          Looking for a priced special outside your subscription?{" "}
          <Link href="/client/order" className="text-primary hover:underline">
            Open Extras
          </Link>
          .
        </p>
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No messages yet.{" "}
            <Link href="/client/requests/new" className="text-primary hover:underline">
              Send a message
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Urgency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/client/requests/${r.id}`}
                        className="font-medium hover:text-primary"
                      >
                        {r.topic}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={URGENCY_TONE[r.urgency]}>
                        {titleCase(r.urgency)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
