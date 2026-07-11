import { requireUser, isAdmin } from "@/lib/auth/rbac";
import { visibleCompanies, visibleSocial } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, RiskBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea, Input } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import {
  approveSocialAction,
  closeSocialAction,
  draftSocialAction,
  publishSocialReplyAction,
} from "./actions";

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const superAdmin = user.role === "super_admin";
  const companies = (await visibleCompanies(user)).filter(
    (c) => c.status === "ai_ready" || c.status === "approved",
  );
  const { company: companyParam } = await searchParams;
  const companyDefault =
    companyParam && companies.some((c) => c.id === companyParam)
      ? companyParam
      : undefined;
  const drafts = await visibleSocial(user);
  // Precompute company names for the drafts list (getCompany is async).
  const draftCompanyIds = Array.from(new Set(drafts.map((d) => d.companyId)));
  const draftCompanies = await Promise.all(
    draftCompanyIds.map((id) => getCompany(id)),
  );
  const companyNameById = new Map(
    draftCompanyIds.map((id, i) => [id, draftCompanies[i]?.name]),
  );

  return (
    <div>
      <PageHeader
        title="Social responses"
        description="Paste a customer comment. AI drafts a reply — a human always approves before use."
      />

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Draft a response</h2>
            {companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No AI-ready companies available to you.
              </p>
            ) : (
              <form action={draftSocialAction} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Client" htmlFor="companyId">
                    <Select
                      id="companyId"
                      name="companyId"
                      required
                      defaultValue={companyDefault}
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Platform" htmlFor="platform">
                    <Input id="platform" name="platform" defaultValue="Facebook" />
                  </Field>
                </div>
                <Field label="Customer comment / message" htmlFor="comment">
                  <Textarea
                    id="comment"
                    name="comment"
                    required
                    className="min-h-28"
                    placeholder="Paste the customer's comment, review or message here…"
                  />
                </Field>
                <Button type="submit">Classify &amp; draft reply</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="font-semibold">Recent drafts</h2>
          {drafts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No responses drafted yet.
            </div>
          ) : (
            drafts.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {companyNameById.get(d.companyId)}
                    </span>
                    <Badge tone="neutral">{d.platform}</Badge>
                    <RiskBadge level={d.riskLevel} />
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mb-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Sentiment: {titleCase(d.sentiment)}</span>
                    <span>· Intent: {titleCase(d.intent)}</span>
                    <span>· {formatDate(d.createdAt)}</span>
                  </p>
                  <blockquote className="my-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                    {d.originalComment}
                  </blockquote>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Suggested reply
                    </p>
                    {d.draftResponse}
                  </div>

                  {d.escalationRequired && (
                    <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                      Auto-escalated ({titleCase(d.intent)}) — only the senior
                      approver (super admin) can approve this reply.
                    </p>
                  )}

                  {d.status === "approved" && admin && (
                    <form action={publishSocialReplyAction} className="mt-3">
                      <input type="hidden" name="socialId" value={d.id} />
                      <Button type="submit" size="sm">
                        Publish reply
                      </Button>
                    </form>
                  )}
                  {(d.status === "pending_approval" || d.status === "escalated") && (
                    <div className="mt-3 flex gap-2">
                      {admin && (!d.escalationRequired || superAdmin) && (
                        <form action={approveSocialAction}>
                          <input type="hidden" name="socialId" value={d.id} />
                          <Button type="submit" size="sm">
                            {d.escalationRequired
                              ? "Approve reply (senior)"
                              : "Approve reply"}
                          </Button>
                        </form>
                      )}
                      <form action={closeSocialAction}>
                        <input type="hidden" name="socialId" value={d.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          No response needed
                        </Button>
                      </form>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
