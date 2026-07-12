import Link from "next/link";
import { requireUser, isAdmin, accessibleCompanyIds } from "@/lib/auth/rbac";
import {
  visibleCompanies,
  visibleContent,
  visibleRequests,
} from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import { getTenant, listCompanies, listScheduledPosts } from "@/lib/db";
import { buildLocalDashboard } from "@/lib/analytics";
import { buildAgencyOpsBundle } from "@/lib/agency-ops";
import { buildTenantExecDash } from "@/lib/exec-dash";
import { listOpenOpportunitiesForTenant } from "@/lib/ai-mos";
import { isDue } from "@/lib/publish-queue";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import {
  AgencyAlertsList,
  AgencyWorkloadChips,
  type AttentionExtra,
} from "@/components/agency-ops-panel";
import { ExecutiveClientAccordion } from "@/components/executive-client-accordion";
import { onboardingScore } from "@/lib/types";
import type { AgencyAlert } from "@/lib/agency-ops";
import type { AiMosOpportunity, Company } from "@/lib/types";

function verbTitleForAlert(alert: AgencyAlert): string {
  switch (alert.kind) {
    case "overdue_approval":
      return `Approval overdue — ${alert.companyName}`;
    case "overdue_client_review":
      return `Client review waiting — ${alert.companyName}`;
    case "health_attention":
      return `Health risk — ${alert.companyName}`;
    case "credit_low":
      return `Top up credit — ${alert.companyName}`;
    case "reconnect_needed":
      return `Reconnect account — ${alert.companyName}`;
    case "quality_hold":
      return `Needs attention — ${alert.companyName}`;
    default:
      return alert.title;
  }
}

function verbTitleForAiMos(opp: AiMosOpportunity, companyName: string): string {
  const kindLabel: Record<AiMosOpportunity["kind"], string> = {
    health_decline: "Health decline",
    calendar_gap: "Calendar gap",
    publishing_cadence: "Cadence slip",
    recommendation_signal: "Recommendation",
    approval_bottleneck: "Approval bottleneck",
    review_signal: "Review signal",
    loyalty_signal: "Loyalty signal",
  };
  return `${kindLabel[opp.kind] ?? "Signal"} — ${companyName}`;
}

function nextSpielStep(company: Company | undefined, admin: boolean): {
  title: string;
  detail: string;
  href: string;
  cta: string;
} | null {
  if (!company) {
    return admin
      ? {
          title: "Add your first client",
          detail: "Onboard a client so managed delivery can start.",
          href: "/companies",
          cta: "Open clients",
        }
      : null;
  }
  const { score, missing } = onboardingScore(company);
  if (score >= 100) return null;
  return {
    title: `Setup incomplete — ${company.name}`,
    detail: `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}. Delivery quality improves once this is filled.`,
    href: `/companies/${company.id}`,
    cta: "Complete setup",
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const companies = await visibleCompanies(user);
  const requests = await visibleRequests(user);
  const content = await visibleContent(user);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));
  const scope = await accessibleCompanyIds(user);

  const local = admin
    ? null
    : await buildLocalDashboard(user.tenantId, scope);

  const [agencyOps, execRows, aiMosOpen, tenant, posts] = await Promise.all([
    admin ? buildAgencyOpsBundle(user.tenantId) : Promise.resolve(null),
    admin ? buildTenantExecDash(user.tenantId) : Promise.resolve([]),
    admin
      ? listOpenOpportunitiesForTenant(user.tenantId, scope, 8)
      : Promise.resolve([] as AiMosOpportunity[]),
    admin ? getTenant(user.tenantId) : Promise.resolve(null),
    admin ? listScheduledPosts(user.tenantId) : Promise.resolve([]),
  ]);

  const firstCompany = companies[0];
  const nextUp = nextSpielStep(firstCompany, admin);

  const companyNames = new Map(companies.map((c) => [c.id, c.name]));
  const aiMosExtras: AttentionExtra[] = aiMosOpen.map((opp) => {
    const name = companyNames.get(opp.companyId) ?? "Client";
    return {
      id: `aimos-${opp.id}`,
      title: verbTitleForAiMos(opp, name),
      detail: opp.diagnosis.slice(0, 140),
      href: "/ai-mos",
      companyName: name,
    };
  });

  let publishDue = 0;
  let publishFailed = 0;
  if (admin && tenant) {
    const clock = resolveQueueClock(tenant);
    publishDue = posts.filter(
      (p) => p.status === "scheduled" && isDue(p, clock.today, clock.hhmm),
    ).length;
    publishFailed = posts.filter((p) => p.status === "failed").length;
  }

  const recentRequests = requests.slice(0, 5);
  const recentContent = content.slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        explainerId="dashboard"
        explainer={
          admin
            ? "Exceptions desk first — quality holds, overdue approvals, credit, and reconnects. AI drafts route themselves; you only touch what needs a human."
            : "Exceptions and status for your assigned clients — clear blockers, then delivery continues."
        }
      >
        <Link href="/approvals" className={buttonClasses("default", "sm")}>
          Approvals
        </Link>
        <Link
          href="/companies"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline sm:text-sm"
        >
          Clients
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-5">
        {admin && agencyOps && (
          <section>
            <div className="mb-2">
              <h2 className="text-sm font-semibold">Workload</h2>
              <p className="text-xs text-muted-foreground">
                Portfolio queues and publish health at a glance.
              </p>
            </div>
            <AgencyWorkloadChips
              workload={agencyOps.workload}
              publishDue={publishDue}
              publishFailed={publishFailed}
            />
          </section>
        )}

        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Exceptions</h2>
              <p className="text-xs text-muted-foreground">
                Quality holds, overdue approvals, client waits, credit, reconnects, AI signals.
              </p>
            </div>
            {admin && (
              <Link href="/approvals" className="text-xs text-primary hover:underline">
                Queue
              </Link>
            )}
          </div>
          {admin ? (
            <AgencyAlertsList
              alerts={(agencyOps?.alerts ?? []).slice(0, 6).map((a) => ({
                ...a,
                title: verbTitleForAlert(a),
              }))}
              extras={aiMosExtras.slice(0, 4)}
            />
          ) : (local?.missingOnboarding ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Delivery is on track — no exceptions right now.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {(local?.missingOnboarding ?? []).slice(0, 6).map((m) => (
                <li key={`onboard-${m.company}`}>
                  <Link
                    href="/dashboard"
                    className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-sm hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">Complete onboarding — {m.company}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Missing {m.missing.length} item(s): {m.missing.slice(0, 3).join(", ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {nextUp && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Setup
              </p>
              <p className="text-sm font-medium">{nextUp.title}</p>
              <p className="text-xs text-muted-foreground">{nextUp.detail}</p>
            </div>
            <Link href={nextUp.href} className={buttonClasses("subtle", "sm")}>
              {nextUp.cta}
            </Link>
          </div>
        )}

        {admin && (
          <Card id="clients">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Client scorecards</CardTitle>
              <CardDescription>
                Lowest scores first. Expand a row for metrics and next actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ExecutiveClientAccordion rows={execRows} />
            </CardContent>
          </Card>
        )}

        {!admin && local && (local.upcoming.length > 0 || local.missingOnboarding.length > 0) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Coming up</h2>
            {local.upcoming.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {local.upcoming.slice(0, 5).map((u, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-border py-2">
                    <span className="truncate">{u.title}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {u.platform} · {u.date}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            )}
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Client asks</h2>
            <Link href="/requests" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <div className="divide-y divide-border">
              {recentRequests.map((r) => (
                <Link
                  key={r.id}
                  href={`/requests/${r.id}`}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.topic}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {companyById.get(r.companyId)?.name} · {titleCase(r.requestType)} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
              {recentRequests.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No client asks right now.
                </p>
              )}
            </div>
          </Card>
        </section>

        {recentContent.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Recent delivery</h2>
              <Link href="/content" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <Card>
              <div className="divide-y divide-border">
                {recentContent.map((c) => (
                  <Link
                    key={c.id}
                    href={`/content/${c.id}`}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {companyById.get(c.companyId)?.name} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
