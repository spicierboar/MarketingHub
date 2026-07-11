import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { listAssets } from "@/lib/db";
import { accessibleCompanyIds } from "@/lib/auth/rbac";
import { assetUsableReason, licenceLabel } from "@/lib/assets";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { RegisterAssetModalTrigger } from "@/components/register-asset-modal";
import { now, titleCase } from "@/lib/utils";
import type { Asset, Company } from "@/lib/types";
import { ImageBriefCard } from "./image-brief-card";

const TYPE_FILTERS: [string, string][] = [
  ["", "All types"],
  ["logo", "Logos"],
  ["image", "Images"],
  ["video", "Videos"],
  ["graphic", "Graphics"],
  ["document", "Documents"],
  ["audio", "Audio"],
];
const STATUS_FILTERS: [string, string][] = [
  ["", "All statuses"],
  ["draft", "Draft"],
  ["pending_approval", "Pending approval"],
  ["changes_required", "Changes required"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["archived", "Archived"],
];

async function rightsSummary(asset: Asset, today: string): Promise<{ label: string; tone: "success" | "warning" | "danger" | "neutral" }> {
  const unusable = await assetUsableReason(asset, today);
  if (unusable) return { label: titleCase(unusable).replace("Ugc", "UGC"), tone: "danger" };
  const ch = asset.usageRights.allowedChannels;
  if (ch.length === 0) return { label: "All channels", tone: "success" };
  return { label: ch.join(", "), tone: "warning" };
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; type?: string; status?: string; tag?: string }>;
}) {
  const user = await requireUser();
  const companies = await visibleCompanies(user);
  const companyIds = await accessibleCompanyIds(user);
  const byId = new Map<string, Company>(companies.map((c) => [c.id, c]));
  const sp = await searchParams;
  const today = now().slice(0, 10);

  let assets = await listAssets(user.tenantId, companyIds);
  if (sp.company) assets = assets.filter((a) => a.companyId === sp.company);
  if (sp.type) assets = assets.filter((a) => a.assetType === sp.type);
  if (sp.status) assets = assets.filter((a) => a.status === sp.status);
  if (sp.tag) assets = assets.filter((a) => a.tags.includes(sp.tag!));

  // Precompute rights summaries (assetUsableReason is async) for the JSX below.
  const rightsById = new Map(
    await Promise.all(
      assets.map(
        async (a) => [a.id, await rightsSummary(a, today)] as const,
      ),
    ),
  );

  // Group by company for the folder view.
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const list = groups.get(a.companyId) ?? [];
    list.push(a);
    groups.set(a.companyId, list);
  }

  return (
    <div>
      <PageHeader
        title="Creative Assets"
        description="Brand-safe logos, images and videos with usage-rights tracking. Only approved, rights-cleared assets can be used in content."
      >
        <Link href="/assets/templates" className={buttonClasses("ghost", "sm")}>
          Brand templates
        </Link>
        <RegisterAssetModalTrigger
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          defaultCompanyId={
            sp.company && byId.has(sp.company) ? sp.company : undefined
          }
        />
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              <form className="grid gap-3 sm:grid-cols-3">
                <Field label="Client">
                  <Select name="company" defaultValue={sp.company ?? ""}>
                    <option value="">All clients</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type">
                  <Select name="type" defaultValue={sp.type ?? ""}>
                    {TYPE_FILTERS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Status">
                  <Select name="status" defaultValue={sp.status ?? ""}>
                    {STATUS_FILTERS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-3">
                  <button type="submit" className={buttonClasses("outline", "sm")}>
                    Apply filters
                  </button>
                  {(sp.company || sp.type || sp.status || sp.tag) && (
                    <Link href="/assets" className="ml-2 text-sm text-primary hover:underline">
                      Clear
                    </Link>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {assets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No assets match. Register one to get started.
              </CardContent>
            </Card>
          ) : (
            [...groups.entries()].map(([cid, list]) => (
              <div key={cid}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {byId.get(cid)?.name ?? cid} · {list.length}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((a) => {
                    const rights = rightsById.get(a.id)!;
                    return (
                      <Link key={a.id} href={`/assets/${a.id}`}>
                        <Card className="h-full transition-colors hover:border-primary/40">
                          <CardContent className="space-y-2 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium leading-tight">{a.name}</span>
                              <StatusBadge status={a.status} />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <Badge tone="neutral">{titleCase(a.assetType)}</Badge>
                              <Badge tone="info">{licenceLabel(a.usageRights.licenceType)}</Badge>
                              {a.folder && (
                                <span className="text-muted-foreground">📁 {a.folder}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground">Channels:</span>
                              <Badge tone={rights.tone}>{rights.label}</Badge>
                            </div>
                            {a.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {a.tags.slice(0, 4).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-6">
          <ImageBriefCard
            companies={companies.filter(
              (c) => c.status === "ai_ready" || c.status === "approved",
            )}
          />
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              <h2 className="mb-2 font-semibold text-foreground">Usage rights</h2>
              <p>
                Every asset records its owner, licence, consent, permitted channels
                and expiry. Content that references an asset is{" "}
                <span className="font-medium text-foreground">blocked</span> from any
                channel the asset&apos;s rights don&apos;t allow — at scheduling and
                again at publish time.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
