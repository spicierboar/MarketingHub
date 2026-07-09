import Link from "next/link";
import type { Recommendation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { dismissReasonOf, recommendationScore } from "@/lib/recommendations";
import { titleCase } from "@/lib/utils";
import {
  dismissRecommendationAction,
  toCampaignAction,
  toRequestAction,
  toTaskAction,
} from "@/app/(app)/recommendations/actions";

function rankLabel(rec: Recommendation, index: number): string {
  if (rec.score !== undefined) return `#${index + 1}`;
  return `#${index + 1}`;
}

function ActionButtons({ rec }: { rec: Recommendation }) {
  const idField = <input type="hidden" name="recId" value={rec.id} />;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {rec.action.kind === "content_request" && (
        <form action={toRequestAction}>
          {idField}
          <Button type="submit" size="sm">
            Turn into request
          </Button>
        </form>
      )}
      {rec.action.kind === "campaign" && (
        <form action={toCampaignAction}>
          {idField}
          <Button type="submit" size="sm">
            Turn into campaign
          </Button>
        </form>
      )}
      {rec.action.kind === "task" && (
        <form action={toTaskAction}>
          {idField}
          <Button type="submit" size="sm">
            Create task
          </Button>
        </form>
      )}
      {(rec.action.kind === "repurpose" || rec.action.kind === "review") &&
        rec.action.reviewHref && (
          <Link href={rec.action.reviewHref} className={buttonClasses("default", "sm")}>
            {rec.action.kind === "repurpose" ? "Open to repurpose" : "Review"}
          </Link>
        )}
      {rec.action.kind !== "task" && (
        <form action={toTaskAction}>
          {idField}
          <Button type="submit" variant="outline" size="sm">
            Add as task
          </Button>
        </form>
      )}
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
      {!compact && <ActionButtons rec={rec} />}
    </div>
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
          Top recommendations
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
