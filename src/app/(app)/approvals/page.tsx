import Link from "next/link";
import { requirePermission } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { canApproveRoute, ROUTE_LABEL } from "@/lib/routing";
import { buildApprovalAssist } from "@/lib/ai/approval-assist";
import { PageHeader } from "@/components/page-header";
import { ApprovalAssistNotes } from "@/components/approval-assist-notes";
import { RiskBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import { approveContentAction, rejectContentAction } from "../content/actions";
import type { ContentItem, User } from "@/lib/types";

async function ApprovalCard({ c, user }: { c: ContentItem; user: User }) {
  const blocked = !!c.compliance && !c.compliance.canProceed;
  const route = c.routedTo ?? "admin";
  const mayApprove = canApproveRoute(user, route) && !blocked;
  const company = await getCompany(c.companyId);
  const companyName = company?.name;
  const assist = company ? await buildApprovalAssist(c, company) : null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/content/${c.id}`} className="font-semibold hover:text-primary">
              {c.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {companyName} · {titleCase(c.type)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.groundingLabel && (
              <Badge tone={c.groundingLabel === "grounded" ? "success" : "warning"}>
                {titleCase(c.groundingLabel)}
              </Badge>
            )}
            {c.compliance && <RiskBadge level={c.compliance.riskLevel} />}
          </div>
        </div>

        <p className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          {c.body}
        </p>

        {assist && <ApprovalAssistNotes assist={assist} />}

        {blocked && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
            Critical compliance issue — resolve in the editor before approving.
          </p>
        )}
        {!blocked && !canApproveRoute(user, route) && (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
            Routed to {ROUTE_LABEL[route]} — requires the super admin.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={approveContentAction}>
            <input type="hidden" name="contentId" value={c.id} />
            <Button type="submit" disabled={!mayApprove}>
              Approve
            </Button>
          </form>
          <form action={rejectContentAction} className="flex flex-1 items-end gap-2">
            <input type="hidden" name="contentId" value={c.id} />
            <div className="flex-1">
              <Textarea name="note" placeholder="Reason (optional)" className="min-h-10" />
            </div>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <input type="checkbox" name="changesOnly" className="h-4 w-4" />
              Changes only
            </label>
            <Button type="submit" variant="destructive">
              Reject
            </Button>
          </form>
          <Link href={`/content/${c.id}`} className="text-sm text-primary hover:underline">
            Open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ApprovalsPage() {
  const user = await requirePermission("approve_content");
  const pending = (await visibleContent(user)).filter(
    (c) => c.status === "pending_approval",
  );
  // Phase 3: content is routed to the right queue (§26).
  const standard = pending.filter(
    (c) => (c.routedTo ?? "admin") === "admin" || c.routedTo === "company_admin",
  );
  const elevated = pending.filter(
    (c) => c.routedTo === "senior" || c.routedTo === "compliance",
  );

  return (
    <div>
      <PageHeader
        title="Approval inbox"
        explainerId="approvals"
        explainer="Agency approval inbox. Content routes by risk and type — nothing publishes until someone here approves."
      />
      <div className="space-y-8 p-6">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Compliance &amp; senior queue</h2>
            <Badge tone={elevated.length ? "danger" : "neutral"}>{elevated.length}</Badge>
          </div>
          <div className="space-y-4">
            {elevated.map((c) => (
              <ApprovalCard key={c.id} c={c} user={user} />
            ))}
            {elevated.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing needs compliance or senior review.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Standard queue</h2>
            <Badge tone={standard.length ? "primary" : "neutral"}>{standard.length}</Badge>
          </div>
          <div className="space-y-4">
            {standard.map((c) => (
              <ApprovalCard key={c.id} c={c} user={user} />
            ))}
            {standard.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing awaiting standard approval. 🎉
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
