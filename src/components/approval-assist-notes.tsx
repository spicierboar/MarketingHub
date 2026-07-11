import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";
import type { ApprovalAssist, ApprovalRecommendation } from "@/lib/ai/approval-assist";

const REC_TONE: Record<
  ApprovalRecommendation,
  "success" | "warning" | "danger" | "info"
> = {
  approve: "success",
  edit: "warning",
  reject: "danger",
  escalate: "info",
};

const REC_LABEL: Record<ApprovalRecommendation, string> = {
  approve: "Suggest approve",
  edit: "Suggest edit",
  reject: "Suggest reject",
  escalate: "Suggest escalate",
};

/** Compact triage strip — suggest-only; never replaces Approve/Reject buttons. */
export function ApprovalAssistNotes({ assist }: { assist: ApprovalAssist }) {
  return (
    <div className="mt-3 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">Triage</span>
        <Badge tone={REC_TONE[assist.recommendation]}>
          {REC_LABEL[assist.recommendation]}
        </Badge>
        <span className="text-muted-foreground">({assist.source})</span>
      </div>
      <p className="mt-1 text-muted-foreground">{assist.summary}</p>
      {assist.reasons.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc text-muted-foreground">
          {assist.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {assist.risks.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {assist.risks.length} risk note{assist.risks.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {assist.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground/80">
        Assist only — {titleCase(assist.recommendation)} is a suggestion; you still decide.
      </p>
    </div>
  );
}
