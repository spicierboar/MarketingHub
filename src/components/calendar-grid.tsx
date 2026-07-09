"use client";

// Month calendar with HTML5 drag-and-drop rescheduling (Phase 6). Scheduled
// posts are draggable onto other day cells; every chip opens a popover with a
// post preview, links, a reschedule form and cancel.

import { useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "@/lib/calendar-utils";
import { cancelScheduleAction, reschedulePostAction } from "@/app/(app)/calendar/actions";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  publishing: "bg-sky-100 text-sky-800 ring-sky-200",
  published: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-red-100 text-red-800 ring-red-200",
  dead: "bg-red-50 text-red-900 ring-red-300",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  drafted: "bg-sky-50 text-sky-700 ring-sky-200",
  planned: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function CalendarGrid({
  weeks,
  entriesByDay,
  conflictsByDay,
  holidays,
}: {
  weeks: (string | null)[][];
  entriesByDay: Record<string, CalendarEntry[]>;
  conflictsByDay: Record<string, string[]>;
  holidays: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();

  function onDrop(e: React.DragEvent, date: string) {
    e.preventDefault();
    const postId = e.dataTransfer.getData("text/scheduled-post");
    if (!postId) return;
    const fd = new FormData();
    fd.set("postId", postId);
    fd.set("date", date);
    startTransition(() => {
      void reschedulePostAction(fd);
    });
  }

  return (
    <div className={cn("overflow-x-auto", isPending && "opacity-60")}>
      <div className="grid min-w-[860px] grid-cols-7 gap-px rounded-lg border border-border bg-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-muted/60 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((date, i) =>
          date === null ? (
            <div key={`x${i}`} className="min-h-28 bg-muted/30" />
          ) : (
            <div
              key={date}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, date)}
              className="min-h-28 space-y-1 bg-card p-1.5 align-top"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {Number(date.slice(8, 10))}
                </span>
                {holidays[date] && (
                  <span
                    title={holidays[date]}
                    className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800"
                  >
                    ★ {holidays[date].split(" (")[0]}
                  </span>
                )}
              </div>
              {(conflictsByDay[date] ?? []).map((w, j) => (
                <p
                  key={j}
                  className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] leading-tight text-red-700"
                >
                  ⚠ {w}
                </p>
              ))}
              {(entriesByDay[date] ?? []).map((entry) => (
                <details key={entry.id} className="group relative">
                  <summary
                    // Only a resting "scheduled" post can move — dragging a
                    // published/in-flight/dead chip would just have the server
                    // action reject it.
                    draggable={entry.kind === "post" && entry.status === "scheduled"}
                    onDragStart={(e) =>
                      entry.scheduledPostId &&
                      entry.status === "scheduled" &&
                      e.dataTransfer.setData(
                        "text/scheduled-post",
                        entry.scheduledPostId,
                      )
                    }
                    className={cn(
                      "block cursor-pointer truncate rounded px-1.5 py-1 text-[11px] font-medium leading-tight ring-1 ring-inset",
                      STATUS_CHIP[entry.status] ??
                        "bg-slate-100 text-slate-700 ring-slate-200",
                      entry.kind === "post" && entry.status === "scheduled" && "cursor-grab",
                    )}
                    title={`${entry.companyName} · ${entry.platform} · ${entry.status}`}
                  >
                    {entry.warnings.length > 0 && "⚠ "}
                    {entry.time && `${entry.time} `}
                    {entry.title}
                  </summary>
                  <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-md border border-border bg-card p-3 shadow-lg">
                    <p className="text-xs font-semibold">{entry.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {entry.companyName} · {entry.platform} · {entry.status}
                    </p>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {entry.preview}
                    </p>
                    {entry.warnings.map((w, j) => (
                      <p key={j} className="mt-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700">
                        ⚠ {w}
                      </p>
                    ))}
                    <div className="mt-2 flex items-center gap-2">
                      <Link href={entry.href} className="text-xs text-primary hover:underline">
                        Open
                      </Link>
                      {entry.campaignId && (
                        <Link
                          href={`/campaigns/${entry.campaignId}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Campaign
                        </Link>
                      )}
                    </div>
                    {entry.scheduledPostId && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        {/* Controls match what the server actions accept: move
                            only resting schedules; cancel anything the queue
                            isn't actively sending. */}
                        {entry.status === "scheduled" && (
                          <form action={reschedulePostAction} className="flex items-center gap-1.5">
                            <input type="hidden" name="postId" value={entry.scheduledPostId} />
                            <input
                              type="date"
                              name="date"
                              defaultValue={entry.date}
                              className="h-7 flex-1 rounded border border-input bg-card px-1.5 text-[11px]"
                            />
                            <input
                              type="time"
                              name="time"
                              defaultValue={entry.time}
                              className="h-7 rounded border border-input bg-card px-1.5 text-[11px]"
                            />
                            <button
                              type="submit"
                              className="h-7 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground"
                            >
                              Move
                            </button>
                          </form>
                        )}
                        {["scheduled", "failed", "dead"].includes(entry.status) && (
                          <form action={cancelScheduleAction}>
                            <input type="hidden" name="postId" value={entry.scheduledPostId} />
                            <button
                              type="submit"
                              className="text-[11px] text-red-600 hover:underline"
                            >
                              Cancel schedule
                            </button>
                          </form>
                        )}
                        {entry.status === "publishing" && (
                          <p className="text-[10px] text-muted-foreground">
                            Publishing now — it can&apos;t be moved or cancelled mid-send.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ),
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Drag a scheduled post onto another day to move it. Faded chips are
        planned campaign items — schedule them from their campaign.
      </p>
    </div>
  );
}
