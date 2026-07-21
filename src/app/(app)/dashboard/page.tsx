import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireUser,
  isAdmin,
  isSalesRep,
  accessibleCompanyIds,
  userHasPermission,
} from "@/lib/auth/rbac";
import { visibleCompanies, visibleContent, visibleRequests } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import { buildLocalDashboard } from "@/lib/analytics";
import { AgencyControlPlane } from "@/components/agency-control-plane";
import { onboardingScore } from "@/lib/types";
import type { Company } from "@/lib/types";
import { displayGivenName } from "@/lib/display-name";

function nextSpielStep(company: Company | undefined): {
  title: string;
  detail: string;
} | null {
  if (!company) return null;
  const { score, missing } = onboardingScore(company);
  if (score >= 100) return null;
  return {
    title: `Setup incomplete — ${company.name}`,
    detail: `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}. Ask an admin to finish client setup — delivery quality improves once this is filled.`,
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  if (isSalesRep(user) && !isAdmin(user)) {
    redirect("/sales");
  }
  if (isAdmin(user)) {
    return (
      <AgencyControlPlane
        tenantId={user.tenantId}
        firstName={displayGivenName(user.name)}
      />
    );
  }
  const companies = await visibleCompanies(user);
  const requests = await visibleRequests(user);
  const content = await visibleContent(user);
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const scope = await accessibleCompanyIds(user);
  const local = await buildLocalDashboard(user.tenantId, scope);
  const canApprove = userHasPermission(user, "approve_content");

  const firstCompany = companies[0];
  const nextUp = nextSpielStep(firstCompany);

  const recentRequests = requests.slice(0, 5);
  const recentContent = content.slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${displayGivenName(user.name)}`}
        explainerId="dashboard"
        explainer="Exceptions and status for your assigned clients — clear blockers, then delivery continues."
      >
        {canApprove ? (
          <Link href="/approvals" className={buttonClasses("default", "sm")}>
            Approvals
          </Link>
        ) : (
          <Link href="/content" className={buttonClasses("default", "sm")}>
            Content
          </Link>
        )}
        {firstCompany ? (
          <Link
            href={`/content?company=${firstCompany.id}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline sm:text-sm"
          >
            {firstCompany.name}
          </Link>
        ) : null}
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-5">
        <section>
          <div className="mb-2">
            <div>
              <h2 className="text-sm font-semibold">Exceptions</h2>
              <p className="text-xs text-muted-foreground">
                Quality holds, overdue approvals, client waits, credit, reconnects, AI signals.
              </p>
            </div>
          </div>
          {local.missingOnboarding.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Delivery is on track — no exceptions right now.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {local.missingOnboarding.slice(0, 6).map((m) => (
                <li key={`onboard-${m.company}`}>
                  <div className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">Onboarding incomplete — {m.company}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Missing {m.missing.length} item(s): {m.missing.slice(0, 3).join(", ")}. An
                        admin needs to finish setup.
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {nextUp && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Setup
            </p>
            <p className="text-sm font-medium">{nextUp.title}</p>
            <p className="text-xs text-muted-foreground">{nextUp.detail}</p>
          </div>
        )}

        {(local.upcoming.length > 0 || local.missingOnboarding.length > 0) && (
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
