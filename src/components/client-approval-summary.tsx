import { CalendarDays, ImageIcon, Megaphone, RotateCcw } from "lucide-react";
import type { ClientApprovalSummary } from "@/lib/managed-service/client-ux";

export function ClientApprovalSummaryPanel({
  summary,
  hasVisual,
}: {
  summary: ClientApprovalSummary;
  hasVisual: boolean;
}) {
  const rows = [
    {
      icon: Megaphone,
      label: "Purpose",
      value: summary.purpose,
    },
    {
      icon: ImageIcon,
      label: "Channels",
      value: summary.channels.join(" · "),
    },
    {
      icon: CalendarDays,
      label: "Scheduled",
      value: summary.scheduledFor ?? "We’ll confirm the date after approval",
    },
    {
      icon: RotateCcw,
      label: "Changes included",
      value: `${summary.revisionsRemaining} round${summary.revisionsRemaining === 1 ? "" : "s"} remaining`,
    },
  ];

  return (
    <section aria-labelledby="approval-summary" className="rounded-lg border border-border bg-muted/30">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {summary.scopeLabel}
        </p>
        <h2 id="approval-summary" className="text-base font-semibold">
          What you’re approving
        </h2>
      </div>
      <dl className="grid gap-px bg-border sm:grid-cols-2">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex gap-3 bg-card px-4 py-3">
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
      {!hasVisual && (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          No visual is attached to this item. You’re approving the wording and placement shown.
        </p>
      )}
    </section>
  );
}
