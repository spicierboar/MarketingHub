import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { getAutomationSettings, listAutomationRuns } from "@/lib/db";
import { planIncludesAutomations } from "@/lib/billing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import {
  runAutomationsNowAction,
  saveAutomationSettingsAction,
} from "./actions";
import type { AutomationJobKind } from "@/lib/types";

type JobKey =
  | "draftCampaignSuggestions"
  | "monthlyContentGeneration"
  | "analyticsSummaries"
  | "contentAlerts";

const JOBS: { key: JobKey; label: string; hint: string }[] = [
  { key: "draftCampaignSuggestions", label: "Draft campaign suggestions", hint: "Create draft campaigns (need approval) for companies with none open." },
  { key: "monthlyContentGeneration", label: "Monthly content generation", hint: "Draft a batch of content per company from grounded topic gaps." },
  { key: "analyticsSummaries", label: "Analytics summaries", hint: "Generate a group performance summary each run." },
  { key: "contentAlerts", label: "Content alerts", hint: "Raise repurpose / stale-content / performance recommendations." },
];

const KIND_LABEL: Record<AutomationJobKind, string> = {
  draft_campaign: "Draft campaign",
  monthly_content: "Content draft",
  analytics_summary: "Analytics summary",
  content_alerts: "Alert",
  auto_response: "Auto-approved reply",
};

export default async function AutomationsPage() {
  const user = await requireAdmin();
  const [s, runs, available] = await Promise.all([
    getAutomationSettings(user.tenantId),
    listAutomationRuns(user.tenantId),
    planIncludesAutomations(user.tenantId),
  ]);
  const lastRun = runs[0];

  return (
    <div>
      <PageHeader
        title="Enterprise Automation"
        description="Scheduled AI assistance that drafts campaigns, content, summaries and alerts. It never publishes — every output still needs human approval."
      >
        <Badge tone={!available ? "neutral" : s.enabled ? "success" : "neutral"}>
          {!available ? "Not in plan" : s.enabled ? "Automation ON" : "Automation OFF"}
        </Badge>
      </PageHeader>

      {!available && (
        <div className="mx-6 mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Enterprise Automation isn&apos;t included in your current plan. The tenant
          owner can{" "}
          <Link href="/billing" className="font-medium underline">
            upgrade on the Billing page
          </Link>{" "}
          to enable it. Everything below is read-only until then.
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Run automations now</h2>
                  <p className="text-sm text-muted-foreground">
                    The cron drop-in. Spawns drafts, recommendations and summaries
                    for every AI-ready company — nothing is published.
                  </p>
                </div>
                <form action={runAutomationsNowAction}>
                  <Button type="submit" disabled={!available || !s.enabled}>
                    Run now
                  </Button>
                </form>
              </div>
              {!s.enabled && (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                  Automation is off. Enable it below before running.
                </p>
              )}
            </CardContent>
          </Card>

          {lastRun && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-1 font-semibold">Last run</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  {formatDate(lastRun.createdAt)} · {lastRun.trigger} ·{" "}
                  {lastRun.outcomes.length} outcome(s)
                </p>
                {lastRun.outcomes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing new to do — all suggestions already exist.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {lastRun.outcomes.map((o, i) => (
                      <li key={i} className="text-sm">
                        <Badge tone="info">{KIND_LABEL[o.kind]}</Badge>{" "}
                        {o.companyName && (
                          <span className="text-muted-foreground">{o.companyName}: </span>
                        )}
                        {o.kind === "analytics_summary" ? (
                          <span className="mt-1 block whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-[13px] leading-relaxed">
                            {o.detail}
                          </span>
                        ) : (
                          <span>{o.detail}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {runs.length > 1 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Run history</h2>
                <ul className="space-y-1.5 text-sm">
                  {runs.slice(1, 11).map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {formatDate(r.createdAt)} · {r.trigger}
                      </span>
                      <span>{r.outcomes.length} outcome(s)</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Automation settings</h2>
              <form action={saveAutomationSettingsAction} className="space-y-4">
                <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={s.enabled}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="font-medium">Enable automation</span>
                    <span className="block text-xs text-muted-foreground">
                      Master switch. Off = nothing runs, even &quot;Run now&quot;.
                    </span>
                  </span>
                </label>

                <div className="space-y-2">
                  {JOBS.map((job) => (
                    <label key={job.key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={job.key}
                        defaultChecked={s[job.key]}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        <span className="font-medium">{job.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {job.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    name="lowRiskAutoResponses"
                    defaultChecked={s.lowRiskAutoResponses}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <span className="font-medium text-amber-900">
                      Low-risk auto-responses
                    </span>
                    <span className="block text-xs text-amber-800">
                      Auto-<em>approves</em> (never publishes) low-risk compliment /
                      general-enquiry replies. Paused during crisis, sandbox, or when
                      replies are disabled. Off by default.
                    </span>
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max campaigns / run" htmlFor="maxCampaignsPerRun">
                    <Input
                      id="maxCampaignsPerRun"
                      name="maxCampaignsPerRun"
                      type="number"
                      min={0}
                      max={20}
                      defaultValue={s.maxCampaignsPerRun}
                    />
                  </Field>
                  <Field label="Max drafts / company" htmlFor="maxDraftsPerCompany">
                    <Input
                      id="maxDraftsPerCompany"
                      name="maxDraftsPerCompany"
                      type="number"
                      min={0}
                      max={20}
                      defaultValue={s.maxDraftsPerCompany}
                    />
                  </Field>
                </div>

                <Button type="submit" className="w-full" disabled={!available}>
                  Save settings
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
