import Link from "next/link";
import type { AiMosOpportunity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { titleCase } from "@/lib/utils";
import {
  acceptAiMosOpportunityAction,
  dismissAiMosOpportunityAction,
} from "@/app/(app)/ai-mos/actions";

function ActionButtons({ opp }: { opp: AiMosOpportunity }) {
  const idField = <input type="hidden" name="oppId" value={opp.id} />;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <form action={acceptAiMosOpportunityAction}>
        {idField}
        <Button type="submit" size="sm">
          Accept → draft
        </Button>
      </form>
      <form action={dismissAiMosOpportunityAction} className="flex flex-wrap items-center gap-2">
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

export function AiMosOpportunityCard({
  opp,
  companyName,
  compact = false,
}: {
  opp: AiMosOpportunity;
  companyName?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-md border border-border bg-muted/30 p-3"
          : "rounded-md border border-border p-4"
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge tone="primary">P{opp.priority}</Badge>
        <Badge tone="neutral">{titleCase(opp.kind.replace(/_/g, " "))}</Badge>
        {companyName && <Badge tone="info">{companyName}</Badge>}
        <span className={compact ? "text-sm font-medium" : "font-medium"}>{opp.title}</span>
      </div>
      <p className={compact ? "text-xs font-medium text-foreground" : "text-sm font-medium"}>
        Diagnosis
      </p>
      <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {opp.diagnosis}
      </p>
      <p className={`mt-2 ${compact ? "text-xs font-medium" : "text-sm font-medium"}`}>
        Suggested action
      </p>
      <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {opp.suggestedAction.kind === "campaign"
          ? `Draft campaign: ${opp.suggestedAction.goal ?? opp.suggestedAction.objective}`
          : opp.suggestedAction.kind === "content_request"
            ? `Content request (${opp.suggestedAction.requestType ?? "social_post"}): ${opp.suggestedAction.topic ?? opp.title}`
            : `Task: ${opp.suggestedAction.topic ?? opp.title}`}
      </p>
      {opp.evidence.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Evidence ({opp.evidence.length})
          </summary>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {opp.evidence.map((e, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{e.signal}:</span> {e.observed}
                {e.inferred ? ` — ${e.inferred}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!compact && <ActionButtons opp={opp} />}
    </div>
  );
}

export function AiMosOpportunityStrip({
  opps,
  companyById,
  viewAllHref = "/ai-mos",
}: {
  opps: AiMosOpportunity[];
  companyById: Map<string, string>;
  viewAllHref?: string;
}) {
  if (!opps.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          AI-MOS opportunities
        </p>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {opps.slice(0, 3).map((opp) => (
        <AiMosOpportunityCard
          key={opp.id}
          opp={opp}
          companyName={companyById.get(opp.companyId)}
          compact
        />
      ))}
    </div>
  );
}

export function AiMosDashboardPanel({
  opps,
  companyById,
  latestSignalCount = 0,
}: {
  opps: AiMosOpportunity[];
  companyById: Map<string, string>;
  latestSignalCount?: number;
}) {
  if (!opps.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No open opportunities — scan signals to surface diagnosis cards.
        {latestSignalCount > 0
          ? ` ${latestSignalCount} recent signal scan${latestSignalCount === 1 ? "" : "s"} logged.`
          : ""}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {latestSignalCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {latestSignalCount} recent signal scan{latestSignalCount === 1 ? "" : "s"} — suggest-only mode
        </p>
      )}
      {opps.map((opp) => (
        <AiMosOpportunityCard
          key={opp.id}
          opp={opp}
          companyName={companyById.get(opp.companyId)}
        />
      ))}
      <Link href="/ai-mos" className={buttonClasses("outline", "sm")}>
        Manage all opportunities
      </Link>
    </div>
  );
}
