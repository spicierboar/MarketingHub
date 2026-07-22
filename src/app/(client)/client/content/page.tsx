import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, titleCase } from "@/lib/utils";
import type { ContentItem, ContentStatus } from "@/lib/types";

/** Statuses clients are allowed to see — not agency-only drafts. */
const CLIENT_VISIBLE_STATUSES: ContentStatus[] = [
  "pending_approval",
  "changes_required",
  "approved",
  "scheduled",
  "published",
  "rejected",
];

function clientFacingLabel(c: ContentItem): string {
  if (c.status === "pending_approval" && c.clientReview?.status === "pending") {
    return "Needs your review";
  }
  if (c.status === "pending_approval") return "With agency";
  if (c.status === "changes_required") return "Changes requested";
  if (c.status === "approved") return "Approved";
  if (c.status === "scheduled") return "Scheduled";
  if (c.status === "published") return "Published";
  if (c.status === "rejected") return "Not approved";
  return titleCase(c.status);
}

function sortKey(c: ContentItem): string {
  // Newest activity first — prefer updated/created-ish fields available on content.
  return c.updatedAt ?? c.createdAt ?? "";
}

export default async function ClientContentStatusPage() {
  const { user } = await requirePortalUser();
  const items = (await visibleContent(user))
    .filter((c) => CLIENT_VISIBLE_STATUSES.includes(c.status))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  const awaitingYou = items.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );
  const inFlight = items.filter(
    (c) =>
      !(c.status === "pending_approval" && c.clientReview?.status === "pending") &&
      ["pending_approval", "changes_required", "approved", "scheduled"].includes(
        c.status,
      ),
  );
  const live = items.filter((c) => c.status === "published");

  return (
    <div>
      <PageHeader
        title="Content status"
        explainerId="client-content-status"
        explainer="Where your content sits — awaiting you, in progress with us, or already live. Agency-only drafts stay private until they are ready for review."
        parent={{ href: "/client/account", label: "Overview" }}
      />

      <div className="space-y-6 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-[11px] text-muted-foreground sm:text-xs">Awaiting you</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                {awaitingYou.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-[11px] text-muted-foreground sm:text-xs">In progress</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                {inFlight.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-[11px] text-muted-foreground sm:text-xs">Published</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">{live.length}</p>
            </CardContent>
          </Card>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No client-visible content yet — we&apos;ll show pieces here once they move into
              review or schedule.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => {
              const needsYou =
                c.status === "pending_approval" && c.clientReview?.status === "pending";
              return (
                <li key={c.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        {needsYou ? (
                          <Link
                            href={`/client/approvals/${c.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {c.title}
                          </Link>
                        ) : (
                          <p className="font-medium">{c.title}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {clientFacingLabel(c)}
                          {c.type ? ` · ${titleCase(c.type)}` : ""}
                          {c.updatedAt || c.createdAt
                            ? ` · ${formatDate(c.updatedAt ?? c.createdAt)}`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge status={c.status} />
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {awaitingYou.length > 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/client/approvals" className="text-primary hover:underline">
              Open approvals queue →
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
