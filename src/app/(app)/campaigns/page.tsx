import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { accessibleCompanyIds } from "@/lib/auth/rbac";
import { getCompany, listCampaignItems, listCampaigns } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const allowed = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;
  const campaigns = (await listCampaigns(user.tenantId)).filter(
    (c) =>
      allowed.has(c.companyId) &&
      (!companyId || c.companyId === companyId),
  );
  const newHref = companyId
    ? `/campaigns/new?company=${companyId}`
    : "/campaigns/new";
  const itemsByCampaign = new Map(
    await Promise.all(
      campaigns.map(
        async (c) => [c.id, await listCampaignItems(c.id)] as const,
      ),
    ),
  );
  const companyById = new Map(
    await Promise.all(
      campaigns.map(
        async (c) => [c.companyId, await getCompany(c.companyId)] as const,
      ),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Full AI-planned campaigns — every item goes through the governed content pipeline."
      >
        <Link href={newHref} className={buttonClasses()}>
          New campaign
        </Link>
      </PageHeader>

      <div className="p-6">
        {campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No campaigns yet.{" "}
            <Link href={newHref} className="text-primary hover:underline">
              Plan the first one
            </Link>
            {" "}or convert a campaign-type support request.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => {
              const items = itemsByCampaign.get(c.id)!;
              const done = items.filter((i) =>
                ["drafted", "approved"].includes(i.status),
              ).length;
              return (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{c.name}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {companyById.get(c.companyId)?.name} · {c.durationDays}-day ·
                    starts {formatDate(c.startDate).split(",")[0]}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {c.objective}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {done}/{items.length} items drafted
                    </span>
                    {c.requestId && <span>from request</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
