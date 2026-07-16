import { requireAdmin } from "@/lib/auth/rbac";
import {
  listCompanies,
  listContent,
  listIntegrations,
  usersForCompany,
} from "@/lib/db";
import { clientCompaniesOnly } from "@/lib/content-create-scope";
import { onboardingScore } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { AddClientModalTrigger } from "@/components/add-client-modal";
import {
  CompanyLifecycleRow,
  type LifecycleStep,
} from "@/components/company-lifecycle-row";

export default async function CompaniesPage() {
  const user = await requireAdmin();
  const [companiesRaw, allContent, allIntegrations] = await Promise.all([
    listCompanies(user.tenantId),
    listContent(user.tenantId),
    listIntegrations(user.tenantId),
  ]);
  const companies = clientCompaniesOnly(companiesRaw);
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
        title="Clients"
        explainerId="clients"
        explainer="One row per client — lifecycle stages on the right. Open a client to run its workspace. Add client opens a quick form (or the full New client wizard if needed)."
      >
        <AddClientModalTrigger />
      </PageHeader>

      {companies.length === 0 ? (
        <div className="p-6">
          <p className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No companies yet.{" "}
            <AddClientModalTrigger linkStyle label="Add the first client" />
          </p>
        </div>
      ) : (
        <div className="border-t border-border bg-card">
          {companies.map((c) => {
            const { score } = onboardingScore(c);
            const socialOk = (c.profile.socialLinks?.length ?? 0) > 0;
            const connected = allIntegrations.some(
              (i) => i.companyId === c.id && i.status === "connected",
            );
            const hasApprovedContent = allContent.some(
              (item) =>
                item.companyId === c.id &&
                ["approved", "scheduled", "published"].includes(item.status),
            );
            const steps: LifecycleStep[] = [
              {
                id: "profile",
                label: "Profile",
                done: score === 100,
                href: `/companies/${c.id}`,
              },
              {
                id: "social",
                label: "Social links",
                done: socialOk,
                href: `/companies/${c.id}`,
              },
              {
                id: "connect",
                label: "Connect",
                done: connected,
                href: `/publishing?company=${c.id}`,
              },
              {
                id: "content",
                label: "First content",
                done: hasApprovedContent,
                href: `/studio?company=${c.id}`,
              },
              {
                id: "ai_ready",
                label: "AI-ready",
                done: c.status === "ai_ready",
                href: `/companies/${c.id}`,
              },
            ];

            return (
              <CompanyLifecycleRow
                key={c.id}
                company={c}
                industry={c.profile.industry ?? "Industry not set"}
                location={c.profile.serviceAreas[0] ?? "No location"}
                userCount={userCounts.get(c.id) ?? 0}
                steps={steps}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
