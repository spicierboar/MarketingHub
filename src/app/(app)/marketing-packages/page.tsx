import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import {
  ADS_MEDIA_ALWAYS_EXTRA,
  resolveMarketingPackages,
} from "@/lib/marketing-packages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import {
  resetMarketingPackageOverrideAction,
  saveMarketingPackageOverrideAction,
} from "./actions";

export default async function MarketingPackagesPage() {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  const packages = resolveMarketingPackages(tenant);
  const overrideIds = new Set(
    (tenant?.marketingPackageCatalog ?? []).map((o) => o.id),
  );

  return (
    <div>
      <PageHeader
        title="Marketing packages"
        description="Company delivery SKUs (Basic / Pro / Blast / Custom). Separate from your workspace SaaS plan. Ad media spend is always extra."
      >
        <Link href="/promo-catalog" className="text-sm text-primary hover:underline">
          Promo catalog
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Edits apply to this workspace only. Inactive packages are hidden from
          client signup.{" "}
          {ADS_MEDIA_ALWAYS_EXTRA
            ? "Ads management may be included; media is always billed via prepaid credit."
            : null}
        </p>

        <div className="grid gap-6 xl:grid-cols-2">
          {packages.map((pkg) => {
            const hasOverride = overrideIds.has(pkg.id);
            return (
              <Card key={pkg.id}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{pkg.name}</h2>
                      <p className="text-xs text-muted-foreground">id: {pkg.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={pkg.active ? "success" : "neutral"}>
                        {pkg.active ? "Active" : "Inactive"}
                      </Badge>
                      {hasOverride ? (
                        <Badge tone="warning">Customised</Badge>
                      ) : (
                        <Badge tone="neutral">Platform default</Badge>
                      )}
                      {pkg.adsManagementIncluded ? (
                        <Badge tone="primary">Ads mgmt</Badge>
                      ) : null}
                    </div>
                  </div>

                  <form
                    action={saveMarketingPackageOverrideAction}
                    className="space-y-3"
                  >
                    <input type="hidden" name="packageId" value={pkg.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name" htmlFor={`name-${pkg.id}`}>
                        <Input
                          id={`name-${pkg.id}`}
                          name="name"
                          defaultValue={pkg.name}
                          required
                        />
                      </Field>
                      <Field
                        label="Price (A$/mo)"
                        htmlFor={`price-${pkg.id}`}
                        hint={
                          pkg.id === "custom"
                            ? "Floor for custom builds (≥ Basic)."
                            : undefined
                        }
                      >
                        <Input
                          id={`price-${pkg.id}`}
                          name="priceAudMonthly"
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={pkg.priceAudMonthly}
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Blurb" htmlFor={`blurb-${pkg.id}`}>
                      <Textarea
                        id={`blurb-${pkg.id}`}
                        name="blurb"
                        defaultValue={pkg.blurb}
                        rows={3}
                      />
                    </Field>
                    <Field
                      label="Channels"
                      htmlFor={`channels-${pkg.id}`}
                      hint="Comma-separated (e.g. instagram, facebook, gbp)."
                    >
                      <Input
                        id={`channels-${pkg.id}`}
                        name="channels"
                        defaultValue={pkg.channels.join(", ")}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Posts / mo" htmlFor={`posts-${pkg.id}`}>
                        <Input
                          id={`posts-${pkg.id}`}
                          name="postsPerMonth"
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={pkg.postsPerMonth}
                        />
                      </Field>
                      <Field label="Campaigns / mo" htmlFor={`campaigns-${pkg.id}`}>
                        <Input
                          id={`campaigns-${pkg.id}`}
                          name="campaignsPerMonth"
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={pkg.campaignsPerMonth}
                        />
                      </Field>
                      <Field
                        label="Promos / mo"
                        htmlFor={`promos-${pkg.id}`}
                        hint={
                          pkg.id === "basic"
                            ? "Platform default ≈ 1/quarter (0.33)."
                            : undefined
                        }
                      >
                        <Input
                          id={`promos-${pkg.id}`}
                          name="promosIncludedPerMonth"
                          type="number"
                          min={0}
                          step={0.01}
                          defaultValue={
                            Number.isInteger(pkg.promosIncludedPerMonth)
                              ? pkg.promosIncludedPerMonth
                              : Math.round(pkg.promosIncludedPerMonth * 100) / 100
                          }
                        />
                      </Field>
                    </div>
                    <Field
                      label="Default service level"
                      htmlFor={`level-${pkg.id}`}
                    >
                      <Select
                        id={`level-${pkg.id}`}
                        name="defaultServiceLevel"
                        defaultValue={pkg.defaultServiceLevel}
                      >
                        <option value="approval">Approval</option>
                        <option value="managed_exceptions">Managed exceptions</option>
                        <option value="fully_managed">Fully managed</option>
                      </Select>
                    </Field>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="adsManagementIncluded"
                          defaultChecked={pkg.adsManagementIncluded}
                          className="h-4 w-4"
                        />
                        Ads management included
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={pkg.active}
                          className="h-4 w-4"
                        />
                        Active (shown at signup)
                      </label>
                    </div>
                    <Field label="Included add-ons" hint="Optional package inclusions.">
                      <div className="flex flex-wrap gap-3 text-sm">
                        {(
                          [
                            ["video", "AI video"],
                            ["photo", "Photo"],
                            ["menus", "Menus"],
                            ["order_button", "Order button"],
                            ["bookings", "Bookings"],
                          ] as const
                        ).map(([id, label]) => (
                          <label key={id} className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="includedAddonIds"
                              value={id}
                              defaultChecked={pkg.includedAddonIds.includes(id)}
                              className="h-4 w-4"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </Field>
                    {pkg.id === "custom" ? (
                      <Field
                        label="Custom module rates (JSON)"
                        htmlFor={`rates-${pkg.id}`}
                        hint='Optional rate card, e.g. {"postsPerMonth":25,"adsManagement":150}'
                      >
                        <Textarea
                          id={`rates-${pkg.id}`}
                          name="customModuleRates"
                          rows={2}
                          defaultValue={
                            pkg.customModuleRates &&
                            Object.keys(pkg.customModuleRates).length > 0
                              ? JSON.stringify(pkg.customModuleRates)
                              : ""
                          }
                          placeholder='{"postsPerMonth":25}'
                        />
                      </Field>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="submit" size="sm">
                        Save package
                      </Button>
                    </div>
                  </form>

                  {hasOverride ? (
                    <form action={resetMarketingPackageOverrideAction}>
                      <input type="hidden" name="packageId" value={pkg.id} />
                      <Button type="submit" variant="outline" size="sm">
                        Reset to platform default
                      </Button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
