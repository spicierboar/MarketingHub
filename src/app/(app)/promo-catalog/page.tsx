import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import {
  industryLabel,
  isPlatformPromoId,
  listPromoTemplates,
  agencyTemplateToPromo,
  promoIndustryOptions,
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

function toCatalogRow(r: CatalogRow): PromoCatalogRow {
  return {
    id: r.id,
    template: r.template,
    kind: r.kind,
    hasOverride: Boolean(r.override),
    hidden: r.hidden,
  };
}

function groupByIndustry(
  rows: CatalogRow[],
  options: { id: string; label: string }[],
  customIndustryIds: Set<string>,
): PromoCatalogGroup[] {
  const map = new Map<PromoIndustry, CatalogRow[]>();
  for (const row of rows) {
    const list = map.get(row.template.industry) ?? [];
    list.push(row);
    map.set(row.template.industry, list);
  }

  const ordered: PromoCatalogGroup[] = [];
  const seen = new Set<string>();

  for (const o of options) {
    const list = map.get(o.id) ?? [];
    // Platform industries only when they have packs; custom industries always
    // (so a newly added industry appears empty until promos are added).
    if (list.length === 0 && !customIndustryIds.has(o.id)) continue;
    ordered.push({
      industry: o.id,
      label: o.label,
      rows: list
        .sort((a, b) => a.template.name.localeCompare(b.template.name))
        .map(toCatalogRow),
    });
    seen.add(o.id);
  }

  for (const [industry, list] of map) {
    if (seen.has(industry)) continue;
    ordered.push({
      industry,
      label: industryLabel(industry, options),
      rows: list
        .sort((a, b) => a.template.name.localeCompare(b.template.name))
        .map(toCatalogRow),
    });
  }
  return ordered;
}

export default async function PromoCatalogPage() {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  const agency = tenant?.promoCatalog ?? [];
  const customIndustries = tenant?.promoIndustries ?? [];
  const industryOptions = promoIndustryOptions(customIndustries);
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

  const groups = groupByIndustry(
    displayRows,
    industryOptions,
    new Set(customIndustries.map((i) => i.id)),
  );
  const totalActive = displayRows.filter((r) => !r.hidden).length;

  return (
    <div>
      <PageHeader
        title="Promo catalog"
        explainerId="agency-promo-catalog"
        explainer="Pick an industry to load packs. Add industry or Add promo open as modals — changes stay in your workspace."
      >
        <Link href="/companies" className="text-sm text-primary hover:underline">
          Clients
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <PromoCatalogBrowser
          groups={groups}
          industryOptions={industryOptions}
          totalActive={totalActive}
          totalRows={displayRows.length}
        />
      </div>
    </div>
  );
}
