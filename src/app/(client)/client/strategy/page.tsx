import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { localDemoEnabled } from "@/lib/env";
import {
  portalApproveDetailedStrategyAction,
  portalRequestDetailedStrategyChangesAction,
} from "../../actions";
import { ensureAndKickManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { buildCompanyStrategyView } from "@/lib/managed-service/strategy-view";
import { CompanyStrategyPanel } from "@/components/company-strategy-panel";
import {
  StrategyLifecycleActions,
  StrategyActionButton,
} from "@/components/detailed-strategy-document";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default async function ClientStrategyPage({
  searchParams,
}: {
  searchParams?: Promise<{ list?: string; v?: string }>;
}) {
  const { user, companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) notFound();
  const sp = (await searchParams) ?? {};

  try {
    await ensureAndKickManagedDeliveryForCompany({
      actor: user,
      tenantId: user.tenantId,
      companyId,
      reason: "manual",
      process: true,
      demoForceGenerate: localDemoEnabled(),
    });
  } catch {
    /* soft */
  }

  const refreshed = (await getCompany(companyId)) ?? company;
  const versionNum = sp.v ? Number(sp.v) : null;
  const showingList = sp.list === "1" || sp.list === "true";
  const view = await buildCompanyStrategyView(refreshed, {
    demoImmediate: localDemoEnabled(),
    version: Number.isFinite(versionNum) ? versionNum : null,
  });

  const doc = view.detailedStrategy;
  const listHref = "/client/strategy?list=1";
  const versionHref = (version: number) => `/client/strategy?v=${version}`;

  const lifecycleActions =
    doc && !showingList ? (
      <StrategyLifecycleActions
        status={doc.status}
        audience="client"
        approveAction={
          <form action={portalApproveDetailedStrategyAction}>
            <StrategyActionButton label="Approve strategy" />
          </form>
        }
        changesAction={
          <form action={portalRequestDetailedStrategyChangesAction} className="flex flex-wrap gap-2">
            <input
              type="text"
              name="note"
              placeholder="What should change?"
              className="h-8 min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 text-sm"
            />
            <Button type="submit" size="sm" variant="outline">
              Request changes
            </Button>
          </form>
        }
      />
    ) : null;

  return (
    <div>
      <PageHeader
        title="Strategy"
        explainerId="client-strategy"
        explainer="Your marketing package plan and delivery roadmap — what is included, when work runs, and the strategy we execute against. Nothing publishes without your approval."
        parent={{ href: "/client/account", label: "Overview" }}
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <CompanyStrategyPanel
          view={view}
          audience="client"
          calendarHref="/client/calendar"
          listHref={listHref}
          versionHref={versionHref}
          showingList={showingList}
          lifecycleActions={lifecycleActions}
        />
      </div>
    </div>
  );
}
