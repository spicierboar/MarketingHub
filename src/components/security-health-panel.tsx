import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { IntegrationHealthBundle, IntegrationHealthRow } from "@/lib/security-slice";
import type { PublishingPlatformHealthRow } from "@/lib/publishing-connectors";

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
