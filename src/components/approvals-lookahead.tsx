import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type LookaheadStatus =
  | "pending_approval"
  | "client_review"
  | "scheduled"
  | "planned"
  | "published";

export interface LookaheadItem {
  id: string;
  date: string;
  companyId: string;
  companyName: string;
  title: string;
  status: LookaheadStatus;
  href: string;
  time?: string;
}

const STATUS_LABEL: Record<LookaheadStatus, string> = {
  pending_approval: "Pending approval",
  client_review: "Client review",
  scheduled: "Scheduled",
  planned: "Planned",
  published: "Published",
};

const STATUS_TONE: Record<
  LookaheadStatus,
  "warning" | "info" | "primary" | "success" | "neutral"
> = {
  pending_approval: "warning",
  client_review: "info",
  scheduled: "primary",
  planned: "neutral",
  published: "success",
};

function shortClientName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 12 ? `${first.slice(0, 11)}…` : first;
}

function dayHeading(iso: string): { dow: string; day: string } {
  const d = new Date(iso + "T12:00:00Z");
  return {
    dow: d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }),
  };
}

function isWeekBoundary(iso: string, index: number): boolean {
  if (index === 0) return false;
  const d = new Date(iso + "T12:00:00Z");
  // Monday-start week band (en-AU agency week).
  return d.getUTCDay() === 1;
}

export function ApprovalsLookahead({
  days,
  today,
  itemsByDay,
  companyFilterName,
}: {
  days: string[];
  today: string;
  itemsByDay: Record<string, LookaheadItem[]>;
  companyFilterName?: string;
}) {
  const total = days.reduce((n, d) => n + (itemsByDay[d]?.length ?? 0), 0);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Pipeline look-ahead</h2>
          <p className="text-xs text-muted-foreground">
            {companyFilterName
              ? `Past week → three weeks for ${companyFilterName}.`
              : "Past week → three weeks across clients."}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {total} item{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-0 p-3">
          {days.map((date, i) => {
            const items = itemsByDay[date] ?? [];
            const { dow, day } = dayHeading(date);
            const isToday = date === today;
            const isPast = date < today;
            const weekStart = isWeekBoundary(date, i);

            return (
              <div
                key={date}
                className={cn(
                  "flex w-[8.5rem] shrink-0 flex-col gap-1.5 border-r border-border/60 px-1.5 last:border-r-0",
                  weekStart && "ml-2 border-l border-border pl-2",
                  isToday && "rounded-md bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "sticky top-0 px-1 pb-1 pt-0.5",
                    isToday && "text-primary",
                    isPast && !isToday && "text-muted-foreground",
                  )}
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                    {dow}
                    {isToday ? " · Today" : ""}
                  </p>
                  <p className="text-xs font-semibold tabular-nums">{day}</p>
                </div>

                <div className="flex min-h-[4.5rem] flex-col gap-1">
                  {items.length === 0 && (
                    <p className="px-1 text-[10px] text-muted-foreground/70">—</p>
                  )}
                  {items.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="block rounded-md border border-border/80 bg-background px-1.5 py-1 transition-colors hover:border-primary/40 hover:bg-muted/40"
                    >
                      <p className="truncate text-[10px] font-medium text-muted-foreground">
                        {shortClientName(item.companyName)}
                      </p>
                      <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                        {item.title}
                      </p>
                      <Badge
                        tone={STATUS_TONE[item.status]}
                        className="mt-1 px-1.5 py-0 text-[9px]"
                      >
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </Link>
                  ))}
                  {items.length > 5 && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{items.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
