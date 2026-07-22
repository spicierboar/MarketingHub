import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  getCompany,
  listGaps,
  listManagedDeliveryRuns,
  listScheduledPosts,
} from "@/lib/db";
import { visibleContent } from "@/lib/scope";
import { clientStatusMessage } from "@/lib/managed-service/status-copy";
import {
  MIN_CREDIT_FLOOR_USD,
  getOrCreateCreditWallet,
} from "@/lib/credit-wallet";
import { listPendingSocialConnectInvites } from "@/lib/onboarding-social-connect";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import { displayGivenName } from "@/lib/display-name";

/** Consistent list-row type scale for the client home. */
const sectionTitle = "text-sm font-semibold text-foreground";
const rowTitle = "text-sm font-medium text-foreground";
const rowMeta = "text-xs text-muted-foreground";
const rowAction = "shrink-0 text-sm font-medium text-primary";
const emptyCopy = "px-4 py-6 text-sm text-muted-foreground";

function platformLabel(platform: string): string {
  const key = platform.trim().toLowerCase().replace(/[_-]+/g, " ");
  const known: Record<string, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    "youtube shorts": "YouTube Shorts",
    "google business profile": "Google Business Profile",
    gbp: "Google Business Profile",
  };
  return known[key] ?? titleCase(key);
}

export default async function ClientDashboardPage() {
  const { user, companyId } = await requirePortalUser();
  const [content, deliveryRuns, company, openGaps, wallet, allPosts, pendingConnect] =
    await Promise.all([
      visibleContent(user),
      listManagedDeliveryRuns(user.tenantId, companyId),
      getCompany(companyId),
      listGaps({ companyId, openOnly: true }),
      getOrCreateCreditWallet(companyId),
      listScheduledPosts(user.tenantId),
      listPendingSocialConnectInvites(user.tenantId, companyId),
    ]);
  const pendingApprovals = content.filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );
  const latestDelivery = deliveryRuns[0];
  const statusLine = latestDelivery
    ? clientStatusMessage(latestDelivery.statusMessageKey)
    : "Your marketing service is active";

  const creditLow = wallet.balanceUsd < MIN_CREDIT_FLOOR_USD;
  const needsCount =
    pendingApprovals.length +
    openGaps.length +
    (creditLow ? 1 : 0) +
    (pendingConnect.length > 0 ? 1 : 0);
  const titleByContentId = new Map(content.map((item) => [item.id, item.title]));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = allPosts
    .filter(
      (post) =>
        post.companyId === companyId &&
        post.status === "scheduled" &&
        post.scheduledDate >= today,
    )
    .slice(0, 5);
  const recentPublished = allPosts
    .filter((post) => post.companyId === companyId && post.status === "published")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${displayGivenName(user.name)}`}
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

      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {pendingConnect.length > 0 ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
            <p className={rowTitle}>
              Connect your social accounts ({pendingConnect.length} pending)
            </p>
            <p className={`mt-1 ${rowMeta}`}>
              Authorize Facebook, Instagram, and other package channels with a
              one-time secure link — we never ask for your password.
            </p>
            <Link
              href="/client/connect"
              className={buttonClasses("default", "sm") + " mt-2"}
            >
              Connect accounts →
            </Link>
          </div>
        ) : null}

        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className={rowTitle}>{statusLine}</p>
          <p className={`mt-1 ${rowMeta}`}>
            {needsCount === 0
              ? "Nothing waiting on you right now."
              : `${needsCount} item${needsCount === 1 ? "" : "s"} need${needsCount === 1 ? "s" : ""} your attention.`}
            {company ? ` · ${company.name}` : null}
          </p>
        </div>

        <section aria-labelledby="needs-approval">
          <h2 id="needs-approval" className={`mb-2 ${sectionTitle}`}>
            Needs your approval
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {pendingApprovals.map((item) => (
                <Link
                  key={item.id}
                  href={`/client/approvals/${item.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                >
                  <span className={`min-w-0 flex-1 ${rowTitle}`}>{item.title}</span>
                  <span className={rowAction}>Review →</span>
                </Link>
              ))}
              {openGaps.map((gap) => (
                <Link
                  key={gap.id}
                  href={gap.requestId ? `/client/requests/${gap.requestId}` : "/client/requests"}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                >
                  <span className={`min-w-0 flex-1 ${rowTitle}`}>{gap.question}</span>
                  <span className={rowAction}>Answer →</span>
                </Link>
              ))}
              {creditLow && (
                <Link
                  href="/client/payments"
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
                >
                  <span className={`min-w-0 flex-1 ${rowTitle}`}>Payment needs attention</span>
                  <span className={rowAction}>Resolve →</span>
                </Link>
              )}
              {needsCount === 0 && (
                <p className={emptyCopy}>
                  You’re all caught up. We’ll email you when something needs a decision.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="upcoming-scheduled">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="upcoming-scheduled" className={sectionTitle}>
              Upcoming scheduled
            </h2>
            <Link href="/client/calendar" className={`${rowAction} hover:underline`}>
              Full schedule
            </Link>
          </div>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {upcoming.map((post) => (
                <div
                  key={post.id}
                  className="flex min-h-14 items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={rowTitle}>
                      {titleByContentId.get(post.contentId) ?? "Scheduled content"}
                    </p>
                    <p className={`mt-0.5 ${rowMeta}`}>{platformLabel(post.platform)}</p>
                  </div>
                  <time className={`shrink-0 tabular-nums ${rowMeta}`}>
                    {post.scheduledDate}
                  </time>
                </div>
              ))}
              {upcoming.length === 0 && (
                <p className={emptyCopy}>
                  Nothing is scheduled yet. Approved work will appear here with its date.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="recent-published">
          <h2 id="recent-published" className={`mb-2 ${sectionTitle}`}>
            Recent published
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentPublished.map((post) => (
                <div
                  key={post.id}
                  className="flex min-h-14 items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className={rowTitle}>
                      {titleByContentId.get(post.contentId) ?? "Published content"}
                    </p>
                    <p className={`mt-0.5 ${rowMeta}`}>{platformLabel(post.platform)}</p>
                  </div>
                  <time className={`shrink-0 tabular-nums ${rowMeta}`}>
                    {formatDate(post.updatedAt)}
                  </time>
                </div>
              ))}
              {recentPublished.length === 0 && (
                <p className={emptyCopy}>
                  Published work will appear here after it goes live.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
