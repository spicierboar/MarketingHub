import {
  computePromoPricing,
  listPromoTemplates,
  templatesForCompany,
} from "@/lib/promo-catalog";
import { stubGbpCompany } from "@/lib/selftest/gbp-audit";

export async function checkPromoCatalogByIndustry(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const all = listPromoTemplates();
  const byIndustry = {
    restaurant_cafe: all.filter((t) => t.industry === "restaurant_cafe").length,
    retail: all.filter((t) => t.industry === "retail").length,
    fast_food: all.filter((t) => t.industry === "fast_food").length,
    hotel: all.filter((t) => t.industry === "hotel").length,
    fitness: all.filter((t) => t.industry === "fitness").length,
    beauty_salon: all.filter((t) => t.industry === "beauty_salon").length,
    professional: all.filter((t) => t.industry === "professional").length,
  };
  const countsOk =
    all.length === 30 &&
    byIndustry.restaurant_cafe === 6 &&
    byIndustry.retail === 6 &&
    byIndustry.fast_food === 4 &&
    byIndustry.hotel === 5 &&
    byIndustry.fitness === 4 &&
    byIndustry.beauty_salon === 3 &&
    byIndustry.professional === 2 &&
    all.every((t) => t.outlines.length >= 3 && t.outlines.length <= 5) &&
    all.every((t) => t.outlines.every((o) => o.caption && o.hashtags && o.cta));

  const retail = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      businessType: "retail",
      industry: "Retail boutique",
    },
  });
  const hotel = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      businessType: "hotel",
      industry: "Boutique hotel",
    },
  });
  const qsr = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      businessType: "restaurant_cafe",
      industry: "Fast food burger",
    },
  });
  const gym = stubGbpCompany({
    profile: {
      ...stubGbpCompany().profile,
      businessType: "other",
      industry: "Fitness gym",
    },
  });

  const r = templatesForCompany(retail);
  const h = templatesForCompany(hotel);
  const f = templatesForCompany(qsr);
  const g = templatesForCompany(gym);
  const filterOk =
    r.some((t) => t.industry === "retail") &&
    h.some((t) => t.industry === "hotel") &&
    f.some((t) => t.industry === "fast_food") &&
    g.some((t) => t.industry === "fitness");

  const ok = countsOk && filterOk;
  return {
    ok,
    detail: ok
      ? `30 templates · retail=${r.length} hotel=${h.length} qsr=${f.length} gym=${g.length}`
      : `counts=${JSON.stringify(byIndustry)} total=${all.length} filterOk=${filterOk}`,
  };
}

export async function checkPromoMarkupMath(): Promise<{ ok: boolean; detail: string }> {
  // Client package $269 at 49% markup on cost → media ≈ 180.54, fee ≈ 88.46
  const p = computePromoPricing(269, 0.49);
  const ok =
    p.totalUsd === 269 &&
    p.budgetUsd === 180.54 &&
    p.feeUsd === 88.46;
  return {
    ok,
    detail: ok ? `fee=${p.feeUsd} media=${p.budgetUsd} total=${p.totalUsd}` : JSON.stringify(p),
  };
}
