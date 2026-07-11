import Link from "next/link";
import type { AgencyPortfolioAttention, Recommendation } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { dismissReasonOf, recommendationScore } from "@/lib/recommendations";
import { titleCase } from "@/lib/utils";
import {
  dismissRecommendationAction,
  snoozeRecommendationAction,
  toCampaignAction,
  toRequestAction,
} from "@/app/(app)/recommendations/actions";

function rankLabel(_rec: Recommendation, index: number): string {
  return `#${index + 1}`;
}

function EvidenceTrail({ rec }: { rec: Recommendation }) {
  const items = rec.evidence ?? [];
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
      {items.map((e, i) => (
        <li key={`${e.signal}-${i}`}>
          <span className="font-medium text-foreground">{titleCase(e.signal.replace(/_/g, " "))}:</span>{" "}
          {e.observed}
          {e.inferred ? ` (${e.inferred})` : ""}
        </li>
      ))}
    </ul>
  );
}

function ActionButtons({ rec }: { rec: Recommendation }) {
  const idField = <input type="hidden" name="recId" value={rec.id} />;
  const kind = rec.action.kind;
  const openHref = rec.action.reviewHref;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {kind === "content_request" && (
        <form action={toRequestAction}>
          {idField}
          <Button type="submit" size="sm">
            Let AI draft
          </Button>
        </form>
      )}
      {kind === "campaign" && (
        <form action={toCampaignAction}>
          {idField}
          <Button type="submit" size="sm">
            Let AI plan campaign
          </Button>
        </form>
      )}
      {kind === "task" && !openHref && (
        <form action={toRequestAction}>
          {idField}
          <Button type="submit" size="sm">
            Let AI draft
          </Button>
        </form>
      )}
      {(kind === "repurpose" || kind === "review" || (kind === "task" && openHref)) &&
        openHref && (
          <Link href={openHref} className={buttonClasses("default", "sm")}>
            {kind === "repurpose" ? "Open to repurpose" : "Open"}
          </Link>
        )}
      <form action={snoozeRecommendationAction} className="flex items-center gap-1">
        {idField}
        <input type="hidden" name="snoozeDays" value="7" />
        <Button type="submit" variant="outline" size="sm">
          Snooze 7d
        </Button>
      </form>
      <form action={dismissRecommendationAction} className="flex flex-wrap items-center gap-2">
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

export function RecommendationCard({
  rec,
  rank,
  compact = false,
}: {
  rec: Recommendation;
  rank: number;
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
        <Badge tone="primary">{rankLabel(rec, rank)}</Badge>
        {recommendationScore(rec) !== undefined && (
          <Badge tone="info">Score {recommendationScore(rec)}</Badge>
        )}
        <Badge tone="neutral">{titleCase(rec.type)}</Badge>
        <span className={compact ? "text-sm font-medium" : "font-medium"}>{rec.title}</span>
      </div>
      <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {rec.rationale}
      </p>
      <EvidenceTrail rec={rec} />
      {!compact && <ActionButtons rec={rec} />}
    </div>
  );
}

export function AgencyPortfolioStrip({ rows }: { rows: AgencyPortfolioAttention[] }) {
  const active = rows.filter((r) => r.openCount > 0 || r.snoozedCount > 0);
  if (!active.length) return null;
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agency portfolio attention
        </p>
        <div className="flex flex-wrap gap-2">
          {active.map((row) => (
            <div
              key={row.companyId}
              className="min-w-[10rem] rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <p className="font-medium">{row.companyName}</p>
              <p className="text-xs text-muted-foreground">{row.headline}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RecommendationStrip({
  recs,
  companyId,
  viewAllHref = "/recommendations",
}: {
  recs: Recommendation[];
  companyId: string;
  viewAllHref?: string;
}) {
  const open = recs
    .filter((r) => r.companyId === companyId && r.status === "open")
    .sort((a, b) => (recommendationScore(b) ?? 0) - (recommendationScore(a) ?? 0))
    .slice(0, 3);
  if (!open.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Top AI next steps
        </p>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {open.map((rec, i) => (
        <RecommendationCard key={rec.id} rec={rec} rank={i} compact />
      ))}
    </div>
  );
}
