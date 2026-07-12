import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type {
  DetailedMarketingStrategy,
  DetailedStrategyStatus,
} from "@/lib/types";

function statusLabel(status: DetailedStrategyStatus): string {
  switch (status) {
    case "client_review":
      return "in client review";
    case "approved":
      return "approved";
    case "changes_requested":
      return "changes requested";
    default:
      return "draft";
  }
}

function statusTone(
  status: DetailedStrategyStatus,
): "success" | "warning" | "info" | "neutral" {
  if (status === "approved") return "success";
  if (status === "client_review") return "info";
  if (status === "changes_requested") return "warning";
  return "neutral";
}

function statusHint(status: DetailedStrategyStatus, audience: "agency" | "client"): string {
  if (status === "client_review") {
    return audience === "client"
      ? "Awaiting your approval. Nothing publishes until you approve."
      : "Awaiting client approval. They'll be notified automatically.";
  }
  if (status === "approved") {
    return "Strategy approved — content still needs per-item approval before publish.";
  }
  if (status === "changes_requested") {
    return audience === "client"
      ? "You asked for changes — your agency will revise and resubmit."
      : "Client requested changes — regenerate or revise, then resubmit.";
  }
  return "Agency draft — submit to client when ready.";
}

export function DetailedStrategyDocument({
  doc,
  audience,
  versions,
  listHref,
  versionHref,
  showingList,
  lifecycleActions,
}: {
  doc: DetailedMarketingStrategy | null;
  audience: "agency" | "client";
  versions: DetailedMarketingStrategy[];
  /** Link back to strategy list (omit version query). */
  listHref: string;
  versionHref: (version: number) => string;
  showingList: boolean;
  lifecycleActions?: ReactNode;
}) {
  if (showingList || !doc) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">All strategies</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Version history for this client — open the latest for the full plan.
            </p>
          </div>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No strategy versions yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {versions.map((v) => (
                <li key={`${v.id}-${v.version}`}>
                  <Link
                    href={versionHref(v.version)}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted/40"
                  >
                    <span className="font-medium">{v.title}</span>
                    <span className="text-xs text-muted-foreground">
                      v{v.version} · {formatDate(v.generatedAt)} · {statusLabel(v.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{doc.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {doc.packageName} · Version {doc.version} · Generated {formatDate(doc.generatedAt)}
            {doc.model !== "template" ? ` · ${doc.model}` : ""}
          </p>
        </div>
        <Badge tone={statusTone(doc.status)}>{statusLabel(doc.status)}</Badge>
      </div>

      {versions.length > 1 ? (
        <Link
          href={listHref}
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← All strategies
        </Link>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold">AI-Generated Executive Summary</h3>
          <p className="text-sm leading-relaxed text-foreground/90">{doc.executiveSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold">Business Objectives</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            {doc.businessObjectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="text-sm font-semibold">Target Audience</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {doc.personas.map((p) => (
              <div key={p.name} className="space-y-1.5 border-l-2 border-border pl-3">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.demographics}</p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Motivations: </span>
                  {p.motivations}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Pain points: </span>
                  {p.painPoints}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="text-sm font-semibold">Channel Strategy</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {doc.channels.map((ch) => (
              <div key={ch.channel} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{ch.channel}</p>
                  <span className="text-xs text-muted-foreground">
                    {ch.tactics.length} tactic{ch.tactics.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{ch.rationale}</p>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {ch.tactics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 p-6">
          <h3 className="text-sm font-semibold">Marketing Roadmap</h3>
          {doc.roadmap.map((phase) => (
            <div key={phase.key} className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <p className="font-medium">{phase.title}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Objectives
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {phase.objectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Key activities
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {phase.activities.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    KPIs
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {phase.kpis.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold">Lifecycle</h3>
          <p className="text-sm text-muted-foreground">
            Manage the approval &amp; automation pipeline.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(doc.status)}>{statusLabel(doc.status)}</Badge>
            <span className="text-sm text-muted-foreground">
              {statusHint(doc.status, audience)}
            </span>
          </div>
          {doc.clientNote ? (
            <p className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-950">
              Client note: {doc.clientNote}
            </p>
          ) : null}
          {lifecycleActions}
        </CardContent>
      </Card>
    </div>
  );
}

export function StrategyLifecycleActions({
  status,
  audience,
  approveAction,
  changesAction,
  submitAction,
}: {
  status: DetailedStrategyStatus;
  audience: "agency" | "client";
  approveAction?: ReactNode;
  changesAction?: ReactNode;
  submitAction?: ReactNode;
}) {
  if (audience === "client" && status === "client_review") {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        {approveAction}
        {changesAction}
      </div>
    );
  }
  if (audience === "agency" && (status === "draft" || status === "changes_requested")) {
    return <div className="pt-1">{submitAction}</div>;
  }
  if (audience === "agency" && status === "client_review") {
    return (
      <p className="text-xs text-muted-foreground">
        When the client approves, content drafting continues under the usual gates.
      </p>
    );
  }
  return null;
}

export function StrategyStatusShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {children}
      {footer ? <div className="flex flex-wrap gap-2">{footer}</div> : null}
    </div>
  );
}

/** Compact CTA button helpers used by pages with server-action forms. */
export function StrategyActionButton({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button type="submit" size="sm" variant={variant}>
      {label}
    </Button>
  );
}
