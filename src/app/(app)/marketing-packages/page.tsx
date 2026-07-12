import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import {
  ADS_MEDIA_ALWAYS_EXTRA,
  resolveMarketingPackages,
} from "@/lib/marketing-packages";
import { PageHeader } from "@/components/page-header";
import { MarketingPackagesBrowser } from "@/components/marketing-packages-browser";

export default async function MarketingPackagesPage() {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  const packages = resolveMarketingPackages(tenant);
  const overrideIds = new Set(
    (tenant?.marketingPackageCatalog ?? []).map((o) => o.id),
  );

  const rows = packages.map((pkg) => ({
    pkg,
    hasOverride: overrideIds.has(pkg.id),
  }));

  return (
    <div>
      <PageHeader
        title="Marketing packages"
        description="Company delivery SKUs. Edit one package at a time. Ad media is always extra."
      >
        <Link href="/promo-catalog" className="text-sm text-primary hover:underline">
          Promo catalog
        </Link>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Workspace overrides only. Inactive packages are hidden from client
          signup.
          {ADS_MEDIA_ALWAYS_EXTRA
            ? " Ads management may be included; media is billed via prepaid credit."
            : null}
        </p>
        <MarketingPackagesBrowser rows={rows} />
      </div>
    </div>
  );
}
