import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessCompany, isAdmin } from "@/lib/auth/rbac";
import {
  getCompany,
  getRequest,
  getUser,
  listCampaigns,
  listContent,
  listGaps,
} from "@/lib/db";
import { convertRequestToCampaignAction } from "../../campaigns/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import {
  answerGapAction,
  cancelRequestAction,
  generateDraftAction,
  requestMoreInfoAction,
} from "../actions";

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const req = await getRequest(id);
  if (!req || !(await canAccessCompany(user, req.companyId))) notFound();

  const company = (await getCompany(req.companyId))!;
  const admin = isAdmin(user);
  const linkedContent = (await listContent(user.tenantId)).filter((c) => c.requestId === req.id);
  const canGenerate =
    (company.status === "ai_ready" || company.status === "approved") &&
    !["cancelled", "completed"].includes(req.status);

  const activeConsent = Object.entries(req.consent).filter(([, v]) => v);
  const gaps = await listGaps({ requestId: req.id });
  const openGaps = gaps.filter((g) => g.status === "open");
  const answeredGaps = gaps.filter((g) => g.status === "answered");
  const linkedCampaign = (await listCampaigns(user.tenantId)).find((c) => c.requestId === req.id);
  const requester = await getUser(req.requesterId);
  const generate = generateDraftAction.bind(null, req.id);
  const convert = convertRequestToCampaignAction.bind(null, req.id);
  const cancel = cancelRequestAction.bind(null, req.id);

  return (
    <div>
      <PageHeader title={req.topic} description={`${company.name} · Request ${req.id}`} hideExplainer
        parent={{
          href: `/requests?company=${req.companyId}`,
          label: "Client asks",
        }}
      >
        <StatusBadge status={req.status} />
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {openGaps.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardContent className="p-6">
                <h2 className="mb-1 font-semibold">
                  The AI needs more information before drafting
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Ask-the-Local-Manager workflow: answer the questions below and
                  drafting can continue.
                </p>
                <div className="space-y-4">
                  {openGaps.map((g) => (
                    <form
                      key={g.id}
                      action={answerGapAction}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <input type="hidden" name="gapId" value={g.id} />
                      <p className="mb-1 text-sm font-medium">{g.question}</p>
                      {g.context && (
                        <p className="mb-2 text-xs text-muted-foreground">{g.context}</p>
                      )}
                      <Badge tone={g.blocking ? "danger" : "warning"}>
                        {g.blocking ? "Blocks drafting" : "Advisory"}
                      </Badge>
                      <Textarea
                        name="answer"
                        required
                        placeholder="Your answer…"
                        className="mb-2 mt-3 min-h-16"
                      />
                      <Button type="submit" size="sm">
                        Submit answer
                      </Button>
                    </form>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {answeredGaps.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Local manager answers</h2>
                <div className="space-y-3">
                  {answeredGaps.map((g) => (
                    <div key={g.id} className="text-sm">
                      <p className="font-medium">{g.question}</p>
                      <p className="text-muted-foreground">→ {g.answer}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Request details</h2>
              <div className="divide-y divide-border">
                <Row label="Type" value={titleCase(req.requestType)} />
                <Row label="Objective" value={req.objective} />
                <Row label="Target audience" value={req.targetAudience} />
                <Row label="Platform" value={req.platform} />
                <Row label="Offer" value={req.offer} />
                <Row label="Call to action" value={req.callToAction} />
                <Row
                  label="Preferred schedule"
                  value={
                    req.preferredDate
                      ? `${req.preferredDate} ${req.preferredTime ?? ""}`.trim()
                      : undefined
                  }
                />
                <Row label="Urgency" value={titleCase(req.urgency)} />
                <Row label="Requested by" value={requester?.name} />
                <Row label="Notes" value={req.notes} />
              </div>
            </CardContent>
          </Card>

          {(activeConsent.length > 0 || req.uploads.length > 0) && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Consent &amp; uploads</h2>
                {activeConsent.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {activeConsent.map(([k]) => (
                      <Badge key={k} tone="warning">
                        {titleCase(k)}
                      </Badge>
                    ))}
                  </div>
                )}
                {req.uploads.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {req.uploads.map((u) => (
                      <li key={u.id} className="flex items-center justify-between">
                        <span>{u.name}</span>
                        <Badge tone="neutral">{u.approvalStatus}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No files uploaded.</p>
                )}
              </CardContent>
            </Card>
          )}

          {linkedContent.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Generated content</h2>
                <div className="divide-y divide-border">
                  {linkedContent.map((c) => (
                    <Link
                      key={c.id}
                      href={`/content/${c.id}`}
                      className="flex items-center justify-between py-3 hover:text-primary"
                    >
                      <span className="text-sm font-medium">{c.title}</span>
                      <StatusBadge status={c.status} />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Actions</h2>
              {linkedCampaign && (
                <Link
                  href={`/campaigns/${linkedCampaign.id}`}
                  className="block rounded-md bg-accent p-3 text-sm text-primary hover:underline"
                >
                  Converted to campaign: {linkedCampaign.name} →
                </Link>
              )}
              {canGenerate && !linkedCampaign && req.requestType === "campaign" && (
                <form action={convert}>
                  <Button type="submit" variant="subtle" className="w-full">
                    Convert to campaign plan
                  </Button>
                </form>
              )}
              {canGenerate ? (
                <form action={generate}>
                  <Button type="submit" className="w-full">
                    Generate AI draft
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {company.status === "ai_ready" || company.status === "approved"
                    ? "This request is closed."
                    : `${company.name} is not AI-ready yet. Finish onboarding first.`}
                </p>
              )}
              {admin && (
                <form action={requestMoreInfoAction}>
                  <input type="hidden" name="requestId" value={req.id} />
                  <textarea
                    name="note"
                    placeholder="Ask the requester for more information…"
                    className="mb-2 min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                  />
                  <Button type="submit" variant="outline" className="w-full">
                    Request more info
                  </Button>
                </form>
              )}
              {!["cancelled", "completed", "published"].includes(req.status) && (
                <form action={cancel}>
                  <Button type="submit" variant="ghost" className="w-full">
                    Cancel request
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Status history</h2>
              <ol className="space-y-3">
                {req.statusHistory
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={e.status} />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(e.at)}
                        </span>
                      </div>
                      {e.note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {e.note}
                        </p>
                      )}
                    </li>
                  ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
