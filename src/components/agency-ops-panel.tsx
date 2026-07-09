import Link from "next/link";
import type {
  AgencyAlert,
  AgencyContentTemplate,
  AgencyWorkloadSummary,
} from "@/lib/agency-ops";
import type { CompanyHealthScore } from "@/lib/health-scores";
import { HealthAttentionList } from "@/components/health-score-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import {
  applyAgencyTemplateAction,
  createAgencyTemplateAction,
} from "@/app/(app)/dashboard/actions";

const ALERT_TONE: Record<AgencyAlert["kind"], "warning" | "danger" | "info"> = {
  overdue_approval: "danger",
  overdue_client_review: "warning",
  health_attention: "info",
};

const ALERT_LABEL: Record<AgencyAlert["kind"], string> = {
  overdue_approval: "Overdue approval",
  overdue_client_review: "Client review",
  health_attention: "Health score",
};

const REQUEST_TYPES = [
  ["social_post", "Social media post"],
  ["email_newsletter", "Email newsletter"],
  ["blog_article", "Blog article"],
  ["ad_copy", "Ad copy"],
  ["campaign", "Campaign brief"],
] as const;

export function AgencyWorkloadStrip({ workload }: { workload: AgencyWorkloadSummary }) {
  const stats = [
    { label: "Pending approvals", value: workload.pendingApprovals },
    { label: "Overdue", value: workload.overdueApprovals, tone: workload.overdueApprovals ? "danger" as const : undefined },
    { label: "Client reviews", value: workload.pendingClientReviews },
    { label: "Open requests", value: workload.openRequests },
    { label: "Low health", value: workload.clientsNeedingAttention },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</p>
          {s.tone && s.value > 0 && (
            <Badge tone={s.tone} className="mt-1">
              Action needed
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

export function AgencyAlertsList({ alerts }: { alerts: AgencyAlert[] }) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No overdue approvals or urgent portfolio alerts — approvals queue is on track.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <Link
            href={alert.href}
            className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted"
          >
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone={ALERT_TONE[alert.kind]}>{ALERT_LABEL[alert.kind]}</Badge>
                <span className="font-medium">{alert.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {alert.companyName} · {alert.detail}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">view →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AgencyTemplateLibrary({
  templates,
  companies,
}: {
  templates: AgencyContentTemplate[];
  companies: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-semibold">Reusable content templates</h3>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tenant-wide templates yet — create one to speed up content requests across clients.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((tpl) => (
              <li key={tpl.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tpl.name}</span>
                  <Badge tone="neutral">{titleCase(tpl.contentType)}</Badge>
                  {tpl.channel && <Badge tone="info">{tpl.channel}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tpl.topic}</p>
                <form action={applyAgencyTemplateAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="templateId" value={tpl.id} />
                  <Field label="Apply to company" htmlFor={`company-${tpl.id}`} className="min-w-[10rem] flex-1">
                    <Select id={`company-${tpl.id}`} name="companyId" required defaultValue={companies[0]?.id}>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" size="sm" disabled={companies.length === 0}>
                    Apply → request
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Create template</h3>
        <form action={createAgencyTemplateAction}>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Field label="Template name" htmlFor="templateName">
                <Input id="templateName" name="name" required placeholder="e.g. Monthly member newsletter" />
              </Field>
              <Field label="Request type" htmlFor="contentType">
                <Select id="contentType" name="contentType" required defaultValue="social_post">
                  {REQUEST_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Topic" htmlFor="topic">
                <Input id="topic" name="topic" required placeholder="Key message or headline angle" />
              </Field>
              <Field label="Objective" htmlFor="objective">
                <Textarea id="objective" name="objective" required placeholder="What should this achieve?" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Audience" htmlFor="audience">
                  <Input id="audience" name="audience" placeholder="Optional" />
                </Field>
                <Field label="Channel" htmlFor="channel">
                  <Input id="channel" name="channel" placeholder="Facebook, Email…" />
                </Field>
              </div>
              <Button type="submit" size="sm">
                Save template
              </Button>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}

export function AgencyOpsSection({
  workload,
  alerts,
  templates,
  needsAttention,
  companies,
}: {
  workload: AgencyWorkloadSummary;
  alerts: AgencyAlert[];
  templates: AgencyContentTemplate[];
  needsAttention: CompanyHealthScore[];
  companies: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div>
            <h2 className="font-semibold">Agency operations</h2>
            <p className="text-sm text-muted-foreground">
              Portfolio workload, overdue approvals, and reusable content briefs across clients.
            </p>
          </div>
          <AgencyWorkloadStrip workload={workload} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Alerts</h2>
              <Link href="/approvals" className="text-sm text-primary hover:underline">
                Approval inbox
              </Link>
            </div>
            <AgencyAlertsList alerts={alerts} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Clients needing attention</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Lowest marketing-health scores (publishing, approvals, paid ROAS, leads).
            </p>
            <HealthAttentionList items={needsAttention} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <AgencyTemplateLibrary templates={templates} companies={companies} />
        </CardContent>
      </Card>
    </div>
  );
}
