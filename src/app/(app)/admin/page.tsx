import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  aiSpendThisMonth,
  getCompany,
  getSecuritySettings,
  listAiRuns,
  listCampaigns,
  listCompanies,
  listConsents,
  listContent,
  listIntegrations,
  listLegalHolds,
  listScheduledPosts,
  listUsers,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { formatDate, now } from "@/lib/utils";
import {
  saveSecuritySettingsAction,
  toggleCrisisAction,
  toggleSandboxAction,
  beginMfaEnrollmentAction,
  completeMfaEnrollmentAction,
  startImpersonationAction,
  stopImpersonationAction,
} from "./actions";
import {
  buildIntegrationHealthAlerts,
  buildIntegrationHealthBundle,
  getActiveImpersonation,
  getMfaEnrollment,
  listImpersonationAudit,
  mfaIdpConfigured,
} from "@/lib/security-slice";
import {
  SecurityHealthPanel,
  IntegrationHealthAlertsPanel,
  MfaEnrollmentPanel,
  ImpersonationAuditPanel,
} from "@/components/security-health-panel";

const money = (x: number) => `$${x.toFixed(2)}`;

export default async function AdminPage() {
  const user = await requireAdmin();
  const s = await getSecuritySettings(user.tenantId);
  const spend = await aiSpendThisMonth(user.tenantId);
  const posts = await listScheduledPosts(user.tenantId);
  const integrations = await listIntegrations(user.tenantId);
  const holds = await listLegalHolds(user.tenantId, true);
  const integrationHealth = buildIntegrationHealthBundle(user.tenantId);
  const integrationAlerts = buildIntegrationHealthAlerts(integrationHealth);
  const mfaEnrollment = getMfaEnrollment(user.tenantId, user.id);
  const impersonationAudit = listImpersonationAudit(user.tenantId);
  const activeImpersonation = getActiveImpersonation(user.id);
  const tenantUsers = await listUsers(user.tenantId);
  const today = now().slice(0, 10);

  // System health (Support Admin Console, §55).
  const failedPosts = posts.filter((p) => p.status === "failed").length;
  const deadPosts = posts.filter((p) => p.status === "dead").length;
  const health = [
    { label: "Publishing failures", value: failedPosts, bad: failedPosts > 0 },
    { label: "Dead-letter posts", value: deadPosts, bad: deadPosts > 0 },
    {
      label: "Integrations connected",
      value: `${integrations.filter((i) => i.status === "connected").length}/${integrations.length}`,
    },
    { label: "AI runs (all time)", value: (await listAiRuns(user.tenantId)).length },
    { label: "Content items", value: (await listContent(user.tenantId)).length },
    { label: "Campaigns", value: (await listCampaigns(user.tenantId)).length },
    { label: "Active legal holds", value: holds.length, bad: holds.length > 0 },
  ];

  // Login & session activity (§10 login logs / failed-login monitoring).
  const loginEvents = (await listAudit(user.tenantId))
    .filter((e) => e.action.startsWith("user.login") || e.action === "user.sessions_revoked")
    .slice(0, 8);

  // Privacy review queue (§53) — consents needing attention across companies.
  const privacyQueue: { company: string; person: string; issue: string }[] = [];
  for (const c of await listCompanies(user.tenantId)) {
    for (const con of await listConsents(c.id)) {
      let issue = "";
      if (con.withdrawn) issue = "Withdrawn";
      else if (!con.consentObtained) issue = "Not obtained";
      else if (con.expiryDate && con.expiryDate < today) issue = `Expired ${con.expiryDate}`;
      if (issue) privacyQueue.push({ company: c.name, person: con.personShown, issue });
    }
  }

  return (
    <div>
      <PageHeader
        title="Admin & Security"
        description="Crisis controls, sandbox, data retention, AI cost caps, system health, and governance registers."
      >
        <a href="/api/export/audit.csv" className={buttonClasses("outline")}>
          Export audit log (CSV)
        </a>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Security controls */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className={s.crisisMode ? "border-red-300" : ""}>
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Crisis Communications Mode</h2>
                <Badge tone={s.crisisMode ? "danger" : "neutral"}>
                  {s.crisisMode ? "ACTIVE" : "Off"}
                </Badge>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Freezes all publishing and escalates every social reply for senior
                review (§33).
              </p>
              <form action={toggleCrisisAction} className="space-y-2">
                {!s.crisisMode && (
                  <Input name="note" placeholder="Incident note (optional)" />
                )}
                {s.crisisMode && s.crisisNote && (
                  <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
                    {s.crisisNote}
                  </p>
                )}
                <Button type="submit" variant={s.crisisMode ? "destructive" : "default"}>
                  {s.crisisMode ? "Lift crisis mode" : "Activate crisis mode"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className={s.sandboxMode ? "border-amber-300" : ""}>
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Sandbox / training mode</h2>
                <Badge tone={s.sandboxMode ? "warning" : "neutral"}>
                  {s.sandboxMode ? "ACTIVE" : "Off"}
                </Badge>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                Blocks publishing so teams can train and test safely (§56).
              </p>
              <form action={toggleSandboxAction}>
                <Button type="submit" variant={s.sandboxMode ? "destructive" : "outline"}>
                  {s.sandboxMode ? "Exit sandbox mode" : "Enter sandbox mode"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Retention + AI cap */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Data retention &amp; AI cost limits</h2>
            <form action={saveSecuritySettingsAction} className="grid gap-4 sm:grid-cols-3">
              <Field label="Data retention (days)" htmlFor="retentionDays" hint="§53 retention policy">
                <Input id="retentionDays" name="retentionDays" type="number" min={30} defaultValue={s.retentionDays} />
              </Field>
              <Field label="AI monthly cost cap (AUD)" htmlFor="aiMonthlyCapUsd" hint="0 = uncapped">
                <Input id="aiMonthlyCapUsd" name="aiMonthlyCapUsd" type="number" min={0} defaultValue={s.aiMonthlyCapUsd} />
              </Field>
              <div className="flex items-end">
                <div className="text-sm">
                  <p className="text-muted-foreground">This month's AI spend</p>
                  <p className={`text-lg font-bold ${s.aiMonthlyCapUsd > 0 && spend >= s.aiMonthlyCapUsd ? "text-red-600" : ""}`}>
                    {money(spend)}
                    {s.aiMonthlyCapUsd > 0 && ` / ${money(s.aiMonthlyCapUsd)}`}
                  </p>
                </div>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit">Save settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* System health */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              System health (Support Console)
            </h2>
            <Link href="/publishing" className="text-sm text-primary hover:underline">
              Publishing Centre →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {health.map((h) => (
              <Card key={h.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${h.bad ? "text-red-600" : ""}`}>
                    {h.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <SecurityHealthPanel bundle={integrationHealth} />

        <IntegrationHealthAlertsPanel alertBundle={integrationAlerts} />

        <div className="grid gap-6 lg:grid-cols-2">
          <MfaEnrollmentPanel
            enrollment={mfaEnrollment}
            idpConfigured={mfaIdpConfigured()}
            beginAction={beginMfaEnrollmentAction}
            completeAction={completeMfaEnrollmentAction}
          />
          <ImpersonationAuditPanel
            audit={impersonationAudit}
            tenantUsers={tenantUsers.filter((u) => u.id !== user.id)}
            activeTargetUserId={activeImpersonation?.targetUserId ?? null}
            startAction={startImpersonationAction}
            stopAction={stopImpersonationAction}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Login activity */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Login &amp; session activity</h2>
              <ul className="space-y-2 text-sm">
                {loginEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <Badge tone={e.action === "user.login_failed" ? "danger" : "neutral"}>
                        {e.action.replace("user.", "")}
                      </Badge>{" "}
                      <span className="text-muted-foreground">{e.actorEmail}</span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(e.createdAt)}
                    </span>
                  </li>
                ))}
                {loginEvents.length === 0 && (
                  <li className="text-muted-foreground">No login activity recorded.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* Privacy review queue */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Privacy &amp; consent review</h2>
                <Badge tone={privacyQueue.length ? "warning" : "success"}>
                  {privacyQueue.length}
                </Badge>
              </div>
              {privacyQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No consent records need attention.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {privacyQueue.map((q, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        {q.person} <span className="text-muted-foreground">· {q.company}</span>
                      </span>
                      <Badge tone="danger">{q.issue}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Data retention policy: {s.retentionDays} days.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/legal-hold" className={buttonClasses("outline")}>
            Legal Hold registry ({holds.length} active)
          </Link>
          <Link href="/users" className={buttonClasses("outline")}>
            Roles &amp; users
          </Link>
          <Link href="/audit" className={buttonClasses("outline")}>
            Full audit log
          </Link>
        </div>
      </div>
    </div>
  );
}
