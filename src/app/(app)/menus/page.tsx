import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listMenuDesigns } from "@/lib/db";
import { ADDONS } from "@/lib/addons";
import { companyAddonMap } from "@/lib/entitlements";
import {
  menuDesignStatusLabel,
  menuDesignSummary,
  menuQuotaSummary,
  MENUS_INCLUDED_PER_YEAR,
} from "@/lib/menu-design";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { Company, MenuDesign, MenuDesignStatus } from "@/lib/types";
import {
  advanceMenuDesignAction,
  linkMenuAssetAction,
  requestMenuDesignAction,
} from "./actions";

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);
  const addons = company ? await companyAddonMap(user.tenantId, company.id) : null;

  const designs = companyId
    ? await listMenuDesigns(user.tenantId, companyId)
    : [];
  const quota = menuQuotaSummary(designs);
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Restaurant Menus"
        description="Designed-menu deliverables for restaurant clients — 2 included redesigns per year, then per-menu billing."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Badge tone="neutral">
            {MENUS_INCLUDED_PER_YEAR} free menus / restaurant / year
          </Badge>
          {company && addons?.menus && (
            <Badge tone={quota.remaining > 0 ? "success" : "warning"}>
              {year}: {quota.used}/{quota.limit} included used
              {quota.remaining > 0 ? ` · ${quota.remaining} remaining` : " · additional menus billable"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Client" htmlFor="menu-company">
              <Select id="menu-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
          {company && addons && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add-on:{" "}
              {addons.menus ? (
                <span className="text-foreground">
                  {ADDONS.menus.icon} {ADDONS.menus.name}
                </span>
              ) : (
                <span>
                  {ADDONS.menus.icon} {ADDONS.menus.name} (off) — enable on{" "}
                  <a href="/billing" className="text-primary underline">
                    Billing
                  </a>
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {company && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">{ADDONS.menus.icon} Request a menu design</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {ADDONS.menus.includedNote} Additional menus are billed per design.
            </p>
            {!addons?.menus ? (
              <p className="text-sm text-amber-700">
                Enable the Designed menus add-on on Billing first.
              </p>
            ) : (
              <>
                <form action={requestMenuDesignAction} className="mb-6 space-y-3 border-b pb-6">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Field label="Menu title" htmlFor="md-title">
                    <Input id="md-title" name="title" required placeholder="e.g. Summer lunch menu" />
                  </Field>
                  <Field label="Brief" htmlFor="md-brief">
                    <Textarea
                      id="md-brief"
                      name="brief"
                      required
                      className="min-h-20"
                      placeholder="Sections, dishes, dietary notes, brand tone…"
                    />
                  </Field>
                  <Field label="Format" htmlFor="md-format">
                    <Select id="md-format" name="format" defaultValue="both">
                      <option value="print">Print (A4/A5)</option>
                      <option value="digital">Digital (QR / screen)</option>
                      <option value="both">Print + digital</option>
                    </Select>
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Next request will be{" "}
                    <strong>{quota.remaining > 0 ? "included (free)" : "billable"}</strong> for {year}.
                  </p>
                  <Button type="submit">Request menu design</Button>
                </form>

                {designs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No menu designs yet.</p>
                ) : (
                  <div className="space-y-4">
                    <h3 className="font-medium">Menu designs</h3>
                    {designs.map((design) => (
                      <DesignRow key={design.id} design={design} company={company} />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DesignRow({ design, company }: { design: MenuDesign; company: Company }) {
  const billingTone = design.billingClass === "included" ? "success" : "warning";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{design.title}</p>
          <p className="text-sm text-muted-foreground">{menuDesignSummary(design)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {design.format} · requested {formatDate(design.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={design.status} />
          <Badge tone={billingTone}>
            {design.billingClass === "included" ? "Included" : "Billable"}
          </Badge>
        </div>
      </div>
      <p className="mt-2 text-sm">{design.brief}</p>
      {design.designerNotes && (
        <p className="mt-2 text-sm text-muted-foreground">
          Designer: {design.designerNotes}
        </p>
      )}
      {design.deliverableAssetIds.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Deliverables: {design.deliverableAssetIds.join(", ")}
        </p>
      )}

      <AdvanceForms design={design} />
    </div>
  );
}

function AdvanceForms({ design }: { design: MenuDesign }) {
  if (design.status === "cancelled" || design.status === "completed") {
    return null;
  }

  const next: Partial<Record<MenuDesignStatus, MenuDesignStatus>> = {
    requested: "in_design",
    in_design: "client_review",
    client_review: "delivered",
    delivered: "completed",
  };
  const forward = next[design.status];

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {forward && (
        <form action={advanceMenuDesignAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="designId" value={design.id} />
          <input type="hidden" name="to" value={forward} />
          {(forward === "in_design" || forward === "delivered") && (
            <Field label="Designer notes" htmlFor={`notes-${design.id}`}>
              <Input id={`notes-${design.id}`} name="designerNotes" placeholder="Optional" />
            </Field>
          )}
          <Button type="submit" size="sm">
            → {menuDesignStatusLabel(forward)}
          </Button>
        </form>
      )}
      {design.status === "client_review" && (
        <form action={advanceMenuDesignAction}>
          <input type="hidden" name="designId" value={design.id} />
          <input type="hidden" name="to" value="in_design" />
          <Button type="submit" size="sm" variant="outline">
            ← Back to design
          </Button>
        </form>
      )}
      <form action={advanceMenuDesignAction}>
        <input type="hidden" name="designId" value={design.id} />
        <input type="hidden" name="to" value="cancelled" />
        <Button type="submit" size="sm" variant="outline">
          Cancel
        </Button>
      </form>
      {["in_design", "client_review", "delivered"].includes(design.status) && (
        <form action={linkMenuAssetAction} className="flex items-end gap-2">
          <input type="hidden" name="designId" value={design.id} />
          <Field label="Link asset ID" htmlFor={`asset-${design.id}`}>
            <Input id={`asset-${design.id}`} name="assetId" placeholder="asset_…" className="w-40" />
          </Field>
          <Button type="submit" size="sm" variant="outline">
            Link deliverable
          </Button>
        </form>
      )}
    </div>
  );
}
