import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  localIntelCompleteness,
  localIntelHighlights,
  localIntelSummary,
} from "@/lib/local-area-intel";
import type { LocalAreaProfile } from "@/lib/types";
import { saveLocalProfileAction } from "./brand-actions";
import { LocalIntelFields } from "./local-intel-fields";

interface Props {
  companyId: string;
  local?: LocalAreaProfile;
}

export function LocalIntelPanel({ companyId, local }: Props) {
  const { score, missing } = localIntelCompleteness(local);
  const highlights = localIntelHighlights(local);
  const summary = localIntelSummary(local);

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Local area intelligence</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Suburbs, competitors, events, search terms and buying triggers — the AI
              uses this to avoid generic copy.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{score}%</p>
            <p className="text-xs text-muted-foreground">profile complete</p>
          </div>
        </div>

        <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{summary}</p>

        {highlights.length > 0 && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {highlights.map((h) => (
              <div key={h.label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {h.label}
                </dt>
                <dd className="mt-0.5">{h.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {missing.length > 0 && score < 100 && (
          <p className="text-xs text-muted-foreground">
            Still needed: {missing.slice(0, 3).join(" · ")}
            {missing.length > 3 ? ` · +${missing.length - 3} more` : ""}
          </p>
        )}

        <form action={saveLocalProfileAction} className="space-y-4 border-t border-border pt-5">
          <input type="hidden" name="companyId" value={companyId} />
          <LocalIntelFields local={local} variant="key" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/companies/${companyId}/brand-brain`}
              className="text-sm text-primary hover:underline"
            >
              Full profile on Brand Brain →
            </Link>
            <Button type="submit" size="sm">
              Save local intelligence
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
