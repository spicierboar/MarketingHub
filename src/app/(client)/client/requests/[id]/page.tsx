import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getRequest, listContent, listGaps } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import { answerClientGapAction } from "../../../actions";

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function ClientRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, companyId } = await requirePortalUser();
  const req = await getRequest(id);
  if (!req || req.companyId !== companyId) notFound();

  const company = (await getCompany(companyId))!;
  const linkedContent = (await listContent(user.tenantId)).filter((c) => c.requestId === req.id);
  const gaps = await listGaps({ requestId: req.id });
  const openGaps = gaps.filter((g) => g.status === "open");
  const answeredGaps = gaps.filter((g) => g.status === "answered");

  return (
    <div>
      <PageHeader title={req.topic} description={`${company.name} · ${req.id}`} hideExplainer
        parent={{ href: "/client/requests", label: "Ask us" }}
      >
        <StatusBadge status={req.status} />
      </PageHeader>
      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {openGaps.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardContent className="p-6">
                <h2 className="mb-4 font-semibold">We need more information</h2>
                <div className="space-y-4">
                  {openGaps.map((g) => (
                    <form key={g.id} action={answerClientGapAction} className="rounded-md border border-border bg-card p-4">
                      <input type="hidden" name="gapId" value={g.id} />
                      <p className="mb-1 text-sm font-medium">{g.question}</p>
                      {g.context && <p className="mb-2 text-xs text-muted-foreground">{g.context}</p>}
                      <Badge tone={g.blocking ? "danger" : "warning"}>{g.blocking ? "Required" : "Optional"}</Badge>
                      <Textarea
                        name="answer"
                        required
                        placeholder="Type your answer here — a short note is fine"
                        className="mb-2 mt-3 min-h-16"
                      />
                      <Button type="submit" size="sm">Submit answer</Button>
                    </form>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {answeredGaps.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Your answers</h2>
                {answeredGaps.map((g) => (
                  <div key={g.id} className="mb-2 text-sm">
                    <p className="font-medium">{g.question}</p>
                    <p className="text-muted-foreground">→ {g.answer}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Request details</h2>
              <div className="divide-y divide-border">
                <Row label="Type" value={titleCase(req.requestType)} />
                <Row label="Objective" value={req.objective} />
                <Row label="Platform" value={req.platform} />
                <Row label="Urgency" value={titleCase(req.urgency)} />
                <Row label="Notes" value={req.notes} />
              </div>
            </CardContent>
          </Card>
          {linkedContent.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Content in progress</h2>
                {linkedContent.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">{c.title}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={c.status} />
                      {c.status === "pending_approval" && c.clientReview?.status === "pending" && (
                        <Link href={`/client/approvals/${c.id}`} className="text-xs text-primary hover:underline">Review →</Link>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-semibold">Status history</h2>
            <ol className="space-y-3">
              {req.statusHistory.slice().reverse().map((e, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={e.status} />
                    <span className="text-xs text-muted-foreground">{formatDate(e.at)}</span>
                  </div>
                  {e.note && <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
