// Marketing packages (company-level delivery SKUs).
// Separate from tenant SaaS plans in `src/lib/plans.ts`.
// PURE DATA — imports types only so callers can resolve without cycles.

import type {
  AgencyMarketingPackageOverride,
  Company,
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
  Tenant,
  AddonId,
} from "@/lib/types";

/** Ad media spend is never included in any package — always prepaid credit. */
export const ADS_MEDIA_ALWAYS_EXTRA = true as const;

export interface MarketingPackageDef {
  id: MarketingPackageId;
  name: string;
  priceAudMonthly: number;
  blurb: string;
  channels: string[];
  postsPerMonth: number;
  campaignsPerMonth: number;
  /** Included ready-made promos per month (Basic is 1/quarter ≈ documented in blurb). */
  promosIncludedPerMonth: number;
  adsManagementIncluded: boolean;
  includedAddonIds: AddonId[];
  defaultServiceLevel: ManagedServiceLevel;
  active: boolean;
  customModuleRates?: Record<string, number>;
}

/** Effective entitlements for a company after catalog + custom modules. */
export interface ResolvedCompanyPackage {
  id: MarketingPackageId;
  name: string;
  priceAudMonthly: number;
  blurb: string;
  channels: string[];
  postsPerMonth: number;
  campaignsPerMonth: number;
  promosIncludedPerMonth: number;
  adsManagementIncluded: boolean;
  includedAddonIds: AddonId[];
  serviceLevel: ManagedServiceLevel;
  adsMediaAlwaysExtra: true;
  customModuleRates?: Record<string, number>;
}

const CUSTOM_FLOOR_AUD = 349;

export const PLATFORM_PACKAGES: Record<MarketingPackageId, MarketingPackageDef> = {
  basic: {
    id: "basic",
    name: "Basic",
    priceAudMonthly: 349,
    blurb: "Always on presence — IG + FB, ~8 posts/mo, 1 always-on theme, 1 promo/quarter. Ads media always extra.",
    channels: ["instagram", "facebook"],
    postsPerMonth: 8,
    campaignsPerMonth: 1,
    // 1 ready-made promo per quarter (documented); stored as monthly average.
    promosIncludedPerMonth: 1 / 3,
    adsManagementIncluded: false,
    includedAddonIds: [],
    defaultServiceLevel: "managed_exceptions",
    active: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceAudMonthly: 649,
    blurb: "Multi-channel growth — IG + FB + GBP (± email), ~16 posts/mo, always-on + 1 growth campaign, 1 promo/mo. Ads media always extra.",
    channels: ["instagram", "facebook", "gbp", "email"],
    postsPerMonth: 16,
    campaignsPerMonth: 2,
    promosIncludedPerMonth: 1,
    adsManagementIncluded: false,
    includedAddonIds: [],
    defaultServiceLevel: "managed_exceptions",
    active: true,
  },
  blast: {
    id: "blast",
    name: "Blast",
    priceAudMonthly: 999,
    blurb: "Full funnel push — IG + FB + GBP + TikTok + email, ~24 posts/mo, always-on + 2 themes, 2 promos/mo. Ads management included; media always extra.",
    channels: ["instagram", "facebook", "gbp", "tiktok", "email"],
    postsPerMonth: 24,
    campaignsPerMonth: 3,
    promosIncludedPerMonth: 2,
    adsManagementIncluded: true,
    includedAddonIds: ["video"],
    defaultServiceLevel: "fully_managed",
    active: true,
  },
  custom: {
    id: "custom",
    name: "Custom",
    priceAudMonthly: CUSTOM_FLOOR_AUD,
    blurb: "Build your own from modules. Floor ≥ Basic (A$349). Ads media always extra.",
    channels: [],
    postsPerMonth: 0,
    campaignsPerMonth: 0,
    promosIncludedPerMonth: 0,
    adsManagementIncluded: false,
    includedAddonIds: [],
    defaultServiceLevel: "managed_exceptions",
    active: true,
    customModuleRates: {},
  },
};

export const PACKAGE_ORDER: MarketingPackageId[] = ["basic", "pro", "blast", "custom"];

export function packageFor(id: string | undefined): MarketingPackageDef {
  return PLATFORM_PACKAGES[id as MarketingPackageId] ?? PLATFORM_PACKAGES.basic;
}

function mergeOverride(
  base: MarketingPackageDef,
  ov: AgencyMarketingPackageOverride | undefined,
): MarketingPackageDef {
  if (!ov) return { ...base };
  return {
    id: base.id,
    name: ov.name ?? base.name,
    priceAudMonthly: ov.priceAudMonthly ?? base.priceAudMonthly,
    blurb: ov.blurb ?? base.blurb,
    channels: ov.channels ?? [...base.channels],
    postsPerMonth: ov.postsPerMonth ?? base.postsPerMonth,
    campaignsPerMonth: ov.campaignsPerMonth ?? base.campaignsPerMonth,
    promosIncludedPerMonth: ov.promosIncludedPerMonth ?? base.promosIncludedPerMonth,
    adsManagementIncluded: ov.adsManagementIncluded ?? base.adsManagementIncluded,
    includedAddonIds: ov.includedAddonIds ?? [...base.includedAddonIds],
    defaultServiceLevel: ov.defaultServiceLevel ?? base.defaultServiceLevel,
    active: ov.active ?? base.active,
    customModuleRates:
      ov.customModuleRates !== undefined
        ? { ...ov.customModuleRates }
        : base.customModuleRates
          ? { ...base.customModuleRates }
          : undefined,
  };
}

/** Merge tenant catalog overrides onto platform defaults (all 4 SKUs). */
export function resolveMarketingPackages(
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
): MarketingPackageDef[] {
  const overrides = new Map(
    (tenant?.marketingPackageCatalog ?? []).map((o) => [o.id, o]),
  );
  return PACKAGE_ORDER.map((id) =>
    mergeOverride(PLATFORM_PACKAGES[id], overrides.get(id)),
  );
}

export function resolvePackageById(
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
  id: MarketingPackageId,
): MarketingPackageDef {
  return (
    resolveMarketingPackages(tenant).find((p) => p.id === id) ?? packageFor(id)
  );
}

/** Active packages only — for client signup / onboarding pickers. */
export function listActivePackagesForSignup(
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
): MarketingPackageDef[] {
  return resolveMarketingPackages(tenant).filter((p) => p.active);
}

function emptyCustomModules(
  fallbackLevel: ManagedServiceLevel,
): MarketingPackageCustomModules {
  return {
    channels: [],
    postsPerMonth: 0,
    campaignsPerMonth: 0,
    promosIncludedPerMonth: 0,
    adsManagementIncluded: false,
    serviceLevel: fallbackLevel,
    addonIds: [],
  };
}

/**
 * Effective entitlements for a company.
 * Custom uses `managedService.customModules`; others use resolved catalog.
 */
export function resolveCompanyPackage(
  company: Pick<Company, "profile">,
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
): ResolvedCompanyPackage {
  const ms = company.profile.managedService;
  const packageId: MarketingPackageId = ms?.marketingPackageId ?? "basic";
  const catalogPkg = resolvePackageById(tenant, packageId);

  if (packageId === "custom") {
    const mods = ms?.customModules ?? emptyCustomModules(catalogPkg.defaultServiceLevel);
    const price = Math.max(
      catalogPkg.priceAudMonthly,
      CUSTOM_FLOOR_AUD,
    );
    return {
      id: "custom",
      name: catalogPkg.name,
      priceAudMonthly: price,
      blurb: catalogPkg.blurb,
      channels: [...mods.channels],
      postsPerMonth: mods.postsPerMonth,
      campaignsPerMonth: mods.campaignsPerMonth,
      promosIncludedPerMonth: mods.promosIncludedPerMonth,
      adsManagementIncluded: mods.adsManagementIncluded,
      includedAddonIds: [...mods.addonIds],
      serviceLevel: mods.serviceLevel,
      adsMediaAlwaysExtra: ADS_MEDIA_ALWAYS_EXTRA,
      customModuleRates: catalogPkg.customModuleRates
        ? { ...catalogPkg.customModuleRates }
        : undefined,
    };
  }

  return {
    id: catalogPkg.id,
    name: catalogPkg.name,
    priceAudMonthly: catalogPkg.priceAudMonthly,
    blurb: catalogPkg.blurb,
    channels: [...catalogPkg.channels],
    postsPerMonth: catalogPkg.postsPerMonth,
    campaignsPerMonth: catalogPkg.campaignsPerMonth,
    promosIncludedPerMonth: catalogPkg.promosIncludedPerMonth,
    adsManagementIncluded: catalogPkg.adsManagementIncluded,
    includedAddonIds: [...catalogPkg.includedAddonIds],
    serviceLevel: catalogPkg.defaultServiceLevel,
    adsMediaAlwaysExtra: ADS_MEDIA_ALWAYS_EXTRA,
    customModuleRates: catalogPkg.customModuleRates
      ? { ...catalogPkg.customModuleRates }
      : undefined,
  };
}

export function isMarketingPackageId(v: string): v is MarketingPackageId {
  return PACKAGE_ORDER.includes(v as MarketingPackageId);
}

/** Stable compare for custom module picks (order-insensitive channels/addons). */
export function customModulesEqual(
  a: MarketingPackageCustomModules | undefined,
  b: MarketingPackageCustomModules | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const norm = (m: MarketingPackageCustomModules) =>
    JSON.stringify({
      channels: [...m.channels].map((c) => c.toLowerCase()).sort(),
      postsPerMonth: m.postsPerMonth,
      campaignsPerMonth: m.campaignsPerMonth,
      promosIncludedPerMonth: m.promosIncludedPerMonth,
      adsManagementIncluded: m.adsManagementIncluded,
      serviceLevel: m.serviceLevel,
      addonIds: [...m.addonIds].sort(),
    });
  return norm(a) === norm(b);
}

/** Common channel options for Custom module pickers. */
export const CUSTOM_CHANNEL_OPTIONS = [
  "instagram",
  "facebook",
  "gbp",
  "tiktok",
  "email",
] as const;

const SERVICE_LEVELS: ManagedServiceLevel[] = [
  "approval",
  "managed_exceptions",
  "fully_managed",
];

export function isManagedServiceLevel(v: string): v is ManagedServiceLevel {
  return SERVICE_LEVELS.includes(v as ManagedServiceLevel);
}

/**
 * Parse Custom module fields from a form (onboarding + company overview).
 * Expects: customChannels (comma-separated), customPostsPerMonth,
 * customCampaignsPerMonth, customPromosIncludedPerMonth,
 * customAdsManagementIncluded ("on"), customServiceLevel.
 */
export function parseCustomModulesFromFormData(
  formData: FormData,
  fallbackLevel: ManagedServiceLevel = "managed_exceptions",
): MarketingPackageCustomModules {
  const levelRaw = String(formData.get("customServiceLevel") || "").trim();
  const serviceLevel = isManagedServiceLevel(levelRaw) ? levelRaw : fallbackLevel;
  const channels = String(formData.get("customChannels") || "")
    .split(/[,|\n]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const n = (key: string, fallback: number) => {
    const v = Number(formData.get(key));
    return Number.isFinite(v) ? Math.max(0, v) : fallback;
  };
  return {
    channels,
    postsPerMonth: n("customPostsPerMonth", 0),
    campaignsPerMonth: n("customCampaignsPerMonth", 0),
    promosIncludedPerMonth: n("customPromosIncludedPerMonth", 0),
    adsManagementIncluded: formData.get("customAdsManagementIncluded") === "on",
    serviceLevel,
    addonIds: [],
  };
}

/** Resolve service level + custom modules for a package selection. */
export function resolveSelectionForPackage(
  tenant: Pick<Tenant, "marketingPackageCatalog"> | null | undefined,
  packageId: MarketingPackageId,
  formData?: FormData,
): {
  marketingPackageId: MarketingPackageId;
  serviceLevel: ManagedServiceLevel;
  customModules: MarketingPackageCustomModules | undefined;
} {
  const catalogPkg = resolvePackageById(tenant, packageId);
  if (packageId === "custom") {
    const customModules = formData
      ? parseCustomModulesFromFormData(formData, catalogPkg.defaultServiceLevel)
      : emptyCustomModules(catalogPkg.defaultServiceLevel);
    return {
      marketingPackageId: "custom",
      serviceLevel: customModules.serviceLevel,
      customModules,
    };
  }
  return {
    marketingPackageId: packageId,
    serviceLevel: catalogPkg.defaultServiceLevel,
    customModules: undefined,
  };
}
