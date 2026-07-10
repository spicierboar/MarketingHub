import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GbpAuditResult } from "@/lib/gbp-audit";
import type {
  LocalLandingBrief,
  LocalSeoQaDraftSpec,
  LocalSeoReport,
  SchemaMarkupRecommendation,
} from "@/lib/local-seo";
import { spawnLocalSeoQaDraftAction } from "@/app/(app)/companies/[id]/local-seo/actions";

const LANDING_TONE: Record<LocalLandingBrief["status"], "success" | "warning" | "danger"> = {
  ready: "success",
  needs_work: "warning",
  missing: "danger",
};

const SCHEMA_TONE: Record<SchemaMarkupRecommendation["readiness"], "success" | "warning" | "danger"> = {
  ready: "success",
  partial: "warning",
  missing: "danger",
};

const GROUNDING_TONE: Record<
  LocalSeoQaDraftSpec["grounding"],
  "success" | "warning" | "info" | "neutral"
> = {
  grounded: "success",
  requires_evidence: "warning",
  suggested_by_ai: "info",
  unsupported: "neutral",
};

export function LocalSeoPanel({
  report,
  audit,
  companyId,
}: {
  report: LocalSeoReport;
  audit: GbpAuditResult;
  companyId: string;
}) {
  return (
    <div className="space-y-6">
      <LocalSeoScorePanel report={report} audit={audit} />
      <LandingBriefsPanel briefs={report.landingBriefs} companyId={companyId} />
      <SchemaRecommendationsPanel recs={report.schemaRecommendations} />
      <QaDraftsPanel drafts={report.qaDrafts} companyId={companyId} />
    </div>
  );
}

function LocalSeoScorePanel({
  report,
  audit,
}: {
  report: LocalSeoReport;
  audit: GbpAuditResult;
}) {
  const { score } = report;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Local SEO score</CardTitle>
        <CardDescription>
          Combined GBP audit ({Math.round(score.weights.gbp * 100)}%), suburb landing readiness (
          {Math.round(score.weights.landing * 100)}%), and schema markup (
          {Math.round(score.weights.schema * 100)}%). Mode:{" "}
          <strong>{report.mode === "live" ? "Live" : "Simulated"}</strong>
          {report.mode === "simulated" && (
            <>
              {" "}
              until <code className="text-xs">LOCAL_SEO_LIVE=true</code>
            </>
          )}
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-4">
          <ScoreTile label="Overall" value={score.overall} highlight />
          <ScoreTile label="GBP audit" value={score.gbpComponent} detail={`GBP ${audit.mode}`} />
          <ScoreTile label="Landing pages" value={score.landingComponent} />
          <ScoreTile label="Schema markup" value={score.schemaComponent} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreTile({
  label,
  value,
  detail,
  highlight,
}: {
  label: string;
  value: number;
  detail?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={highlight ? "text-3xl font-bold" : "text-2xl font-bold"}>{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function LandingBriefsPanel({
  briefs,
  companyId,
}: {
  briefs: LocalLandingBrief[];
  companyId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suburb landing page briefs</CardTitle>
        <CardDescription>
          SEO-ready outlines per service area — publish via Website CMS when approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {briefs.map((b) => (
          <div key={b.id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={LANDING_TONE[b.status]}>{b.status.replace(/_/g, " ")}</Badge>
              <Badge tone="neutral">Score {b.readinessScore}</Badge>
              {b.slug && (
                <Badge tone="info">
                  <code className="text-xs">/{b.slug}</code>
                </Badge>
              )}
              <span className="font-medium">{b.suburb}</span>
            </div>
            {b.title && (
              <>
                <p className="mt-2 text-sm font-medium">{b.title}</p>
                <p className="text-sm text-muted-foreground">{b.metaDescription}</p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">H1:</span> {b.h1}
                </p>
              </>
            )}
            {b.sections.map((s) => (
              <div key={s.heading} className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">{s.heading}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {s.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
            {b.fixAction && (
              <p className="mt-3 text-sm">
                <span className="font-medium">Fix: </span>
                {b.fixAction}
              </p>
            )}
            {b.slug && (
              <Link
                href={`/cms?company=${companyId}`}
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                Open CMS →
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SchemaRecommendationsPanel({ recs }: { recs: SchemaMarkupRecommendation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema markup recommendations</CardTitle>
        <CardDescription>
          JSON-LD for LocalBusiness, Restaurant, Hotel or FAQPage — embed on site and suburb pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recs.map((r) => (
          <div key={r.id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SCHEMA_TONE[r.readiness]}>{r.readiness}</Badge>
              <Badge tone="primary">{r.schemaType}</Badge>
              <span className="font-medium">{r.title}</span>
            </div>
            {r.missingFields.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Missing: {r.missingFields.join(", ")}
              </p>
            )}
            <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
              {r.jsonLdPreview}
            </pre>
            <p className="mt-2 text-sm">
              <span className="font-medium">Fix: </span>
              {r.fixAction}
            </p>
            {r.fixHref && (
              <Link href={r.fixHref} className="mt-1 inline-block text-sm text-primary hover:underline">
                Go →
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QaDraftsPanel({
  drafts,
  companyId,
}: {
  drafts: LocalSeoQaDraftSpec[];
  companyId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Factual Q&A drafts</CardTitle>
        <CardDescription>
          Governed FAQ payloads from profile + local intelligence. Accept →{" "}
          <span className="font-medium">ai_draft</span> only — never auto-published to GBP or web.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={GROUNDING_TONE[d.grounding]}>{d.grounding.replace(/_/g, " ")}</Badge>
              <Badge tone="neutral">{d.topic}</Badge>
              <span className="font-medium">{d.question}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{d.answer}</p>
            <p className="mt-1 text-xs text-muted-foreground">Basis: {d.factualBasis}</p>
            <form action={spawnLocalSeoQaDraftAction} className="mt-3">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="draftId" value={d.id} />
              <Button type="submit" size="sm">
                Accept → ai_draft
              </Button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
