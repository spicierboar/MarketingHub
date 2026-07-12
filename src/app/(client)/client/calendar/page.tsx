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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { now, titleCase, formatDate } from "@/lib/utils";
import type { ScheduledPostStatus } from "@/lib/types";
import { selectionsNotOnCalendar } from "@/lib/promo-requests";
import {
  askPauseClientPostAction,
  askRescheduleClientPostAction,
} from "./actions";

function statusTone(status: ScheduledPostStatus): "primary" | "success" | "warning" | "danger" | "neutral" | "info" {
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

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

type CalendarRow =
  | {
      kind: "live";
      id: string;
      date: string;
      time?: string | null;
      title: string;
      platform: string;
      status: ScheduledPostStatus;
      postId: string;
    }
  | {
      kind: "planned";
      id: string;
      date: string;
      time?: string | null;
      title: string;
      platform: string;
      source: "draft_schedule" | "implementation_plan";
    };

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
  const rows: CalendarRow[] = [
    ...livePosts.map((p) => ({
      kind: "live" as const,
      id: p.id,
      date: p.scheduledDate,
      time: p.scheduledTime,
      title: titleById.get(p.contentId) ?? "Untitled post",
      platform: p.platform,
      status: p.status,
      postId: p.id,
    })),
  ];

  for (const d of draftSchedules) {
    if (d.scheduledDate.slice(0, 7) !== month) continue;
    // Skip if already represented by a live scheduled post for same content.
    if (d.contentId && liveContentIds.has(d.contentId)) continue;
    rows.push({
      kind: "planned",
      id: `cds-${d.id}`,
      date: d.scheduledDate,
      time: d.scheduledTime,
      title: d.title || "Planned post",
      platform: d.platform,
      source: "draft_schedule",
    });
  }

  for (const s of assists) {
    if (s.companyId !== companyId) continue;
    if (s.proposedDate.slice(0, 7) !== month) continue;
    if (s.kind !== "implementation_plan" && s.kind !== "seasonal_prompt") continue;
    // Avoid duplicating draft-schedule titles on the same date.
    const dup = rows.some(
      (r) =>
        r.date === s.proposedDate &&
        r.title.toLowerCase() === s.title.toLowerCase(),
    );
    if (dup) continue;
    rows.push({
      kind: "planned",
      id: `assist-${s.id}`,
      date: s.proposedDate,
      time: s.proposedTime,
      title: s.title,
      platform: s.platform,
      source: "implementation_plan",
    });
  }

  rows.sort((a, b) =>
    `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`),
  );

  const byDate = new Map<string, CalendarRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const dates = [...byDate.keys()].sort();

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div>
      <PageHeader
        title="Schedule & results"
        explainerId="client-calendar"
        explainer="Glance at what's planned. Timing changes go to your team as an Ask — we handle the schedule."
      >
        <div className="flex items-center gap-2">
          <Link href={`/client/calendar?month=${prev}`} className={buttonClasses("outline", "sm")}>
            Previous
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel(month)}</span>
          <Link href={`/client/calendar?month=${next}`} className={buttonClasses("outline", "sm")}>
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
                    {s.billingClass === "included" ? " · Included" : s.billingClass === "extra" ? " · Extra" : ""}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Want another promo or custom work?{" "}
          <Link href="/client/account#extra-work" className="text-primary hover:underline">
            Request from Account
          </Link>
        </p>

        {dates.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing planned this month yet — we&apos;ll add posts here as they&apos;re ready.
            </CardContent>
          </Card>
        ) : (
          dates.map((date) => (
            <section key={date}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{formatDay(date)}</h2>
              <div className="space-y-3">
                {(byDate.get(date) ?? []).map((row) =>
                  row.kind === "live" ? (
                    <Card key={row.id}>
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">{row.title}</p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>{titleCase(row.platform)}</span>
                            {row.time ? <span>· {row.time}</span> : null}
                            <Badge tone={statusTone(row.status)}>{titleCase(row.status)}</Badge>
                          </div>
                        </div>

                        {row.status === "scheduled" ? (
                          <div className="flex flex-col gap-2 sm:max-w-xs sm:items-end">
                            <p className="text-[11px] text-muted-foreground sm:text-right">
                              Need a change? We&apos;ll handle it — send an Ask.
                            </p>
                            <form
                              action={askRescheduleClientPostAction}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <input type="hidden" name="postId" value={row.postId} />
                              <div>
                                <label
                                  className="mb-1 block text-xs text-muted-foreground"
                                  htmlFor={`date-${row.postId}`}
                                >
                                  Preferred date
                                </label>
                                <Input
                                  id={`date-${row.postId}`}
                                  type="date"
                                  name="date"
                                  defaultValue={row.date}
                                  className="h-9 w-auto"
                                />
                              </div>
                              <Button type="submit" size="sm" variant="outline">
                                Ask to move
                              </Button>
                            </form>
                            <form action={askPauseClientPostAction}>
                              <input type="hidden" name="postId" value={row.postId} />
                              <Button type="submit" size="sm" variant="ghost">
                                Ask to pause
                              </Button>
                            </form>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : (
                    <Card key={row.id}>
                      <CardContent className="flex flex-col gap-2 p-4">
                        <p className="font-medium">{row.title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{titleCase(row.platform)}</span>
                          {row.time ? <span>· {row.time}</span> : null}
                          <Badge tone="info">
                            {row.source === "implementation_plan" ? "Plan" : "Planned"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Proposed date — nothing goes live until approved.
                        </p>
                      </CardContent>
                    </Card>
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
