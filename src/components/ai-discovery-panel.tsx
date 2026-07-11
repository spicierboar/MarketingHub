import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  AI_DISCOVERY_PLATFORMS,
  formatMentionRate,
  type AiDiscoveryCheck,
  type AiDiscoveryReport,
} from "@/lib/ai-discovery";
import {
  saveAiDiscoveryDirectoriesAction,
  saveAiDiscoveryScorecardAction,
} from "@/app/(app)/companies/[id]/local-seo/ai-discovery-actions";

const STATUS_TONE: Record<
  AiDiscoveryCheck["status"],
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  pass: "success",
  warn: "warning",
  fail: "danger",
  info: "info",
};

function CheckRow({ check }: { check: AiDiscoveryCheck }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[check.status]}>{check.status}</Badge>
          <span className="font-medium">{check.title}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{check.fixAction}</p>
      </div>
      {check.fixHref && (
        <Link href={check.fixHref} className="shrink-0 text-xs text-primary hover:underline">
          Open
        </Link>
      )}
    </div>
  );
}

export function AiDiscoveryPanel({
  report,
  companyId,
}: {
  report: AiDiscoveryReport;
  companyId: string;
}) {
  const fails = report.checks.filter((c) => c.status === "fail");
  const warns = report.checks.filter((c) => c.status === "warn");
  const latest = report.latestScorecard;
  const priorByKey = new Map(
    (latest?.rows ?? []).map((r) => [`${r.promptId}:${r.platform}`, r.result]),
  );

  return (
    <div className="space-y-6">
      <Card className="border-sky-200 bg-sky-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI discovery (GEO)</CardTitle>
          <CardDescription>{report.disclaimer}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Readiness</p>
            <p className="text-3xl font-bold">{report.readinessScore}</p>
            <p className="text-xs text-muted-foreground">Foundations for AI citations</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Latest mention rate</p>
            <p className="text-3xl font-bold">
              {formatMentionRate(latest?.mentionRate ?? null)}
            </p>
            <p className="text-xs text-muted-foreground">
              {latest
                ? `${latest.completedCount} prompt×platform checks · ${new Date(latest.ranAt).toLocaleDateString()}`
                : "Run the scorecard after testing prompts"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gaps</p>
            <p className="text-3xl font-bold">{fails.length + warns.length}</p>
            <p className="text-xs text-muted-foreground">
              {fails.length} critical · {warns.length} warnings
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Foundations checklist</CardTitle>
          <CardDescription>
            Signals AI systems use to trust and recommend a local business. Fix fails first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Directories ChatGPT leans on</CardTitle>
          <CardDescription>
            Mark Bing Places and Yelp (or your vertical directory) once claimed — these feed AI
            answers more than Google alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAiDiscoveryDirectoriesAction} className="space-y-4">
            <input type="hidden" name="companyId" value={companyId} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="bingPlacesClaimed"
                defaultChecked={!!report.directories.bingPlacesClaimed}
              />
              Bing Places claimed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="yelpListed"
                defaultChecked={!!report.directories.yelpListed}
              />
              Yelp / niche directory listed
            </label>
            <Field label="Yelp or directory URL" htmlFor="yelpUrl">
              <Input
                id="yelpUrl"
                name="yelpUrl"
                defaultValue={report.directories.yelpUrl ?? ""}
                placeholder="https://…"
              />
            </Field>
            <Field label="Notes" htmlFor="directoryNotes">
              <Input
                id="directoryNotes"
                name="directoryNotes"
                defaultValue={report.directories.notes ?? ""}
                placeholder="e.g. HealthEngine, TripAdvisor…"
              />
            </Field>
            <Button type="submit" variant="outline" size="sm">
              Save directory flags
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer prompt pack</CardTitle>
          <CardDescription>
            Run these in ChatGPT, Gemini, and Perplexity. Record whether this client was named —
            that is your mention rate, not a ranking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm">
            {report.prompts.map((p) => (
              <li key={p.id}>
                <span className="font-medium">&ldquo;{p.text}&rdquo;</span>
              </li>
            ))}
          </ol>

          <form action={saveAiDiscoveryScorecardAction} className="space-y-4">
            <input type="hidden" name="companyId" value={companyId} />
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Prompt</th>
                    {AI_DISCOVERY_PLATFORMS.map((pl) => (
                      <th key={pl.id} className="px-3 py-2 font-medium">
                        {pl.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.prompts.map((p) => (
                    <tr key={p.id}>
                      <td className="max-w-[14rem] px-3 py-2 text-xs text-muted-foreground">
                        {p.text}
                      </td>
                      {AI_DISCOVERY_PLATFORMS.map((pl) => {
                        const key = `r_${p.id}_${pl.id}`;
                        const prior = priorByKey.get(`${p.id}:${pl.id}`) ?? "not_run";
                        return (
                          <td key={pl.id} className="px-3 py-2">
                            <select
                              name={key}
                              defaultValue={prior}
                              className="h-8 w-full rounded-md border border-border bg-background px-1 text-xs"
                            >
                              <option value="not_run">Not run</option>
                              <option value="mentioned">Mentioned</option>
                              <option value="not_mentioned">Not mentioned</option>
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit">Save mention scorecard</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
