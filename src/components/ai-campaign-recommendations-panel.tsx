import Link from "next/link";
import type { AiCampaignRecommendation, AiRecommendationPayload } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { titleCase } from "@/lib/utils";
import { decideAiCampaignRecommendationAction } from "@/app/(app)/campaigns/ai-layer-actions";

function payloadOf(rec: AiCampaignRecommendation): AiRecommendationPayload | null {
  const p = rec.payload;
  if (!p || typeof p !== "object") return null;
  if (!("recommended_actions" in p)) return null;
  return p as AiRecommendationPayload;
}

function DecisionButtons({ rec }: { rec: AiCampaignRecommendation }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <form action={decideAiCampaignRecommendationAction}>
        <input type="hidden" name="recommendationId" value={rec.id} />
        <input type="hidden" name="decision" value="accepted" />
        <Button type="submit" size="sm">
          Accept
        </Button>
      </form>
      <form action={decideAiCampaignRecommendationAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="recommendationId" value={rec.id} />
        <input type="hidden" name="decision" value="rejected" />
        <input
          type="text"
          name="overrideReason"
          placeholder="Reject reason (optional)"
          className="h-8 min-w-[12rem] rounded-md border border-border bg-background px-2 text-xs"
        />
        <Button type="submit" variant="ghost" size="sm">
          Reject
        </Button>
      </form>
    </div>
  );
}

export function AiCampaignRecommendationCard({
  rec,
  companyName,
  showCampaignLink = false,
  compact = false,
}: {
  rec: AiCampaignRecommendation;
  companyName?: string;
  showCampaignLink?: boolean;
  compact?: boolean;
}) {
  const payload = payloadOf(rec);
  const actions = payload?.recommended_actions ?? [];
  const pending = !rec.humanDecision || rec.humanDecision === "pending";

  return (
    <div
      className={
        compact
          ? "rounded-md border border-border bg-muted/30 p-3"
          : "rounded-md border border-border p-4"
      }
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge tone="primary">{titleCase(rec.recommendationType.replace(/_/g, " "))}</Badge>
        {typeof rec.confidenceScore === "number" && (
          <Badge tone="neutral">Conf {(rec.confidenceScore * 100).toFixed(0)}%</Badge>
        )}
        {typeof rec.riskScore === "number" && (
          <Badge tone={rec.riskScore >= 0.6 ? "danger" : "info"}>
            Risk {(rec.riskScore * 100).toFixed(0)}%
          </Badge>
        )}
        {companyName && <Badge tone="info">{companyName}</Badge>}
        {!pending && (
          <Badge tone={rec.humanDecision === "accepted" ? "success" : "neutral"}>
            {titleCase(String(rec.humanDecision))}
          </Badge>
        )}
      </div>
      <p className={compact ? "text-sm font-medium" : "font-medium"}>{rec.summary}</p>
      {rec.expectedOutcome && (
        <p className="mt-1 text-xs text-muted-foreground">{rec.expectedOutcome}</p>
      )}
      {actions.length > 0 && (
        <details className="mt-2" open={!compact}>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Proposed actions ({actions.length})
          </summary>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {actions.map((a, i) => (
              <li key={`${a.action_type}-${i}`}>
                <span className="font-medium text-foreground">
                  {titleCase(a.action_type.replace(/_/g, " "))}
                </span>
                {a.proposed_value ? ` — ${a.proposed_value}` : ""}
                {a.approval_required ? " · approval required" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {showCampaignLink && rec.campaignId && (
        <Link
          href={`/campaigns/${rec.campaignId}`}
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          View campaign →
        </Link>
      )}
      {pending && !compact && <DecisionButtons rec={rec} />}
    </div>
  );
}

export function AiCampaignRecommendationsPanel({
  recommendations,
  companyById,
  title = "AI campaign recommendations",
  emptyMessage = "No pending AI campaign recommendations.",
  showCampaignLink = false,
}: {
  recommendations: AiCampaignRecommendation[];
  companyById?: Map<string, string>;
  title?: string;
  emptyMessage?: string;
  showCampaignLink?: boolean;
}) {
  const pending = recommendations.filter(
    (r) => !r.humanDecision || r.humanDecision === "pending",
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {pending.length > 0 && (
          <Badge tone="info">{pending.length} pending</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Accept creates follow-up tasks only — never publishes, changes budget, or activates
        promotions. Reject records the decision with no execution.
      </p>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {pending.map((rec) => (
            <AiCampaignRecommendationCard
              key={rec.id}
              rec={rec}
              companyName={companyById?.get(rec.companyId)}
              showCampaignLink={showCampaignLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AiCampaignRecommendationsStrip({
  recommendations,
  viewAllHref = "/recommendations",
}: {
  recommendations: AiCampaignRecommendation[];
  viewAllHref?: string;
}) {
  const pending = recommendations.filter(
    (r) => !r.humanDecision || r.humanDecision === "pending",
  );
  if (!pending.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          AI campaign layer
        </p>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {pending.slice(0, 3).map((rec) => (
        <AiCampaignRecommendationCard key={rec.id} rec={rec} compact showCampaignLink />
      ))}
      {pending.length > 3 && (
        <Link href={viewAllHref} className={buttonClasses("outline", "sm")}>
          {pending.length - 3} more…
        </Link>
      )}
    </div>
  );
}
