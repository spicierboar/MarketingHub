import Link from "next/link";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { retryFailedPublishingAction } from "@/app/(app)/publishing/actions";
import { sendDueApprovalRemindersAction } from "@/app/(app)/dashboard/actions";
import {
  loadAgencyControlPlane,
  type ControlPlaneException,
  type ControlPlaneMetric,
} from "@/lib/agency-control-plane";

function metricTone(metric: ControlPlaneMetric): string {
  if (metric.tone === "danger") return "border-red-500/30 bg-red-500/5";
  if (metric.tone === "warning") return "border-amber-500/30 bg-amber-500/5";
  if (metric.tone === "good") return "border-emerald-500/30 bg-emerald-500/5";
  return "border-border bg-card";
}

function riskTone(
  risk: ControlPlaneException["risk"],
): "danger" | "warning" | "info" {
  if (risk === "critical") return "danger";
  if (risk === "high") return "warning";
  return "info";
}

function queueLoad(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} staff hours`;
}

export async function AgencyControlPlane({
  tenantId,
  firstName,
}: {
  tenantId: string;
  firstName: string;
}) {
  const snapshot = await loadAgencyControlPlane(tenantId);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        explainerId="dashboard"
        explainer="Managed work advances on schedule. This home shows portfolio coverage and only the exceptions that need a staff decision."
      >
        <Link href="/companies" className={buttonClasses("outline", "sm")}>
          Client directory
        </Link>
      </PageHeader>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-5 lg:p-6">
        <section aria-labelledby="portfolio-control">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="portfolio-control" className="text-base font-semibold">
                Portfolio control
              </h2>
              <p className="text-sm text-muted-foreground">
                Tenant-scoped measures calculated from service, strategy, calendar,
                approval, job, and publishing records.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {snapshot.managedClients.toLocaleString()} managed clients in scope
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {snapshot.metrics.map((metric) => (
              <Card key={metric.label} className={metricTone(metric)}>
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {metric.detail}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section aria-labelledby="automatic-work">
            <Card className="h-full border-emerald-500/30 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle id="automatic-work" className="text-base">
                      Running automatically
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      These clients have current control records and no open
                      operational exception.
                    </p>
                  </div>
                  <span className="text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {snapshot.runningAutomatically.toLocaleString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Calendars are topped up, approved work advances, due reminders
                  are sent, and eligible publishing retries are handled by the
                  scheduled operating loop.
                </p>
                <p className="rounded-md border border-emerald-500/20 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Approvals, payment status, quality controls, and publishing
                  safeguards remain in force. Automation does not bypass them.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/automations" className={buttonClasses("outline", "sm")}>
                    Automation settings
                  </Link>
                  <Link href="/calendar" className={buttonClasses("ghost", "sm")}>
                    Calendar coverage
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="attention-queue">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle id="attention-queue" className="text-base">
                      Needs staff attention
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Risk-ranked exceptions only. Normal work is deliberately
                      omitted.
                    </p>
                  </div>
                  <Badge tone={snapshot.exceptionTotal > 0 ? "warning" : "neutral"}>
                    {snapshot.exceptionTotal.toLocaleString()} exceptions
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="rounded-md bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Queue load</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {queueLoad(snapshot.queueMinutes)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Ownership</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {snapshot.unassignedCount} unassigned
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Oldest age</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {snapshot.oldestAgeDays} days
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Bottleneck</dt>
                    <dd className="truncate text-sm font-semibold">
                      {snapshot.bottleneckStage ?? "None"}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Clients affected</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {snapshot.exceptionClients}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </section>
        </div>

        <section aria-labelledby="bulk-operations">
          <div className="mb-2">
            <h2 id="bulk-operations" className="text-sm font-semibold">
              Governed queue actions
            </h2>
            <p className="text-xs text-muted-foreground">
              These actions run existing tenant-scoped services. They do not
              approve content, resume paused service, or bypass publishing limits.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
            <form action={retryFailedPublishingAction}>
              <ActionSubmitButton
                size="sm"
                variant="outline"
                pendingLabel="Running publishing queue…"
                disabled={snapshot.retryablePublishingCount === 0}
              >
                Retry eligible publishing ({snapshot.retryablePublishingCount})
              </ActionSubmitButton>
            </form>
            <form action={sendDueApprovalRemindersAction}>
              <ActionSubmitButton
                size="sm"
                variant="outline"
                pendingLabel="Sending due reminders…"
                disabled={snapshot.dueReminderCount === 0}
              >
                Send due reminders ({snapshot.dueReminderCount})
              </ActionSubmitButton>
            </form>
            <span className="text-xs text-muted-foreground">
              Rolling calendar extension continues on the scheduled operating loop.
            </span>
          </div>
        </section>

        <section aria-labelledby="ranked-exceptions">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="ranked-exceptions" className="text-sm font-semibold">
                Risk-ranked exception queue
              </h2>
              <p className="text-xs text-muted-foreground">
                Showing the first {snapshot.exceptions.length} of{" "}
                {snapshot.exceptionTotal}; critical risk and oldest age first.
              </p>
            </div>
            <Link href="/companies" className="text-xs font-medium text-primary hover:underline">
              Open client directory
            </Link>
          </div>
          {snapshot.exceptions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No staff exceptions are open. Managed work continues automatically.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[860px] text-left text-sm">
                <caption className="sr-only">
                  Managed-service exceptions ranked by operational risk
                </caption>
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Risk</th>
                    <th scope="col" className="px-3 py-2 font-medium">Exception</th>
                    <th scope="col" className="px-3 py-2 font-medium">Stage</th>
                    <th scope="col" className="px-3 py-2 font-medium">Salesperson</th>
                    <th scope="col" className="px-3 py-2 font-medium">SLA</th>
                    <th scope="col" className="px-3 py-2 font-medium">Age</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snapshot.exceptions.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 align-top">
                        <Badge tone={riskTone(item.risk)}>{item.risk}</Badge>
                      </td>
                      <td className="max-w-md px-3 py-3 align-top">
                        <p className="font-medium">{item.title} · {item.companyName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top">{item.stage}</td>
                      <td className="px-3 py-3 align-top">{item.owner}</td>
                      <td className="px-3 py-3 align-top text-xs">{item.sla}</td>
                      <td className="px-3 py-3 align-top tabular-nums">
                        {item.ageDays}d
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        <Link
                          href={item.href}
                          className="font-medium text-primary hover:underline"
                        >
                          Review
                          <span className="sr-only">
                            {" "}{item.title} for {item.companyName}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="secondary-tools"
          className="border-t border-border pt-4"
        >
          <h2 id="secondary-tools" className="text-sm font-semibold">
            Client detail and manual tools
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use these for investigation or deliberate intervention after working
            the exception queue.
          </p>
          <nav aria-label="Secondary operations tools" className="mt-2 flex flex-wrap gap-2">
            <Link href="/companies" className={buttonClasses("ghost", "sm")}>Clients</Link>
            <Link href="/content" className={buttonClasses("ghost", "sm")}>Content</Link>
            <Link href="/approvals" className={buttonClasses("ghost", "sm")}>Approvals</Link>
            <Link href="/publishing" className={buttonClasses("ghost", "sm")}>Publishing</Link>
            <Link href="/billing" className={buttonClasses("ghost", "sm")}>Billing</Link>
          </nav>
        </section>
      </main>
    </div>
  );
}
