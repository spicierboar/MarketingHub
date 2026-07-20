import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { listManagedApprovalRequests, listManagedPaidAuthorizations } from "@/lib/db";
import { visibleContent } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { Textarea } from "@/components/ui/form";
import {
  approveManagedPortalAction,
  requestManagedChangesPortalAction,
} from "./managed-actions";

export default async function ClientApprovalsPage() {
  const { user, companyId } = await requirePortalUser();
  const [visible, managed, paidAuthorizations] = await Promise.all([
    visibleContent(user),
    listManagedApprovalRequests(user.tenantId, companyId),
    listManagedPaidAuthorizations(user.tenantId, companyId),
  ]);
  const pending = visible.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );
  const paidPending = managed.filter(
    (request) =>
      request.status === "pending" &&
      request.recipientEmail.toLowerCase() === user.email.toLowerCase() &&
      (request.scope === "paid_creative" ||
        request.scope === "paid_budget_targeting"),
  );
  const authorizationByCampaign = new Map(
    paidAuthorizations.map((authorization) => [
      authorization.adCampaignId,
      authorization,
    ]),
  );

  return (
    <div>
      <PageHeader
        title="Ready for your review"
        explainerId="client-approvals"
        explainer="Drafts waiting on you. Approve so we can schedule after our usual checks — or ask for changes. Nothing goes live without those gates."
      />
      <div className="space-y-4 p-6">
        {pending.length === 0 && paidPending.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up — nothing needs your approval right now.
            </CardContent>
          </Card>
        ) : (
          pending.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Link
                    href={`/client/approvals/${c.id}`}
                    className="font-semibold hover:text-primary"
                  >
                    {c.title}
                  </Link>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {c.body}
                  </p>
                </div>
                <Link
                  href={`/client/approvals/${c.id}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  Review →
                </Link>
              </CardContent>
            </Card>
          ))
        )}
        {paidPending.map((request) => {
          const authorization = request.adCampaignId
            ? authorizationByCampaign.get(request.adCampaignId)
            : undefined;
          const budgetScope = request.scope === "paid_budget_targeting";
          return (
            <Card key={request.id}>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Paid campaign
                  </p>
                  <h2 className="font-semibold">
                    {budgetScope
                      ? "Approve audience and budget"
                      : "Approve campaign creative"}
                  </h2>
                  {budgetScope && authorization && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Campaign budget</dt>
                        <dd className="font-semibold">
                          A${authorization.requestedBudgetAud}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Monthly cap</dt>
                        <dd className="font-semibold">
                          A${authorization.clientMonthlyCapAud}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
                <form action={approveManagedPortalAction} className="space-y-3">
                  <input type="hidden" name="requestId" value={request.id} />
                  {budgetScope && (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="directPlatformChargeAccepted"
                        required
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        I understand the advertising platform charges my card
                        directly, separately from service fees, within this approved
                        monthly cap.
                      </span>
                    </label>
                  )}
                  <ActionSubmitButton
                    type="submit"
                    className="h-11 w-full"
                    pendingLabel="Approving…"
                  >
                    Approve
                  </ActionSubmitButton>
                </form>
                <form action={requestManagedChangesPortalAction} className="space-y-2">
                  <input type="hidden" name="requestId" value={request.id} />
                  <Textarea
                    name="note"
                    required
                    minLength={3}
                    placeholder="Tell us what should change"
                    aria-label="Requested changes"
                  />
                  <ActionSubmitButton
                    type="submit"
                    variant="outline"
                    className="h-11 w-full"
                    pendingLabel="Sending request…"
                  >
                    Request changes
                  </ActionSubmitButton>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
