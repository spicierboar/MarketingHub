import { requireAdmin } from "@/lib/auth/rbac";
import {
  getMarketingWorkflowSettings,
  listCompanies,
  listCrmContacts,
  listMarketingWorkflows,
  listWorkflowDispatchLogs,
} from "@/lib/db";
import {
  actionKindLabel,
  defaultMarketingWorkflowSettings,
  triggerLabel,
  WORKFLOW_TEMPLATE_KINDS,
  WORKFLOW_TRIGGERS,
  workflowConfigured,
  workflowLive,
} from "@/lib/marketing-automation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  createAgencyTemplateAction,
  createCompanyWorkflowAction,
  deployAgencyTemplateAction,
  runWorkflowAction,
  saveWorkflowSettingsAction,
  updateWorkflowStatusAction,
} from "./actions";

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const selectedId =
    params.company && companies.some((c) => c.id === params.company)
      ? params.company
      : companies[0]?.id;

  const [allWorkflows, agencyTemplates, logs, contacts] = await Promise.all([
    listMarketingWorkflows(user.tenantId, selectedId ? { companyId: selectedId } : undefined),
    listMarketingWorkflows(user.tenantId, { agencyTemplatesOnly: true }),
    selectedId ? listWorkflowDispatchLogs(user.tenantId, selectedId) : Promise.resolve([]),
    selectedId ? listCrmContacts(user.tenantId, selectedId) : Promise.resolve([]),
  ]);
  const companyWorkflows = allWorkflows.filter((w) => w.companyId === selectedId && !w.isAgencyTemplate);
  const settings = selectedId
    ? (await getMarketingWorkflowSettings(selectedId)) ?? defaultMarketingWorkflowSettings(selectedId)
    : null;
  const company = companies.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Workflows"
        description="Trigger-based email/SMS sequences with quiet hours, frequency caps, and consent checks. Simulated until WORKFLOW_LIVE is enabled."
      />
      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4 text-sm">
          <Badge tone={workflowLive() ? "success" : "neutral"}>WORKFLOW_LIVE: {workflowLive() ? "on" : "off"}</Badge>
          <Badge tone={workflowConfigured() ? "success" : "neutral"}>
            Dispatch: {workflowConfigured() ? "live-ready" : "simulated"}
          </Badge>
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label="Company">
          <Select name="company" defaultValue={selectedId ?? ""}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">View</Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Trigger library</h2>
            <ul className="space-y-2 text-sm">
              {WORKFLOW_TRIGGERS.map((t) => (
                <li key={t.kind} className="rounded border p-3">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-muted-foreground">{t.description}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Agency templates</h2>
            <form action={createAgencyTemplateAction} className="flex flex-wrap items-end gap-2">
              <Field label="Template">
                <Select name="templateKind" defaultValue="welcome">
                  {WORKFLOW_TEMPLATE_KINDS.map((k) => (
                    <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary">Create template</Button>
            </form>
            <ul className="space-y-2 text-sm">
              {agencyTemplates.map((w) => (
                <li key={w.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{w.name}</div>
                      <div className="text-muted-foreground">{triggerLabel(w.triggerKind)} · {w.steps.length} steps</div>
                    </div>
                    {selectedId && (
                      <form action={deployAgencyTemplateAction}>
                        <input type="hidden" name="companyId" value={selectedId} />
                        <input type="hidden" name="templateId" value={w.id} />
                        <Button type="submit" size="sm">Deploy</Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
              {agencyTemplates.length === 0 && <p className="text-muted-foreground">No agency templates yet.</p>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {company && settings && (
        <>
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">Company workflows — {company.name}</h2>
              <form action={createCompanyWorkflowAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Name">
                  <Input name="name" placeholder="Optional custom name" />
                </Field>
                <Field label="From template">
                  <Select name="templateKind" defaultValue="welcome">
                    {WORKFLOW_TEMPLATE_KINDS.map((k) => (
                      <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" variant="secondary">Create workflow</Button>
              </form>
              <ul className="space-y-3 text-sm">
                {companyWorkflows.map((w) => (
                  <li key={w.id} className="rounded border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{w.name}</div>
                        <div className="text-muted-foreground">
                          {triggerLabel(w.triggerKind)} · {w.steps.length} steps
                        </div>
                      </div>
                      <StatusBadge status={w.status} />
                    </div>
                    <div className="mt-2 space-y-1">
                      {w.steps.map((s) => (
                        <div key={s.id} className="text-muted-foreground">
                          {s.kind === "action" && s.action ? actionKindLabel(s.action.kind) : s.kind}
                          {s.kind === "delay" && s.delay ? ` — wait ${s.delay.amount} ${s.delay.unit}` : ""}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["draft", "active", "paused"] as const).map((status) => (
                        <form key={status} action={updateWorkflowStatusAction}>
                          <input type="hidden" name="workflowId" value={w.id} />
                          <input type="hidden" name="status" value={status} />
                          <Button type="submit" size="sm" variant={w.status === status ? "default" : "outline"}>
                            {status}
                          </Button>
                        </form>
                      ))}
                      {w.status === "active" && contacts.length > 0 && (
                        <form action={runWorkflowAction} className="flex items-end gap-2">
                          <input type="hidden" name="workflowId" value={w.id} />
                          <Field label="Run for contact">
                            <Select name="contactId" defaultValue={contacts[0]?.id ?? ""}>
                              {contacts.map((c) => (
                                <option key={c.id} value={c.id}>{c.firstName} {c.lastName ?? ""}</option>
                              ))}
                            </Select>
                          </Field>
                          <Button type="submit" size="sm">Run now</Button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
                {companyWorkflows.length === 0 && (
                  <p className="text-muted-foreground">No company workflows yet. Deploy an agency template or create one.</p>
                )}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="text-lg font-semibold">Settings</h2>
                <form action={saveWorkflowSettingsAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Field label="Quiet hours start (HH:MM)">
                    <Input name="quietHoursStart" defaultValue={settings.quietHoursStart} />
                  </Field>
                  <Field label="Quiet hours end (HH:MM)">
                    <Input name="quietHoursEnd" defaultValue={settings.quietHoursEnd} />
                  </Field>
                  <Field label="Frequency cap per week">
                    <Input name="frequencyCapPerWeek" type="number" min={1} defaultValue={settings.frequencyCapPerWeek} />
                  </Field>
                  <Button type="submit">Save settings</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="text-lg font-semibold">Dispatch log</h2>
                <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
                  {logs.slice(0, 30).map((l) => (
                    <li key={l.id} className="rounded border p-2">
                      <div className="flex justify-between gap-2">
                        <StatusBadge status={l.status} />
                        <span className="text-muted-foreground">{formatDate(l.createdAt)}</span>
                      </div>
                      <div>{l.channel} · step {l.stepId}</div>
                      <div className="text-muted-foreground">{l.detail}</div>
                    </li>
                  ))}
                  {logs.length === 0 && <p className="text-muted-foreground">No dispatches yet.</p>}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
