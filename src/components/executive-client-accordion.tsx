"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CompanyExecDash } from "@/lib/exec-dash";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function tone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export function ExecutiveClientAccordion({
  rows,
}: {
  rows: CompanyExecDash[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-muted-foreground">
        No clients in this workspace yet.
      </p>
    );
  }

  const sorted = [...rows].sort((a, b) => a.overall - b.overall);

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {sorted.map((row) => {
        const open = openId === row.companyId;
        return (
          <li key={row.companyId}>
            <div className="flex items-stretch gap-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`exec-detail-${row.companyId}`}
                onClick={() =>
                  setOpenId((id) => (id === row.companyId ? null : row.companyId))
                }
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-90",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.companyName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {row.businessTypeHint || "Business"}
                    {row.nextBest[0]
                      ? ` · next: ${row.nextBest[0].title}`
                      : ""}
                  </p>
                </div>
                <Badge tone={tone(row.overall)}>{row.overall}</Badge>
              </button>
              <Link
                href={`/companies/${row.companyId}`}
                className="flex items-center px-3 text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open
              </Link>
            </div>

            {open && (
              <div
                id={`exec-detail-${row.companyId}`}
                className="space-y-3 border-t border-border bg-muted/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Overall {row.overall}/100 · marketing health {row.health.score}
                  </span>
                  <Badge tone={tone(row.overall)}>
                    {row.needsAttention ? "Needs attention" : "On track"}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {row.scorecards.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {c.label}
                        </p>
                        <p className="text-base font-semibold tabular-nums">
                          {c.score}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                        {c.evidence}
                      </p>
                    </div>
                  ))}
                </div>

                {row.nextBest.length > 0 && (
                  <div>
                    <h3 className="mb-1.5 text-xs font-medium">Next best actions</h3>
                    <ul className="space-y-1.5">
                      {row.nextBest.map((a, i) => (
                        <li
                          key={`${row.companyId}-nba-${i}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-card px-2.5 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium leading-snug">{a.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {a.reason}
                            </p>
                          </div>
                          <Link href={a.href}>
                            <Button type="button" size="sm" variant="secondary">
                              Open
                            </Button>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
