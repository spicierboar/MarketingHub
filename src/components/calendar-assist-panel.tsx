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

export function CalendarAssistPanel({
  suggestions,
  companies,
  filterCompanyId,
}: {
  suggestions: CalendarAssistSuggestion[];
  companies: { id: string; name: string }[];
  filterCompanyId?: string;
}) {
  const companyById = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>AI calendar assist (30 days)</CardTitle>
          <CardDescription>
            Suggestions from seasonal prompts, calendar gaps, and{" "}
            <strong>active paid ads</strong> (organic posts that flank the same theme). Accept →
            ai_draft only — never auto-schedules or spends.
          </CardDescription>
        </div>
        <form action={scanCalendarAssistAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Scan company</label>
            <Select name="companyId" defaultValue={filterCompanyId ?? ""} className="h-9 w-44">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm">
            Scan calendar + ads
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open suggestions — run a scan to surface ideas.</p>
        ) : (
          suggestions.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">P{s.priority}</Badge>
                <Badge tone="neutral">{titleCase(s.kind.replace(/_/g, " "))}</Badge>
                <Badge tone="info">{companyById.get(s.companyId) ?? s.companyId}</Badge>
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
