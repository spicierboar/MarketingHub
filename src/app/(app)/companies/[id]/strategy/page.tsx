import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { localDemoEnabled } from "@/lib/env";
import {
  forceUnlockManagedStrategyAction,
  submitDetailedStrategyForClientReviewAction,
} from "../../actions";
import { ensureAndKickManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { buildCompanyStrategyView } from "@/lib/managed-service/strategy-view";
import { CompanyStrategyPanel } from "@/components/company-strategy-panel";
import { StrategyLifecycleActions, StrategyActionButton } from "@/components/detailed-strategy-document";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default async function CompanyStrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ list?: string; v?: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  // On-read: package assigned but delivery missing → enqueue; demo auto-generates.
  try {
    await ensureAndKickManagedDeliveryForCompany({
      actor: user,
      tenantId: user.tenantId,
      companyId: company.id,
      reason: "manual",
      process: true,
      demoForceGenerate: localDemoEnabled(),
    });
  } catch {
    /* soft — unlock CTA still available */
  }

  const refreshed = (await getCompany(id)) ?? company;
  const versionNum = sp.v ? Number(sp.v) : null;
  const showingList = sp.list === "1" || sp.list === "true";
  const view = await buildCompanyStrategyView(refreshed, {
    demoImmediate: localDemoEnabled(),
    version: Number.isFinite(versionNum) ? versionNum : null,
  });

  const showGenerateCta =
    view.visibility === "waiting" ||
    view.visibility === "preparing" ||
    (Boolean(refreshed.profile.managedService?.marketingPackageId) &&
      view.visibility !== "ready" &&
      view.visibility !== "needs_package");

  const unlockForm = showGenerateCta ? (
    <form action={forceUnlockManagedStrategyAction} className="mt-2">
      <input type="hidden" name="companyId" value={company.id} />
      <Button type="submit" size="sm" variant="outline">
        {localDemoEnabled() ? "Generate strategy now (demo)" : "Unlock & generate now"}
      </Button>
    </form>
  ) : null;

  const doc = view.detailedStrategy;
  const listHref = `/companies/${company.id}/strategy?list=1`;
  const versionHref = (version: number) =>
    `/companies/${company.id}/strategy?v=${version}`;

  const lifecycleActions =
    doc && !showingList ? (
      <StrategyLifecycleActions
        status={doc.status}
        audience="agency"
        submitAction={
          <form action={submitDetailedStrategyForClientReviewAction}>
            <input type="hidden" name="companyId" value={company.id} />
            <StrategyActionButton label="Submit to client review" />
          </form>
        }
      />
    ) : null;

  return (
    <div>
      <PageHeader
        title="Strategy"
        explainerId="company-strategy"
        explainer="Full marketing strategy for this client — objectives, personas, channels, 30/60/90 roadmap. Drafted after signup delay; never auto-published."
      >
        <Link
          href={`/companies/${company.id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Overview
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-4 p-6">
        {unlockForm && view.visibility !== "ready" ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">{unlockForm}</div>
        ) : null}
        <CompanyStrategyPanel
          view={view}
          audience="agency"
          campaignLink={view.campaignHref}
          unlockAction={unlockForm}
          calendarHref={`/calendar?company=${company.id}`}
          packageHref={`/companies/${company.id}#package-service`}
          listHref={listHref}
          versionHref={versionHref}
          showingList={showingList}
          lifecycleActions={lifecycleActions}
        />
        <p className="text-xs text-muted-foreground">
          Signup delivery window: {view.eligibleHours}–{view.dueHours} hours after onboarding
          (eligible at +{view.eligibleHours}h, due by +{view.dueHours}h). Package changes skip the
          wait. Cron / on-read advances eligible runs; AI uses Claude when keyed, else a structured
          template (objectives, channels, roadmap — not a single paragraph).
        </p>
      </div>
    </div>
  );
}
