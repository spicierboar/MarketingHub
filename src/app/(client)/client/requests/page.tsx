import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleRequests } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";

const URGENCY_TONE = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" } as const;

export default async function ClientRequestsPage() {
  const { user } = await requirePortalUser();
  const requests = await visibleRequests(user);

  return (
    <div>
      <PageHeader
        title="Things you've asked us to handle"
        explainerId="client-requests"
        explainer="Your messages to the agency. Track status here, or ask for something new."
      >
        <Link href="/client/requests/new" className={buttonClasses()}>Ask for something</Link>
      </PageHeader>
      <div className="p-6">
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Nothing yet. <Link href="/client/requests/new" className="text-primary hover:underline">Ask for something</Link>.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Urgency</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/client/requests/${r.id}`} className="font-medium hover:text-primary">{r.topic}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{titleCase(r.requestType)}</td>
                    <td className="px-4 py-3"><Badge tone={URGENCY_TONE[r.urgency]}>{titleCase(r.urgency)}</Badge></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
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
