import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  OptimalPostWindow,
  PortfolioSummary,
  SeasonalPrompt,
} from "@/lib/calendar-intelligence";
import type { QueueClock } from "@/lib/tenant-timezone";

const CATEGORY_TONE: Record<SeasonalPrompt["category"], "warning" | "info" | "primary" | "success"> = {
  holiday: "warning",
  seasonal: "primary",
  local: "info",
  industry: "success",
};

export function CalendarIntelligencePanel({
  clock,
  prompts,
  windows,
  monthLabel,
}: {
  clock: QueueClock;
  prompts: SeasonalPrompt[];
  windows: OptimalPostWindow[];
  monthLabel: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Seasonal &amp; event prompts</CardTitle>
          <CardDescription>
            AU-aware planning ideas for {monthLabel}. Local clock: {clock.clockLabel} ({clock.today})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No seasonal prompts this month.</p>
          ) : (
            prompts.slice(0, 8).map((p) => (
              <div key={p.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{p.date}</span>
                  <Badge tone={CATEGORY_TONE[p.category]}>{p.category}</Badge>
                  {p.priority === "high" && <Badge tone="warning">priority</Badge>}
                  <span className="font-medium">{p.title}</span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.prompt}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card id="optimal-windows">
        <CardHeader>
          <CardTitle>Optimal post windows</CardTitle>
          <CardDescription>
            Analytics-informed slots (simulated engagement until live Insights are connected).
            Basis shown under each window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Publish a few posts to unlock data-driven windows — industry defaults appear meanwhile.
            </p>
          ) : (
            windows.map((w, i) => (
              <div
                key={`${w.companyId}-${w.platform}-${w.dayOfWeek}-${i}`}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {w.dayOfWeek} {w.timeStart}–{w.timeEnd}
                    <span className="ml-2 text-muted-foreground">· {w.platform}</span>
                  </p>
                  {w.companyName && (
                    <p className="text-xs text-muted-foreground">{w.companyName}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">{w.basis}</p>
                </div>
                <Badge tone="success">{w.score}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PortfolioCalendarTable({
  entries,
  summary,
  month,
  params,
}: {
  entries: {
    id: string;
    date: string;
    time?: string;
    title: string;
    status: string;
    platform: string;
    companyName: string;
    businessType: string;
    href: string;
    kind: string;
  }[];
  summary: PortfolioSummary;
  month: string;
  params: Record<string, string | undefined>;
}) {
  const qs = (extra?: Record<string, string>) =>
    new URLSearchParams({ ...params, month, view: "portfolio", ...extra } as Record<string, string>);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total items</p>
            <p className="text-2xl font-bold">{summary.total}</p>
            <p className="text-xs text-muted-foreground">
              {summary.scheduled} scheduled · {summary.planned} planned
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Clients</p>
            <p className="text-2xl font-bold">{summary.byClient.length}</p>
            <p className="truncate text-xs text-muted-foreground">
              {summary.byClient[0]?.name ?? "—"}
              {summary.byClient.length > 1 ? ` +${summary.byClient.length - 1}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Channels</p>
            <p className="text-2xl font-bold">{summary.byChannel.length}</p>
            <p className="truncate text-xs text-muted-foreground">
              {summary.byChannel.map((c) => c.channel).join(", ") || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No items match these portfolio filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Business type</th>
                    <th className="px-4 py-2 font-medium">Channel</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Title</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {e.date}
                        {e.time ? ` ${e.time}` : ""}
                      </td>
                      <td className="px-4 py-2">{e.companyName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.businessType}</td>
                      <td className="px-4 py-2">{e.platform}</td>
                      <td className="px-4 py-2">
                        <Badge tone={e.kind === "post" ? "primary" : "neutral"}>{e.status}</Badge>
                      </td>
                      <td className="max-w-xs truncate px-4 py-2">
                        <Link href={e.href} className="text-primary hover:underline">
                          {e.title}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href={`/calendar?${qs({ view: "month" })}`} className="text-primary hover:underline">
          ← Month grid view
        </Link>
      </p>
    </div>
  );
}
