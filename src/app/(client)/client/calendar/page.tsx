import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  getCompany,
  listCalendarAssistSuggestions,
  listCampaignDraftScheduleItems,
  listCampaigns,
  listContent,
  listScheduledPosts,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { ClientScheduleTabs } from "@/components/client-schedule-tabs";
import { ClientCalendarMonth, type ClientCalendarItem } from "@/components/client-calendar-month";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { now, formatDate, titleCase } from "@/lib/utils";
import { monthGrid } from "@/lib/calendar-utils";
import type { ScheduledPostStatus } from "@/lib/types";
import { selectionsNotOnCalendar } from "@/lib/promo-requests";

function statusTone(
  status: ScheduledPostStatus,
): ClientCalendarItem["statusTone"] {
  switch (status) {
    case "scheduled":
      return "primary";
    case "publishing":
      return "info";
    case "published":
      return "success";
    case "failed":
    case "dead":
      return "danger";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, companyId } = await requirePortalUser();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : now().slice(0, 7);

  const grid = monthGrid(month);

  const [allPosts, content, company, campaigns, assists] = await Promise.all([
    listScheduledPosts(user.tenantId),
    listContent(user.tenantId),
    getCompany(companyId),
    listCampaigns(user.tenantId),
    listCalendarAssistSuggestions(user.tenantId, [companyId], "open"),
  ]);
  const pendingPromos = company ? selectionsNotOnCalendar(company) : [];
  const titleById = new Map(
    content.filter((c) => c.companyId === companyId).map((c) => [c.id, c.title]),
  );

  const livePosts = allPosts.filter(
    (p) =>
      p.companyId === companyId &&
      p.status !== "cancelled" &&
      p.scheduledDate.slice(0, 7) === month,
  );

  const companyCampaigns = campaigns.filter((c) => c.companyId === companyId);
  const draftSchedules = (
    await Promise.all(companyCampaigns.map((c) => listCampaignDraftScheduleItems(c.id)))
  ).flat();

  const liveContentIds = new Set(livePosts.map((p) => p.contentId));
  const items: ClientCalendarItem[] = [
    ...livePosts.map((p) => ({
      id: p.id,
      date: p.scheduledDate,
      time: p.scheduledTime,
      title: titleById.get(p.contentId) ?? "Untitled post",
      platform: p.platform,
      kind: "live" as const,
      statusLabel: titleCase(p.status),
      statusTone: statusTone(p.status),
      postId: p.id,
    })),
  ];

  for (const d of draftSchedules) {
    if (d.scheduledDate.slice(0, 7) !== month) continue;
    if (d.contentId && liveContentIds.has(d.contentId)) continue;
    items.push({
      id: `cds-${d.id}`,
      date: d.scheduledDate,
      time: d.scheduledTime,
      title: d.title || "Planned post",
      platform: d.platform,
      kind: "planned",
      statusLabel: "Planned",
      statusTone: "info",
      note: "Proposed date — nothing goes live until approved.",
    });
  }

  for (const s of assists) {
    if (s.companyId !== companyId) continue;
    if (s.proposedDate.slice(0, 7) !== month) continue;
    if (s.kind !== "implementation_plan" && s.kind !== "seasonal_prompt") continue;
    const dup = items.some(
      (r) =>
        r.date === s.proposedDate &&
        r.title.toLowerCase() === s.title.toLowerCase(),
    );
    if (dup) continue;
    items.push({
      id: `assist-${s.id}`,
      date: s.proposedDate,
      time: s.proposedTime,
      title: s.title,
      platform: s.platform,
      kind: "planned",
      statusLabel: s.kind === "implementation_plan" ? "Plan" : "Planned",
      statusTone: "info",
      note: "Proposed date — nothing goes live until approved.",
    });
  }

  return (
    <div>
      <PageHeader
        title="Schedule & results"
        explainerId="client-calendar"
        explainer="Month view of what’s planned. Tap an item for details. Timing changes go to your team as an Ask."
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/client/calendar?month=${grid.prev}`}
            className={buttonClasses("outline", "sm")}
          >
            Previous
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">
            {grid.label}
          </span>
          <Link
            href={`/client/calendar?month=${grid.next}`}
            className={buttonClasses("outline", "sm")}
          >
            Next
          </Link>
        </div>
      </PageHeader>

      <ClientScheduleTabs />

      <div className="space-y-6 p-6">
        {pendingPromos.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium text-amber-950">
                Promotions not on this calendar yet
              </p>
              <p className="text-xs text-amber-900/80">
                These stay off the calendar until we place them into delivery.
              </p>
              <ul className="space-y-1 text-sm text-amber-950">
                {pendingPromos.map((s) => (
                  <li key={s.id}>
                    {s.templateName} · {formatDate(s.startDate)} → {formatDate(s.endDate)}
                    {s.billingClass === "included"
                      ? " · Included"
                      : s.billingClass === "extra"
                        ? " · Extra"
                        : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Want another promo or custom work?{" "}
          <Link href="/client/order" className="text-primary hover:underline">
            Order menu
          </Link>
          {" · "}
          <Link href="/client/requests/new" className="text-primary hover:underline">
            Ask us
          </Link>
        </p>

        {items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing planned this month yet — we&apos;ll add posts here as they&apos;re
              ready.
            </CardContent>
          </Card>
        ) : (
          <ClientCalendarMonth weeks={grid.weeks} items={items} />
        )}
      </div>
    </div>
  );
}
