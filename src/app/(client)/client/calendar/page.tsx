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
  const currentMonth = now().slice(0, 7);
  const requestedMonth = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : null;

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

  const companyCampaigns = campaigns.filter((c) => c.companyId === companyId);
  const draftSchedules = (
    await Promise.all(companyCampaigns.map((c) => listCampaignDraftScheduleItems(c.id)))
  ).flat();

  const allItems: ClientCalendarItem[] = [];

  for (const p of allPosts) {
    if (p.companyId !== companyId || p.status === "cancelled") continue;
    allItems.push({
      id: p.id,
      date: p.scheduledDate,
      time: p.scheduledTime,
      title: titleById.get(p.contentId) ?? "Untitled post",
      platform: p.platform,
      kind: "live",
      statusLabel: titleCase(p.status),
      statusTone: statusTone(p.status),
      postId: p.id,
    });
  }

  const liveContentIds = new Set(
    allPosts
      .filter((p) => p.companyId === companyId && p.status !== "cancelled")
      .map((p) => p.contentId),
  );

  for (const d of draftSchedules) {
    if (d.contentId && liveContentIds.has(d.contentId)) continue;
    allItems.push({
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
    if (s.kind !== "implementation_plan" && s.kind !== "seasonal_prompt") continue;
    allItems.push({
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

  // Prefer an explicit month; otherwise current month; if empty, nearest month with items.
  const monthsWithItems = [
    ...new Set(allItems.map((i) => i.date.slice(0, 7)).filter(Boolean)),
  ].sort();
  let month = requestedMonth ?? currentMonth;
  if (!requestedMonth && !monthsWithItems.includes(month) && monthsWithItems.length > 0) {
    const upcoming = monthsWithItems.find((m) => m >= currentMonth);
    month = upcoming ?? monthsWithItems[monthsWithItems.length - 1]!;
  }

  const grid = monthGrid(month);
  const items = allItems.filter((i) => i.date.slice(0, 7) === month);

  return (
    <div>
      <PageHeader
        title="Schedule"
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
            Extras
          </Link>
          {" · "}
          <Link href="/client/requests/new" className="text-primary hover:underline">
            Ask us
          </Link>
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on this month yet — use Previous / Next to look ahead, or{" "}
            <Link href="/client/order" className="text-primary hover:underline">
              Extras
            </Link>{" "}
            for special work.
          </p>
        ) : null}

        <ClientCalendarMonth weeks={grid.weeks} items={items} />
      </div>
    </div>
  );
}
