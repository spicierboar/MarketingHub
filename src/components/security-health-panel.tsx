import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import type {
  ImpersonationAuditRecord,
  IntegrationHealthAlert,
  IntegrationHealthAlertBundle,
  IntegrationHealthBundle,
  IntegrationHealthRow,
  MfaEnrollmentRecord,
} from "@/lib/security-slice";
import type { PublishingPlatformHealthRow } from "@/lib/publishing-connectors";
import type { User } from "@/lib/types";

function statusTone(
  status: IntegrationHealthRow["status"] | PublishingPlatformHealthRow["status"],
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "healthy":
      return "success";
    case "degraded":
      return "danger";
    case "simulated":
      return "warning";
    case "offline":
      return "neutral";
  }
}

function statusLabel(
  status: IntegrationHealthRow["status"] | PublishingPlatformHealthRow["status"],
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "simulated":
      return "Simulated";
    case "offline":
      return "Offline";
  }
}

export function SecurityHealthPanel({
  bundle,
  title = "Integration health",
  description = "Live gates, provider status, and last recorded failure (simulated hints when live is off).",
}: {
  bundle: IntegrationHealthBundle;
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge tone={bundle.aiProviderConfigured ? "success" : "warning"}>
            AI key {bundle.aiProviderConfigured ? "configured" : "template mode"}
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">Integration</th>
                <th className="pb-2 pr-4 font-medium">Gate</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium">Last failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bundle.rows.map((row) => (
                <tr key={row.kind} className="align-top">
                  <td className="py-3 pr-4 font-medium">{row.label}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={row.live ? "success" : "neutral"}>
                      {row.live ? "Live" : "Off"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                  </td>
                  <td className="max-w-md py-3 pr-4 text-muted-foreground">
                    {row.lastFailureMessage ? (
                      <>
                        <p className="line-clamp-3">{row.lastFailureMessage}</p>
                        {row.lastFailureAt && (
                          <p className="mt-1 text-xs">{formatDate(row.lastFailureAt)}</p>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {bundle.publishingPlatforms.map((row) => (
                <tr key={`pub-${row.platform}`} className="align-top bg-muted/30">
                  <td className="py-3 pr-4 pl-4 text-muted-foreground">
                    <span className="text-xs">↳</span> {row.label}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={row.liveEligible ? "success" : "neutral"}>
                      {row.liveEligible ? "Live" : "Off"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {row.oauthConfigured ? "OAuth configured" : "OAuth not configured"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Snapshot {formatDate(bundle.computedAt)} · tenant {bundle.tenantId}
        </p>
      </CardContent>
    </Card>
  );
}

function alertTone(severity: IntegrationHealthAlert["severity"]): "success" | "warning" | "danger" | "neutral" {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    case "info":
      return "neutral";
  }
}

export function IntegrationHealthAlertsPanel({
  alertBundle,
}: {
  alertBundle: IntegrationHealthAlertBundle;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Integration health alerts</h2>
            <p className="text-sm text-muted-foreground">
              Threshold-based alerts from the integration health bundle (degraded, offline, prior failures).
            </p>
          </div>
          <Badge tone={alertBundle.alerts.length ? "warning" : "success"}>
            {alertBundle.alerts.length} alert{alertBundle.alerts.length === 1 ? "" : "s"}
          </Badge>
        </div>
        {alertBundle.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No integration alerts — all gates within thresholds.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alertBundle.alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3"
              >
                <span>
                  <Badge tone={alertTone(a.severity)}>{a.severity}</Badge>{" "}
                  <span className="font-medium">{a.message}</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.kind !== "aggregate" ? `${a.kind} · ` : ""}
                    threshold {a.threshold}
                  </p>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Degraded {alertBundle.degradedCount} · offline {alertBundle.offlineCount} ·{" "}
          {formatDate(alertBundle.computedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

function mfaStatusTone(status: MfaEnrollmentRecord["status"]): "success" | "warning" | "neutral" {
  switch (status) {
    case "enabled":
      return "success";
    case "pending":
      return "warning";
    case "not_enrolled":
      return "neutral";
  }
}

function mfaStatusLabel(status: MfaEnrollmentRecord["status"]): string {
  switch (status) {
    case "enabled":
      return "Enabled";
    case "pending":
      return "Pending";
    case "not_enrolled":
      return "Not enrolled";
  }
}

export function MfaEnrollmentPanel({
  enrollment,
  idpConfigured,
  beginAction,
  completeAction,
}: {
  enrollment: MfaEnrollmentRecord;
  idpConfigured: boolean;
  beginAction: () => void;
  completeAction: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">MFA enrollment (OAuth-only)</h2>
            <p className="text-sm text-muted-foreground">
              Multi-factor via external OAuth IdP — no passwords stored in Command Centre.
            </p>
          </div>
          <Badge tone={idpConfigured ? "success" : "warning"}>
            IdP {idpConfigured ? "configured" : "stub"}
          </Badge>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={mfaStatusTone(enrollment.status)}>{mfaStatusLabel(enrollment.status)}</Badge>
          <span className="text-xs text-muted-foreground">
            Method {enrollment.method} · updated {formatDate(enrollment.updatedAt)}
          </span>
        </div>
        {enrollment.stubReason && (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{enrollment.stubReason}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={beginAction}>
            <Button type="submit" variant="outline" disabled={enrollment.status === "enabled"}>
              Begin enrollment
            </Button>
          </form>
          {enrollment.status === "pending" && idpConfigured && (
            <form action={completeAction}>
              <Button type="submit" variant="default">
                Complete (OAuth verified)
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ImpersonationAuditPanel({
  audit,
  tenantUsers,
  activeTargetUserId,
  startAction,
  stopAction,
}: {
  audit: ImpersonationAuditRecord[];
  tenantUsers: User[];
  activeTargetUserId: string | null;
  startAction: (formData: FormData) => void;
  stopAction: () => void;
}) {
  const impersonatable = tenantUsers.filter((u) => u.active);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Admin impersonation audit</h2>
          {activeTargetUserId ? (
            <Badge tone="danger">Active session</Badge>
          ) : (
            <Badge tone="neutral">No active session</Badge>
          )}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Fail-closed to admins only. Sessions are audit-recorded stubs — no live session swap in V1.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {activeTargetUserId ? (
            <form action={stopAction}>
              <Button type="submit" variant="destructive">
                Stop impersonation
              </Button>
            </form>
          ) : (
            <form action={startAction} className="flex flex-wrap items-end gap-2">
              <Field label="Impersonate user" htmlFor="targetUserId">
                <Select id="targetUserId" name="targetUserId" required defaultValue="">
                  <option value="" disabled>
                    Select tenant user…
                  </option>
                  {impersonatable.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="outline">
                Start (audit only)
              </Button>
            </form>
          )}
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No impersonation events recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audit.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Badge tone={r.action === "start" ? "warning" : "neutral"}>{r.action}</Badge>{" "}
                  <span className="text-muted-foreground">
                    {r.adminEmail} → {r.targetEmail || r.targetUserId}
                  </span>
                  {r.detail && (
                    <span className="ml-1 text-xs text-muted-foreground">· {r.detail}</span>
                  )}
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(r.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
