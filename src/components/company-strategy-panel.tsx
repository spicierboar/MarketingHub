import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailedStrategyDocument } from "@/components/detailed-strategy-document";
import { formatDate } from "@/lib/utils";
import type { CompanyStrategyView } from "@/lib/managed-service/strategy-view";

function toneFor(view: CompanyStrategyView): "success" | "warning" | "danger" | "info" | "neutral" {
  if (view.visibility === "ready") return "success";
  if (view.visibility === "blocked" || view.visibility === "failed") return "danger";
  if (view.visibility === "waiting" || view.visibility === "needs_package") return "warning";
  if (view.visibility === "preparing") return "info";
  return "neutral";
}

export function CompanyStrategyPanel({
  view,
  audience,
  campaignLink,
  unlockAction,
  calendarHref,
  packageHref,
  listHref,
  versionHref,
  showingList = false,
  lifecycleActions,
}: {
  view: CompanyStrategyView;
  audience: "agency" | "client";
  campaignLink?: string | null;
  /** Optional server-action form (agency unlock). */
  unlockAction?: ReactNode;
  calendarHref: string;
  /** Agency: link to assign marketing package when waiting. */
  packageHref?: string | null;
  listHref: string;
  versionHref: (version: number) => string;
  showingList?: boolean;
  lifecycleActions?: ReactNode;
}) {
  const badgeTone = toneFor(view);
  const showDetailed =
    view.visibility === "ready" &&
    (Boolean(view.detailedStrategy) || view.strategyVersions.length > 0);

  if (showDetailed) {
    return (
      <div className="space-y-4">
        {view.packageChangePendingBilling ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-medium">Billing pending</p>
            <p className="mt-0.5 text-xs opacity-90">
              Package Checkout not settled yet — treat as unpaid until Stripe or demo mock clears it.
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {view.packageName} · A${view.packagePriceAud}/mo · ~{view.postsPerMonth} posts/month
          </span>
          <Badge tone={badgeTone}>Ready</Badge>
        </div>
        <DetailedStrategyDocument
          doc={view.detailedStrategy}
          audience={audience}
          versions={view.strategyVersions}
          listHref={listHref}
          versionHref={versionHref}
          showingList={showingList}
          lifecycleActions={lifecycleActions}
        />
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Link href={calendarHref}>
            <Button type="button" variant="outline" size="sm">
              {audience === "client" ? "Open schedule" : "Open calendar"}
            </Button>
          </Link>
          {audience === "agency" && campaignLink ? (
            <Link href={campaignLink}>
              <Button type="button" variant="outline" size="sm">
                Open campaign draft
              </Button>
            </Link>
          ) : null}
          {audience === "client" ? (
            <Link href="/client/approvals">
              <Button type="button" size="sm">
                Review drafts
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">
              {audience === "client" ? "Your marketing strategy" : "Client strategy"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{view.statusLine}</p>
          </div>
          <Badge tone={badgeTone}>
            {view.visibility === "ready"
              ? "Ready"
              : view.visibility === "waiting"
                ? "Unlocks soon"
                : view.visibility === "preparing"
                  ? "Preparing"
                  : view.visibility === "needs_package"
                    ? "Waiting for package"
                    : view.visibility === "blocked"
                      ? "Needs info"
                      : view.visibility === "failed"
                        ? "Failed"
                        : "Not started"}
          </Badge>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Package</dt>
            <dd className="font-medium">
              {view.visibility === "needs_package"
                ? "Not assigned"
                : `${view.packageName} · A$${view.packagePriceAud}/mo`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cadence</dt>
            <dd className="font-medium">
              {view.visibility === "needs_package"
                ? "—"
                : `~${view.postsPerMonth} posts / month`}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Channels</dt>
            <dd className="font-medium">
              {view.visibility === "needs_package"
                ? "Assign a package to unlock channels"
                : view.channels.length
                  ? view.channels.join(", ")
                  : "Per package"}
            </dd>
          </div>
        </dl>

        {view.packageChangePendingBilling && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-medium">Billing pending</p>
            <p className="mt-0.5 text-xs opacity-90">
              {audience === "agency"
                ? "Marketing package Checkout is not settled yet — strategy may still prepare, but treat this client as unpaid until Stripe (or demo mock) clears the flag."
                : "Your marketing package payment is still being confirmed. Strategy prep can continue; nothing publishes without approval."}
            </p>
          </div>
        )}

        {view.visibility === "needs_package" && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-medium">Marketing package required</p>
            <p className="mt-0.5 text-xs opacity-90">
              {audience === "agency"
                ? "Strategy delivery starts after a package is assigned (Basic is the default on Add Client)."
                : "Your agency will assign a marketing package before strategy unlocks."}
            </p>
            {audience === "agency" && packageHref ? (
              <Link href={packageHref} className="mt-2 inline-block">
                <Button type="button" size="sm" variant="outline">
                  Assign package on Overview
                </Button>
              </Link>
            ) : null}
          </div>
        )}

        {view.visibility === "waiting" && view.eligibleAt && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
            <p className="font-medium">Strategy unlocks after signup delay</p>
            <p className="mt-0.5 text-xs opacity-90">
              Available from {formatDate(view.eligibleAt)}
              {view.hoursUntilEligible != null
                ? ` (about ${view.hoursUntilEligible.toFixed(1)}h left)`
                : ""}
              . Target ready by {view.dueAt ? formatDate(view.dueAt) : `${view.dueHours}h after signup`}.
              {view.demoImmediate
                ? " Local demo skips the wait on new signups; use Unlock if an older run is still held."
                : null}
            </p>
            {unlockAction}
          </div>
        )}

        {view.visibility === "preparing" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {view.runId
                ? `Generation is eligible and in progress${view.runPhase ? ` (phase: ${view.runPhase})` : ""}. Refresh shortly, or wait for the scheduler tick.`
                : "Package is assigned but delivery has not started yet — use Generate below (demo auto-kicks on this page)."}
            </p>
            {unlockAction}
          </div>
        )}

        {(view.visibility === "blocked" || view.visibility === "failed") && (
          <p className="text-sm text-muted-foreground">
            {audience === "agency"
              ? "Check company profile completeness and the delivery run errors, then re-enqueue from package or service level."
              : "Your agency has been notified and will follow up — nothing has been published."}
          </p>
        )}

        {view.visibility === "ready" && view.strategySummary && !view.detailedStrategy && (
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-semibold">Strategy</h3>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {view.strategySummary}
              </p>
            </div>
            {view.strategyChannelPlan ? (
              <div>
                <h3 className="text-sm font-semibold">Channel plan</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {view.strategyChannelPlan}
                </p>
              </div>
            ) : null}
            {view.completedAt ? (
              <p className="text-xs text-muted-foreground">
                Ready {formatDate(view.completedAt)}
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Link href={calendarHref}>
            <Button type="button" variant="outline" size="sm">
              {audience === "client" ? "Open schedule" : "Open calendar"}
            </Button>
          </Link>
          {audience === "agency" && campaignLink ? (
            <Link href={campaignLink}>
              <Button type="button" variant="outline" size="sm">
                Open campaign draft
              </Button>
            </Link>
          ) : null}
          {audience === "client" && view.visibility === "ready" ? (
            <Link href="/client/approvals">
              <Button type="button" size="sm">
                Review drafts
              </Button>
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
