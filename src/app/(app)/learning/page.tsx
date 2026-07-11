import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies } from "@/lib/db";
import { learningMode } from "@/lib/learning-connectors";
import {
  listHypothesesForCompany,
  listLessonsForCompany,
} from "@/lib/learning";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  createHypothesisAction,
  recordManualLessonAction,
  recordOutcomeAction,
} from "./actions";

export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);

  const [lessons, hypotheses] = companyId
    ? await Promise.all([
        listLessonsForCompany(user.tenantId, companyId),
        listHypothesesForCompany(user.tenantId, companyId),
      ])
    : [[], []];

  const mode = learningMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Continuous learning"
        description="Hypotheses, experiment outcomes, and lessons-learned from dismissals and tests."
      >
        <Badge tone={mode === "live" ? "success" : "neutral"}>
          {mode === "live" ? "LEARNING_LIVE on" : "Register active (LEARNING_LIVE off)"}
        </Badge>
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Client" htmlFor="lrn-company">
              <Select id="lrn-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
        </CardContent>
      </Card>

      {company && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Lessons learned</h2>
              <p className="text-sm text-muted-foreground">
                Auto-recorded when recommendations are dismissed; manual entries welcome.
              </p>
              {lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No lessons yet for this company.</p>
              ) : (
                <ul className="space-y-3">
                  {lessons.slice(0, 20).map((l) => (
                    <li key={l.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{l.title}</span>
                        <Badge tone="neutral">{l.source.replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(l.createdAt)}</span>
                      </div>
                      <p>{l.lesson}</p>
                      {l.dismissReason && (
                        <p className="mt-1 text-xs text-muted-foreground">Reason: {l.dismissReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form action={recordManualLessonAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Manual lesson title" htmlFor="ml-title">
                  <Input id="ml-title" name="title" required placeholder="What we learned" />
                </Field>
                <Field label="Lesson" htmlFor="ml-lesson">
                  <Textarea id="ml-lesson" name="lesson" required className="min-h-16" />
                </Field>
                <Button type="submit" size="sm">
                  Record lesson
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Hypotheses & outcomes</h2>
              {hypotheses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hypotheses yet.</p>
              ) : (
                <ul className="space-y-4">
                  {hypotheses.map((h) => (
                    <li key={h.id} className="rounded-lg border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{h.title}</span>
                        <StatusBadge status={h.status} />
                        {h.experimentOutcome && h.experimentOutcome !== "pending" && (
                          <Badge tone={h.experimentOutcome === "positive" ? "success" : "neutral"}>
                            {h.experimentOutcome}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">{h.statement}</p>
                      {h.metric && <p className="mt-1 text-xs">Metric: {h.metric}</p>}
                      {h.outcomeNotes && (
                        <p className="mt-1 text-xs text-muted-foreground">{h.outcomeNotes}</p>
                      )}
                      {h.status !== "validated" && h.status !== "invalidated" && (
                        <form action={recordOutcomeAction} className="mt-3 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="hypothesisId" value={h.id} />
                          <Field label="Outcome" htmlFor={`out-${h.id}`}>
                            <Select id={`out-${h.id}`} name="outcome" defaultValue="inconclusive">
                              <option value="positive">Positive</option>
                              <option value="negative">Negative</option>
                              <option value="inconclusive">Inconclusive</option>
                            </Select>
                          </Field>
                          <Field label="Notes" htmlFor={`notes-${h.id}`}>
                            <Input id={`notes-${h.id}`} name="notes" placeholder="Optional" />
                          </Field>
                          <Button type="submit" size="sm" variant="secondary">
                            Record outcome
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form action={createHypothesisAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Hypothesis title" htmlFor="hyp-title">
                  <Input id="hyp-title" name="title" required />
                </Field>
                <Field label="Statement" htmlFor="hyp-statement">
                  <Textarea id="hyp-statement" name="statement" required className="min-h-14" />
                </Field>
                <Field label="Metric (optional)" htmlFor="hyp-metric">
                  <Input id="hyp-metric" name="metric" placeholder="e.g. booking rate" />
                </Field>
                <Button type="submit" size="sm">
                  Add hypothesis
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
