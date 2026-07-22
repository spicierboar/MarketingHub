"use client";

import { useMemo, useState } from "react";
import { FormModal } from "@/components/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn, titleCase } from "@/lib/utils";
import {
  askPauseClientPostAction,
  askRescheduleClientPostAction,
} from "@/app/(client)/client/calendar/actions";

export type ClientCalendarItem = {
  id: string;
  date: string;
  time?: string | null;
  title: string;
  platform: string;
  kind: "live" | "planned";
  statusLabel: string;
  statusTone: "primary" | "success" | "warning" | "danger" | "neutral" | "info";
  /** live scheduled post id for ask-to-move / pause */
  postId?: string;
  note?: string;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function chipLabel(title: string): string {
  const t = title.trim();
  if (t.length <= 28) return t;
  const colon = t.indexOf(":");
  if (colon > 0 && colon <= 32) return t.slice(0, colon).trim();
  return `${t.slice(0, 26).trim()}…`;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ClientCalendarMonth({
  weeks,
  items,
}: {
  weeks: (string | null)[][];
  items: ClientCalendarItem[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, ClientCalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [items]);

  const selected = selectedId
    ? items.find((i) => i.id === selectedId) ?? null
    : null;

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {DOW.map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((date, idx) => {
            if (!date) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[6.5rem] border-b border-r border-border bg-muted/20"
                />
              );
            }
            const dayItems = byDate.get(date) ?? [];
            const dayNum = Number(date.slice(8, 10));
            return (
              <div
                key={date}
                className="flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-border p-1.5"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {dayNum}
                </span>
                <div className="flex flex-col gap-1">
                  {dayItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "w-full rounded px-1.5 py-1 text-left text-[11px] font-medium leading-snug ring-1 ring-inset transition-colors hover:brightness-95",
                        item.kind === "live"
                          ? "bg-indigo-50 text-indigo-900 ring-indigo-200"
                          : "bg-slate-100 text-slate-700 ring-slate-200",
                      )}
                    >
                      <span className="line-clamp-2">{chipLabel(item.title)}</span>
                      {item.time ? (
                        <span className="mt-0.5 block text-[10px] font-normal opacity-80">
                          {item.time}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <FormModal
          title={selected.title}
          description={formatLongDate(selected.date)}
          onClose={() => setSelectedId(null)}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{titleCase(selected.platform)}</span>
              {selected.time ? <span>· {selected.time}</span> : null}
              <Badge tone={selected.statusTone}>{selected.statusLabel}</Badge>
            </div>

            {selected.note ? (
              <p className="text-sm text-muted-foreground">{selected.note}</p>
            ) : null}

            {selected.kind === "live" &&
            selected.postId &&
            selected.statusLabel.toLowerCase() === "scheduled" ? (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Need a change? Send an Ask — your agency handles the schedule.
                </p>
                <form
                  action={askRescheduleClientPostAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="postId" value={selected.postId} />
                  <div>
                    <label
                      className="mb-1 block text-xs text-muted-foreground"
                      htmlFor={`modal-date-${selected.postId}`}
                    >
                      Preferred date
                    </label>
                    <Input
                      id={`modal-date-${selected.postId}`}
                      type="date"
                      name="date"
                      defaultValue={selected.date}
                      className="h-9 w-auto"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Ask to move
                  </Button>
                </form>
                <form action={askPauseClientPostAction}>
                  <input type="hidden" name="postId" value={selected.postId} />
                  <Button type="submit" size="sm" variant="ghost">
                    Ask to pause
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </FormModal>
      ) : null}
    </>
  );
}
