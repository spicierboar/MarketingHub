import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import {
  PROMO_INDUSTRY_OPTIONS,
  industryLabel,
  isPlatformPromoId,
  listPromoTemplates,
  agencyTemplateToPromo,
  resolvePromoTemplate,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import type { AgencyPromoTemplate, PromoIndustry } from "@/lib/types";
import {
  PromoCatalogBrowser,
  type PromoCatalogGroup,
  type PromoCatalogRow,
} from "@/components/promo-catalog-browser";
import { PageHeader } from "@/components/page-header";

type CatalogRow = {
  id: string;
  template: PromoTemplate;
  kind: "platform" | "custom";
  override: AgencyPromoTemplate | null;
  hidden: boolean;
};

function groupByIndustry(rows: CatalogRow[]): PromoCatalogGroup[] {
  const map = new Map<PromoIndustry, CatalogRow[]>();
  for (const row of rows) {
    const list = map.get(row.template.industry) ?? [];
    list.push(row);
    map.set(row.template.industry, list);
  }
  const ordered = PROMO_INDUSTRY_OPTIONS.filter((o) => map.has(o.id)).map((o) => ({
    industry: o.id,
    label: o.label,
    rows: (map.get(o.id) ?? [])
      .sort((a, b) => a.template.name.localeCompare(b.template.name))
      .map(
        (r): PromoCatalogRow => ({
          id: r.id,
          template: r.template,
          kind: r.kind,
          hasOverride: Boolean(r.override),
          hidden: r.hidden,
        }),
      ),
  }));
  for (const [industry, list] of map) {
    if (ordered.some((g) => g.industry === industry)) continue;
    ordered.push({
      industry,
      label: industryLabel(industry),
      rows: list
        .sort((a, b) => a.template.name.localeCompare(b.template.name))
        .map(
          (r): PromoCatalogRow => ({
            id: r.id,
            template: r.template,
            kind: r.kind,
            hasOverride: Boolean(r.override),
            hidden: r.hidden,
          }),
        ),
    });
  }
  return ordered;
}

export default async function PromoCatalogPage() {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  const agency = tenant?.promoCatalog ?? [];
  const overrides = new Map(
    agency.filter((t) => isPlatformPromoId(t.id)).map((t) => [t.id, t]),
  );

  const rows: CatalogRow[] = [
    ...listPromoTemplates().map((base) => {
      const ov = overrides.get(base.id) ?? null;
      const effective = resolvePromoTemplate(base.id, agency) ?? base;
      return {
        id: base.id,
        template: effective,
        kind: "platform" as const,
        override: ov,
        hidden: ov?.active === false,
      };
    }),
    ...agency
      .filter((t) => !isPlatformPromoId(t.id))
      .map((raw) => ({
        id: raw.id,
        template: agencyTemplateToPromo(raw),
        kind: "custom" as const,
        override: raw,
        hidden: raw.active === false,
      })),
  ];

  const displayRows = rows.map((row) => {
    if (row.kind === "platform" && row.hidden && row.override) {
      return { ...row, template: agencyTemplateToPromo(row.override) };
    }
    return row;
  });

  const groups = groupByIndustry(displayRows);
  const totalActive = displayRows.filter((r) => !r.hidden).length;

  return (
    <div>
      <PageHeader
        title="Promo catalog"
        explainerId="agency-promo-catalog"
        explainer="Pick an industry to load packs. Edit and Add open as modals — changes stay in your workspace."
      >
        <Link href="/companies" className="text-sm text-primary hover:underline">
          Clients
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <PromoCatalogBrowser
          groups={groups}
          totalActive={totalActive}
          totalRows={displayRows.length}
        />
      </div>
    </div>
  );
}
