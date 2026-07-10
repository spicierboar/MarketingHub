import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, usersForCompany } from "@/lib/db";
import { onboardingScore } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";

export default async function CompaniesPage() {
  const user = await requireAdmin();
  const companies = await listCompanies(user.tenantId);
  const userCounts = new Map(
    await Promise.all(
      companies.map(
        async (c) => [c.id, (await usersForCompany(c.id)).length] as const,
      ),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Open a company to run campaigns, inbox, CRM, ads, and the rest — tools live in the company workspace, not the global sidebar."
      >
        <Link href="/companies/new" className={buttonClasses()}>
          Add company
        </Link>
      </PageHeader>

      <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => {
          const { score } = onboardingScore(c);
          const users = userCounts.get(c.id) ?? 0;
          return (
            <Link
              key={c.id}
              href={`/companies/${c.id}`}
              className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <StatusBadge status={c.status} />
              </div>
              <p className="mb-3 text-sm text-muted-foreground">
                {c.profile.industry ?? "Industry not set"} ·{" "}
                {c.profile.serviceAreas[0] ?? "No location"}
              </p>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Onboarding</span>
                <span className="font-medium">{score}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${score === 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {users} user{users === 1 ? "" : "s"} assigned
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
