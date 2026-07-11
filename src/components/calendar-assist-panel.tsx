import Link from "next/link";
import type { CalendarAssistSuggestion } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import {
  acceptCalendarAssistSuggestionAction,
  dismissCalendarAssistSuggestionAction,
  scanCalendarAssistAction,
  scheduleAtOptimalWindowAction,
} from "@/app/(app)/calendar/actions";

function ActionButtons({ suggestion }: { suggestion: CalendarAssistSuggestion }) {
  const idField = <input type="hidden" name="suggestionId" value={suggestion.id} />;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <form action={acceptCalendarAssistSuggestionAction}>
        {idField}
        <Button type="submit" size="sm">
          Accept → ai_draft
        </Button>
      </form>
      <form action={dismissCalendarAssistSuggestionAction} className="flex flex-wrap items-center gap-2">
        {idField}
        <input
          type="text"
          name="dismissReason"
          placeholder="Dismiss reason (optional)"
          className="h-8 min-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
        />
        <Button type="submit" variant="ghost" size="sm">
          Dismiss
        </Button>
      </form>
    </div>
  );
}

export type AssistReadyToSchedule = {
  suggestion: CalendarAssistSuggestion;
  contentId: string;
  contentTitle: string;
  platform: string;
};

export function CalendarAssistPanel({
  suggestions,
  readyToSchedule = [],
  companies,
  filterCompanyId,
  lockCompany = false,
}: {
  suggestions: CalendarAssistSuggestion[];
  readyToSchedule?: AssistReadyToSchedule[];
  companies: { id: string; name: string }[];
  filterCompanyId?: string;
  /** When true (client context), scan only this company — no “All clients”. */
  lockCompany?: boolean;
}) {
  const companyById = new Map(companies.map((c) => [c.id, c.name]));
  const scopedSuggestions = filterCompanyId
    ? suggestions.filter((s) => s.companyId === filterCompanyId)
    : suggestions;
  const scopedReady = filterCompanyId
    ? readyToSchedule.filter((r) => r.suggestion.companyId === filterCompanyId)
    : readyToSchedule;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Agency · AI calendar assist</CardTitle>
          <CardDescription>
            Staff/automation only — not shown to clients. Suggestions from seasonal prompts,
            calendar gaps, and <strong>active paid ads</strong>. Accept → ai_draft only; never
            auto-schedules, auto-approves, or spends.
            {filterCompanyId
              ? " Showing suggestions for the selected client only."
              : ""}
          </CardDescription>
        </div>
        <form action={scanCalendarAssistAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Scan company</label>
            {lockCompany && filterCompanyId ? (
              <>
                <input type="hidden" name="companyId" value={filterCompanyId} />
                <p className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                  {companyById.get(filterCompanyId) ?? "Selected client"}
                </p>
              </>
            ) : (
              <Select name="companyId" defaultValue={filterCompanyId ?? ""} className="h-9 w-44">
                <option value="">All clients</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Button type="submit" size="sm">
            Scan calendar + ads
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-3">
        {scopedReady.length > 0 && (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
              Approved — schedule at best time
            </p>
            {scopedReady.map((row) => (
              <div
                key={row.suggestion.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="success">approved</Badge>
                    {!filterCompanyId && (
                      <Badge tone="info">
                        {companyById.get(row.suggestion.companyId) ?? row.suggestion.companyId}
                      </Badge>
                    )}
                    <Badge tone="neutral">{row.platform}</Badge>
                    <Link href={`/content/${row.contentId}`} className="font-medium hover:underline">
                      {row.contentTitle}
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From assist: {row.suggestion.title}
                  </p>
                </div>
                <form action={scheduleAtOptimalWindowAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="contentId" value={row.contentId} />
                  <input type="hidden" name="platform" value={row.platform} />
                  <Button type="submit" size="sm">
                    Schedule at best time
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}

        {scopedSuggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {scopedReady.length === 0
              ? "No open suggestions — run a scan to surface ideas."
              : "No open suggestions."}
          </p>
        ) : (
          scopedSuggestions.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">P{s.priority}</Badge>
                <Badge tone="neutral">{titleCase(s.kind.replace(/_/g, " "))}</Badge>
                {!filterCompanyId && (
                  <Badge tone="info">{companyById.get(s.companyId) ?? s.companyId}</Badge>
                )}
                <span className="text-xs text-muted-foreground">{s.proposedDate}</span>
                <Badge tone="success">{s.platform}</Badge>
                <span className="font-medium">{s.title}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{s.brief}</p>
              <ActionButtons suggestion={s} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
