import {
  CONNECTOR_CAPABILITY_KEYS,
  listConnectorCapabilityMatrix,
} from "@/lib/connectors/capability-registry";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Read-only capability matrix (simulated OK while live flags off). */
export function ConnectorCapabilityPanel({
  embedded = false,
}: {
  /** Skip Card + title when nested under a page-level `<details>`. */
  embedded?: boolean;
}) {
  const rows = listConnectorCapabilityMatrix();
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-2 font-medium">Platform</th>
            {CONNECTOR_CAPABILITY_KEYS.map((c) => (
              <th key={c} className="px-2 py-2 text-center font-medium">
                {c.replace("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.platform}>
              <td className="px-2 py-2 font-medium">
                {r.label}
                {r.rateLimitHint ? (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {r.rateLimitHint}
                  </span>
                ) : null}
              </td>
              {CONNECTOR_CAPABILITY_KEYS.map((c) => (
                <td key={c} className="px-2 py-2 text-center">
                  {r.capabilities[c] ? (
                    <span className="text-emerald-700">✓</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return (
      <div>
        <p className="mb-3 text-xs text-muted-foreground">
          What each platform supports. Publish calls{" "}
          <code className="text-[11px]">assertConnectorAction</code> first — unsupported
          actions fail closed. Live flags remain OFF.
        </p>
        {table}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Connector capability registry</h2>
          <Badge tone="neutral">Simulated OK</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Live-ready matrix of what each platform supports. Publish attempts call{" "}
          <code className="text-xs">assertConnectorAction</code> before the API —
          unsupported actions fail closed. Live flags remain OFF.
        </p>
        {table}
      </CardContent>
    </Card>
  );
}
