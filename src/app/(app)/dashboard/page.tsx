import Link from "next/link";
import { requireUser, isAdmin, accessibleCompanyIds } from "@/lib/auth/rbac";
import {
  visibleCompanies,
  visibleContent,
  visibleRequests,
} from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import { listCompanies, listAiMosOpportunities } from "@/lib/db";
import { buildLocalDashboard } from "@/lib/analytics";
import { buildAgencyOpsBundle } from "@/lib/agency-ops";
import { AgencyOpsSection } from "@/components/agency-ops-panel";
import { AiMosDashboardPanel } from "@/components/ai-mos-opportunity-cards";

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const companies = await visibleCompanies(user);
  const requests = await visibleRequests(user);
  const content = await visibleContent(user);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));

  const openRequests = requests.filter(
    (r) => !["completed", "cancelled", "published"].includes(r.status),
  );
  const pendingApproval = content.filter((c) => c.status === "pending_approval");
  const approved = content.filter((c) =>
    ["approved", "scheduled", "published"].includes(c.status),
  );

  const stats = [
    { label: "Companies", value: companies.length, href: admin ? "/companies" : undefined },
    { label: "Open requests", value: openRequests.length, href: "/requests" },
    {
      label: "Awaiting approval",
      value: pendingApproval.length,
      href: admin ? "/approvals" : "/content",
    },
    { label: "Approved content", value: approved.length, href: "/content" },
  ];

  // Local Manager Dashboard (§43) for scoped users.
  const local = admin ? null : await buildLocalDashboard(user.tenantId, await accessibleCompanyIds(user));

  const agencyOps = admin ? await buildAgencyOpsBundle(user.tenantId) : null;

  const aiMosOpen = admin
    ? (await listAiMosOpportunities(user.tenantId, undefined, "open")).slice(0, 4)
    : [];
  const aiMosCompanyNames = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={
          admin
            ? "Workspace overview across all your companies."
            : "Your assigned companies and marketing requests."
        }
      >
        <Link href="/requests/new" className={buttonClasses()}>
          New support request
        </Link>
      </PageHeader>

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => {
            const card = (
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">
                    {s.value}
                  </p>
                </CardContent>
              </Card>
            );
            return s.href ? (
              <Link key={s.label} href={s.href}>
                {card}
              </Link>
            ) : (
              <div key={s.label}>{card}</div>
            );
          })}
        </div>

        {local && (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Your performance</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div><p className="text-xs text-muted-foreground">Requests submitted</p><p className="mt-1 text-2xl font-bold">{local.requestsSubmitted}</p></div>
                <div><p className="text-xs text-muted-foreground">Approved</p><p className="mt-1 text-2xl font-bold">{local.requestsApproved}</p></div>
                <div><p className="text-xs text-muted-foreground">Avg turnaround</p><p className="mt-1 text-2xl font-bold">{local.avgTurnaroundHours !== null ? `${local.avgTurnaroundHours.toFixed(0)}h` : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Posts published</p><p className="mt-1 text-2xl font-bold">{local.postsPublished}</p></div>
                <div><p className="text-xs text-muted-foreground">Engagement</p><p className="mt-1 text-2xl font-bold">{local.engagement.toLocaleString("en-AU")}</p></div>
                <div><p className="text-xs text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-bold">{local.leads}</p></div>
              </div>

              {(local.upcoming.length > 0 || local.missingOnboarding.length > 0) && (
                <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Upcoming scheduled posts</p>
                    {local.upcoming.length ? (
                      <ul className="space-y-1 text-sm">
                        {local.upcoming.map((u, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="truncate">{u.title}</span>
                            <span className="whitespace-nowrap text-muted-foreground">{u.platform} · {u.date}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs your attention</p>
                    {local.missingOnboarding.length ? (
                      <ul className="space-y-1 text-sm">
                        {local.missingOnboarding.map((m) => (
                          <li key={m.company}>
                            <span className="font-medium">{m.company}</span>{" "}
                            <span className="text-muted-foreground">— missing {m.missing.length} onboarding item(s)</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">All onboarding complete. 🎉</p>
                    )}
                    {local.commonEnquiries.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {local.commonEnquiries.map((e) => (
                          <Badge key={e.intent} tone="info">{titleCase(e.intent)}: {e.count}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {admin && aiMosOpen.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-1 font-semibold">AI-MOS opportunities</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Suggest-only signal monitoring — accept to create draft campaigns or content requests.
              </p>
              <AiMosDashboardPanel opps={aiMosOpen} companyById={aiMosCompanyNames} />
            </CardContent>
          </Card>
        )}

        {agencyOps && (
          <AgencyOpsSection
            workload={agencyOps.workload}
            alerts={agencyOps.alerts}
            templates={agencyOps.templates}
            needsAttention={agencyOps.needsAttention}
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent requests</h2>
              <Link
                href="/requests"
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-border">
              {requests.slice(0, 6).map((r) => (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.topic}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {companyById.get(r.companyId)?.name} · {titleCase(r.requestType)} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
              {requests.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No requests yet.{" "}
                  <Link href="/requests/new" className="text-primary hover:underline">
                    Create one
                  </Link>
                  .
                </p>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent content</h2>
              <Link href="/content" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-border">
              {content.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/content/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {companyById.get(c.companyId)?.name} · {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
              {content.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No content drafted yet. Open a request and generate an AI draft.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
