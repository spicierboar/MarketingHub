import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { listContent, listScheduledPosts } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { now, titleCase } from "@/lib/utils";
import type { ScheduledPostStatus } from "@/lib/types";
import {
  cancelClientScheduleAction,
  rescheduleClientPostAction,
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

  const [allPosts, content] = await Promise.all([
    listScheduledPosts(user.tenantId),
    listContent(user.tenantId),
  ]);
  const titleById = new Map(
    content.filter((c) => c.companyId === companyId).map((c) => [c.id, c.title]),
  );

  const posts = allPosts
    .filter(
      (p) =>
        p.companyId === companyId &&
        p.status !== "cancelled" &&
        p.scheduledDate.slice(0, 7) === month,
    )
    .sort((a, b) =>
      `${a.scheduledDate}${a.scheduledTime ?? ""}`.localeCompare(
        `${b.scheduledDate}${b.scheduledTime ?? ""}`,
      ),
    );

  const byDate = new Map<string, typeof posts>();
  for (const post of posts) {
    const list = byDate.get(post.scheduledDate) ?? [];
    list.push(post);
    byDate.set(post.scheduledDate, list);
  }
  const dates = [...byDate.keys()].sort();

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div>
      <PageHeader
        title="Your calendar"
        description="What's planned for your social channels. Ask us to move or pause a post if timing needs to change."
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

      <div className="space-y-6 p-6">
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
                {(byDate.get(date) ?? []).map((post) => (
                  <Card key={post.id}>
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">
                          {titleById.get(post.contentId) ?? "Untitled post"}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span>{titleCase(post.platform)}</span>
                          {post.scheduledTime ? <span>· {post.scheduledTime}</span> : null}
                          <Badge tone={statusTone(post.status)}>{titleCase(post.status)}</Badge>
                        </div>
                      </div>

                      {post.status === "scheduled" ? (
                        <div className="flex flex-col gap-2 sm:items-end">
                          <form action={rescheduleClientPostAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="postId" value={post.id} />
                            <div>
                              <label className="mb-1 block text-xs text-muted-foreground" htmlFor={`date-${post.id}`}>
                                Move to
                              </label>
                              <Input
                                id={`date-${post.id}`}
                                type="date"
                                name="date"
                                defaultValue={post.scheduledDate}
                                required
                                className="h-9 w-auto"
                              />
                            </div>
                            <Button type="submit" size="sm" variant="outline">
                              Ask to move
                            </Button>
                          </form>
                          <form action={cancelClientScheduleAction}>
                            <input type="hidden" name="postId" value={post.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Pause this post
                            </Button>
                          </form>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
