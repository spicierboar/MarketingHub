import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CompanyHealthScore } from "@/lib/health-scores";

function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

export function HealthScoreCard({
  health,
  compact,
}: {
  health: CompanyHealthScore;
  compact?: boolean;
}) {
  const tone = scoreTone(health.score);

  return (
    <Card className={health.needsAttention ? "border-amber-200" : undefined}>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Marketing health</CardTitle>
            <CardDescription>
              Publishing · approvals · paid ROAS · leads
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums">{health.score}</p>
            <Badge tone={tone}>{health.needsAttention ? "Needs attention" : "On track"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              tone === "success"
                ? "bg-emerald-500"
                : tone === "warning"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${health.score}%` }}
          />
        </div>
        {!compact && (
          <ul className="space-y-2.5 text-sm">
            {health.factors.map((f) => (
              <li key={f.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{f.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    +{f.contribution}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{f.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function HealthAttentionList({
  items,
}: {
  items: CompanyHealthScore[];
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All clients are above the health threshold — no urgent attention needed.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.companyId}>
          <Link
            href={`/companies/${h.companyId}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted"
          >
            <span className="font-medium">{h.companyName}</span>
            <span className="flex items-center gap-2">
              <Badge tone={scoreTone(h.score)}>{h.score}</Badge>
              <span className="text-xs text-muted-foreground">view →</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
