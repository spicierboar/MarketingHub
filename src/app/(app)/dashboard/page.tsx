import Link from "next/link";
import { requireUser, isAdmin, accessibleCompanyIds } from "@/lib/auth/rbac";
import {
  visibleCompanies,
  visibleContent,
  visibleRequests,
} from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import { listCompanies, listAiMosOpportunities } from "@/lib/db";
import { buildLocalDashboard } from "@/lib/analytics";
import { buildAgencyOpsBundle } from "@/lib/agency-ops";
import { AgencyAlertsList } from "@/components/agency-ops-panel";
import { onboardingScore } from "@/lib/types";
import type { AgencyAlert } from "@/lib/agency-ops";
import type { AiMosOpportunity, Company } from "@/lib/types";

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  kind: "approval" | "review" | "health" | "ai_mos" | "onboarding";
};

function verbTitleForAlert(alert: AgencyAlert): string {
  switch (alert.kind) {
    case "overdue_approval":
      return `Approve overdue content — ${alert.companyName}`;
    case "overdue_client_review":
      return `Chase client review — ${alert.companyName}`;
    case "health_attention":
      return `Fix marketing health — ${alert.companyName}`;
    default:
      return alert.title;
  }
}

function verbTitleForAiMos(opp: AiMosOpportunity, companyName: string): string {
  const action = opp.suggestedAction;
  if (action.kind === "campaign") {
    return `Draft campaign — ${companyName}`;
  }
  if (action.kind === "content_request") {
    return `Open content request — ${companyName}`;
  }
  return `Act on opportunity — ${companyName}`;
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
          title: "Add your first company",
          detail: "You need a client profile before AI can draft a marketing spiel.",
          href: "/companies",
          cta: "Open companies",
        }
      : null;
  }
  const { score, missing } = onboardingScore(company);
  if (score >= 100) return null;
  return {
    title: `Finish ${company.name} profile`,
    detail: `Still missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}. AI drafts stay weak until this is filled.`,
    href: `/companies/${company.id}`,
    cta: "Complete profile",
  };
}

function buildAttentionItems(input: {
  alerts: AgencyAlert[];
  aiMos: AiMosOpportunity[];
  companyNames: Map<string, string>;
  limit?: number;
}): AttentionItem[] {
  const limit = input.limit ?? 6;
  const items: AttentionItem[] = [];

  for (const alert of input.alerts) {
    items.push({
      id: `alert-${alert.id}`,
      title: verbTitleForAlert(alert),
      detail: alert.detail,
      href: alert.href,
      kind:
        alert.kind === "health_attention"
          ? "health"
          : alert.kind === "overdue_client_review"
            ? "review"
            : "approval",
    });
  }

  for (const opp of input.aiMos) {
    const name = input.companyNames.get(opp.companyId) ?? "Client";
    items.push({
      id: `aimos-${opp.id}`,
      title: verbTitleForAiMos(opp, name),
      detail: opp.diagnosis.slice(0, 140),
      href: "/ai-mos",
      kind: "ai_mos",
    });
  }

  // Prefer approvals/reviews, then AI-MOS, then health — already roughly ordered by mergeAgencyAlerts
  return items.slice(0, limit);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const companies = await visibleCompanies(user);
  const requests = await visibleRequests(user);
  const content = await visibleContent(user);
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c]));

  const local = admin
    ? null
    : await buildLocalDashboard(user.tenantId, await accessibleCompanyIds(user));

  const agencyOps = admin ? await buildAgencyOpsBundle(user.tenantId) : null;
  const aiMosOpen = admin
    ? (await listAiMosOpportunities(user.tenantId, undefined, "open")).slice(0, 4)
    : [];
  const companyNames = new Map(companies.map((c) => [c.id, c.name]));

  const firstCompany = companies[0];
  const nextUp = nextSpielStep(firstCompany, admin);

  const attention = admin
    ? buildAttentionItems({
        alerts: agencyOps?.alerts ?? [],
        aiMos: aiMosOpen,
        companyNames,
      })
    : (local?.missingOnboarding ?? []).slice(0, 6).map((m) => ({
        id: `onboard-${m.company}`,
        title: `Complete onboarding — ${m.company}`,
        detail: `Missing ${m.missing.length} item(s): ${m.missing.slice(0, 3).join(", ")}`,
        href: "/dashboard",
        kind: "onboarding" as const,
      }));

  const recentRequests = requests.slice(0, 5);
  const recentContent = content.slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={
          admin
            ? "Do the next marketing step — then clear anything that needs you."
            : "Your assigned companies and what needs you next."
        }
      >
        <Link href="/studio" className={buttonClasses()}>
          Create marketing spiel
        </Link>
        <Link
          href="/requests/new"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          New support request
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-8 p-6">
        {nextUp && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-accent/40 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Next up
              </p>
              <p className="font-medium">{nextUp.title}</p>
              <p className="text-sm text-muted-foreground">{nextUp.detail}</p>
            </div>
            <Link href={nextUp.href} className={buttonClasses("subtle", "sm")}>
              {nextUp.cta}
            </Link>
          </div>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Needs attention</h2>
              <p className="text-sm text-muted-foreground">
                Actionable next steps — open one, finish it, come back.
              </p>
            </div>
            {admin && aiMosOpen.length > 0 && (
              <Link href="/ai-mos" className="text-sm text-primary hover:underline">
                View AI-MOS
              </Link>
            )}
          </div>
          {attention.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Nothing urgent. Create a marketing spiel when you&apos;re ready.
            </p>
          ) : admin ? (
            <AgencyAlertsList
              alerts={(agencyOps?.alerts ?? []).slice(0, 6).map((a) => ({
                ...a,
                title: verbTitleForAlert(a),
              }))}
              extras={aiMosOpen.slice(0, Math.max(0, 6 - (agencyOps?.alerts.length ?? 0))).map((opp) => {
                const name = companyNames.get(opp.companyId) ?? "Client";
                return {
                  id: `aimos-${opp.id}`,
                  title: verbTitleForAiMos(opp, name),
                  detail: opp.diagnosis.slice(0, 140),
                  href: "/ai-mos",
                  companyName: name,
                };
              })}
            />
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!admin && local && (local.upcoming.length > 0 || local.missingOnboarding.length > 0) && (
          <section>
            <h2 className="mb-3 font-semibold">Coming up</h2>
            {local.upcoming.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {local.upcoming.slice(0, 5).map((u, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-border py-2">
                    <span className="truncate">{u.title}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Recent requests</h2>
            <Link href="/requests" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <div className="divide-y divide-border">
              {recentRequests.map((r) => (
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
              {recentRequests.length === 0 && (
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
        </section>

        {recentContent.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Recent content</h2>
              <Link href="/content" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            <Card>
              <div className="divide-y divide-border">
                {recentContent.map((c) => (
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
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
