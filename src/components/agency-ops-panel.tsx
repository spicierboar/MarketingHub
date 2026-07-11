import Link from "next/link";
import type { AgencyAlert } from "@/lib/agency-ops";
import { Badge } from "@/components/ui/badge";

const ALERT_TONE: Record<AgencyAlert["kind"], "warning" | "danger" | "info"> = {
  overdue_approval: "danger",
  overdue_client_review: "warning",
  health_attention: "info",
  credit_low: "danger",
  reconnect_needed: "warning",
};

const ALERT_LABEL: Record<AgencyAlert["kind"], string> = {
  overdue_approval: "Approve",
  overdue_client_review: "Review",
  health_attention: "Health",
  credit_low: "Top up",
  reconnect_needed: "Reconnect",
};

export type AttentionExtra = {
  id: string;
  title: string;
  detail: string;
  href: string;
  companyName: string;
};

/**
 * Actionable attention list for the decluttered dashboard.
 * Verb-led titles come from the caller; badges stay short.
 */
export function AgencyAlertsList({
  alerts,
  extras = [],
}: {
  alerts: AgencyAlert[];
  extras?: AttentionExtra[];
}) {
  if (alerts.length === 0 && extras.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Delivery is on track — no exceptions right now.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link
            href={alert.href}
            className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-sm hover:bg-muted"
          >
            <div className="min-w-0">
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={ALERT_TONE[alert.kind]}>{ALERT_LABEL[alert.kind]}</Badge>
                <span className="font-medium leading-snug">{alert.title}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {alert.companyName} · {alert.detail}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">open →</span>
          </Link>
        </li>
      ))}
      {extras.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted"
          >
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="info">AI-MOS</Badge>
                <span className="font-medium">{item.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.companyName} · {item.detail}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">open →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
