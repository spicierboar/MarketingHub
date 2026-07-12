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
  /**
   * Free AI image generations / calendar month (content creation).
   * Tuned roughly to posts/mo; over-quota needs the AI video add-on (covers image + video extras).
   * Ads media spend is always extra — never covered by these quotas.
   */
  imageQuotaPerMonth: number;
  /**
   * Free short-form AI videos / calendar month (Reels / TikTok / Shorts).
   * Over-quota needs the AI video add-on (or package-included video).
   */
  videoQuotaPerMonth: number;
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
  imageQuotaPerMonth: number;
  videoQuotaPerMonth: number;
  serviceLevel: ManagedServiceLevel;
  adsMediaAlwaysExtra: true;
  customModuleRates?: Record<string, number>;
}

/** Custom package monthly floor (Basic). Ad media spend is never included. */
export const CUSTOM_FLOOR_AUD = 349;

/**
 * Platform default Custom rate card — amounts added to the **monthly** fee.
 * - `postsPerMonth` — per post / month
 * - `campaignsPerQuarter` / `promosPerQuarter` — per campaign or promo / quarter
 *   (do not also multiply by monthly averages; builders collect quarter counts)
 * Agency catalog `customModuleRates` overrides individual keys.
 */
export const DEFAULT_CUSTOM_MODULE_RATES: Readonly<Record<string, number>> = {
  channel: 40,
  postsPerMonth: 25,
  campaignsPerQuarter: 55,
  promosPerQuarter: 80,
  adsManagement: 150,
  fullyManaged: 75,
};

export type CustomPackageQuote = {
  /** Billed monthly price after floor. */
  priceAudMonthly: number;
  /** Sum of modules before floor. */
  rawAud: number;
  floorApplied: boolean;
  floorAud: number;
};

/** Custom UI collects campaigns/promos per quarter; storage uses monthly averages. */
export function quarterlyToMonthlyRate(perQuarter: number): number {
  if (!Number.isFinite(perQuarter) || perQuarter <= 0) return 0;
  return perQuarter / 3;
}

/** Inverse of {@link quarterlyToMonthlyRate} for Custom builder displays. */
export function monthlyToQuarterlyCount(perMonth: number): number {
  if (!Number.isFinite(perMonth) || perMonth <= 0) return 0;
  return Math.round(perMonth * 3);
}

/** Merge agency rate-card overrides onto platform defaults. */
export function mergeCustomModuleRates(
  agencyRates?: Record<string, number> | null,
): Record<string, number> {
  return { ...DEFAULT_CUSTOM_MODULE_RATES, ...(agencyRates ?? {}) };
}

function moduleRate(rates: Record<string, number>, ...keys: string[]): number {
  for (const key of keys) {
    const v = rates[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

/**
 * Quote Custom package monthly fee from modules + rate card.
 * Campaigns & promos are priced per **quarter** (converted from stored monthly averages).
 * Does not include ads media spend (always extra / prepaid).
 * Floored at Basic (or a higher agency floor).
 */
export function quoteCustomPackagePrice(
  modules: MarketingPackageCustomModules,
  agencyRates?: Record<string, number> | null,
  floorAud: number = CUSTOM_FLOOR_AUD,
): CustomPackageQuote {
  const rates = mergeCustomModuleRates(agencyRates);
  const floor = Math.max(CUSTOM_FLOOR_AUD, floorAud);

  // Stored as monthly averages (e.g. 1/3 = 1/quarter); price from quarter counts.
  const campaignsPerQuarter = Math.max(0, modules.campaignsPerMonth) * 3;
  const promosPerQuarter = Math.max(0, modules.promosIncludedPerMonth) * 3;

  let raw =
    modules.channels.length *
      moduleRate(rates, "channel", "channels", "perChannel") +
    Math.max(0, modules.postsPerMonth) *
      moduleRate(rates, "postsPerMonth", "post", "posts") +
    campaignsPerQuarter *
      moduleRate(
        rates,
        "campaignsPerQuarter",
        "campaignsPerMonth",
        "campaign",
        "campaigns",
      ) +
    promosPerQuarter *
      moduleRate(
        rates,
        "promosPerQuarter",
        "promosIncludedPerMonth",
        "promo",
        "promos",
      );

  if (modules.adsManagementIncluded) {
    raw += moduleRate(rates, "adsManagement", "adsManagementIncluded");
  }
  if (modules.serviceLevel === "fully_managed") {
    raw += moduleRate(rates, "fullyManaged", "serviceLevel_fully_managed");
  } else if (modules.serviceLevel === "managed_exceptions") {
    raw += moduleRate(
      rates,
      "managedExceptions",
      "serviceLevel_managed_exceptions",
    );
  } else if (modules.serviceLevel === "approval") {
    raw += moduleRate(rates, "approval", "serviceLevel_approval");
  }

  for (const id of modules.addonIds) {
    raw += moduleRate(rates, id, `addon_${id}`);
  }

  const rawAud = Math.round(raw);
  const priceAudMonthly = Math.max(floor, rawAud);
  return {
    priceAudMonthly,
    rawAud,
    floorApplied: rawAud < floor,
    floorAud: floor,
  };
}

/**
 * Free AI visuals quotas per marketing package (per calendar month).
 * Proportional to plan price / organic cadence — simple integers.
 * - Basic ($349): light — ~1 image per post, 2 short videos
 * - Pro ($649): medium — ~1 image per post, 4 short videos
 * - Blast ($999): higher free pool; AI video also package-included (unlimited via includedAddonIds)
 * - Custom: at least Basic floor (modules may raise via customModules.*QuotaPerMonth)
 * Ads media always extra (never included in these quotas).
 */
export const PLATFORM_PACKAGES: Record<MarketingPackageId, MarketingPackageDef> = {
  basic: {
    id: "basic",
    name: "Basic",
    priceAudMonthly: 349,
    blurb:
      "Always on presence — IG + FB, ~8 posts/mo, 1 always-on theme, 1 promo/quarter, 8 AI images + 2 short videos/mo. Ads media always extra.",
    channels: ["instagram", "facebook"],
    postsPerMonth: 8,
    campaignsPerMonth: 1,
    // 1 ready-made promo per quarter (documented); stored as monthly average.
    promosIncludedPerMonth: 1 / 3,
    adsManagementIncluded: false,
    includedAddonIds: [],
    imageQuotaPerMonth: 8,
    videoQuotaPerMonth: 2,
    defaultServiceLevel: "managed_exceptions",
    active: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceAudMonthly: 649,
    blurb:
      "Multi-channel growth — IG + FB + GBP (± email), ~16 posts/mo, always-on + 1 growth campaign, 1 promo/mo, 16 AI images + 4 short videos/mo. Ads media always extra.",
    channels: ["instagram", "facebook", "gbp", "email"],
    postsPerMonth: 16,
    campaignsPerMonth: 2,
    promosIncludedPerMonth: 1,
    adsManagementIncluded: false,
    includedAddonIds: [],
    imageQuotaPerMonth: 16,
    videoQuotaPerMonth: 4,
    defaultServiceLevel: "managed_exceptions",
    active: true,
  },
  blast: {
    id: "blast",
    name: "Blast",
    priceAudMonthly: 999,
    blurb:
      "Full funnel push — IG + FB + GBP + TikTok + email, ~24 posts/mo, always-on + 2 themes, 2 promos/mo, AI video included (32 images + 8 videos/mo floor). Ads management included; media always extra.",
    channels: ["instagram", "facebook", "gbp", "tiktok", "email"],
    postsPerMonth: 24,
    campaignsPerMonth: 3,
    promosIncludedPerMonth: 2,
    adsManagementIncluded: true,
    // Package-included AI video → unlimited image/video creation (see visuals-allowance).
    includedAddonIds: ["video"],
    imageQuotaPerMonth: 32,
    videoQuotaPerMonth: 8,
    defaultServiceLevel: "fully_managed",
    active: true,
  },
  custom: {
    id: "custom",
    name: "Custom",
    priceAudMonthly: CUSTOM_FLOOR_AUD,
    blurb:
      "Build your own from modules. Floor ≥ Basic (A$349) including 8 AI images + 2 short videos/mo. Ads media always extra.",
    channels: [],
    postsPerMonth: 0,
    campaignsPerMonth: 0,
    promosIncludedPerMonth: 0,
    adsManagementIncluded: false,
    includedAddonIds: [],
    // Custom floor matches Basic free visuals unless modules raise quotas.
    imageQuotaPerMonth: 8,
    videoQuotaPerMonth: 2,
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
    imageQuotaPerMonth: ov.imageQuotaPerMonth ?? base.imageQuotaPerMonth,
    videoQuotaPerMonth: ov.videoQuotaPerMonth ?? base.videoQuotaPerMonth,
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
    const quote = quoteCustomPackagePrice(
      mods,
      catalogPkg.customModuleRates,
      catalogPkg.priceAudMonthly,
    );
    const imageQuota = Math.max(
      catalogPkg.imageQuotaPerMonth,
      typeof mods.imageQuotaPerMonth === "number" && Number.isFinite(mods.imageQuotaPerMonth)
        ? Math.max(0, Math.round(mods.imageQuotaPerMonth))
        : 0,
    );
    const videoQuota = Math.max(
      catalogPkg.videoQuotaPerMonth,
      typeof mods.videoQuotaPerMonth === "number" && Number.isFinite(mods.videoQuotaPerMonth)
        ? Math.max(0, Math.round(mods.videoQuotaPerMonth))
        : 0,
    );
    return {
      id: "custom",
      name: catalogPkg.name,
      priceAudMonthly: quote.priceAudMonthly,
      blurb: catalogPkg.blurb,
      channels: [...mods.channels],
      postsPerMonth: mods.postsPerMonth,
      campaignsPerMonth: mods.campaignsPerMonth,
      promosIncludedPerMonth: mods.promosIncludedPerMonth,
      adsManagementIncluded: mods.adsManagementIncluded,
      includedAddonIds: [...mods.addonIds],
      imageQuotaPerMonth: imageQuota,
      videoQuotaPerMonth: videoQuota,
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
    imageQuotaPerMonth: catalogPkg.imageQuotaPerMonth,
    videoQuotaPerMonth: catalogPkg.videoQuotaPerMonth,
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

export function customChannelLabel(id: string): string {
  switch (id) {
    case "gbp":
      return "Google Business";
    case "instagram":
      return "Instagram";
    case "facebook":
      return "Facebook";
    case "tiktok":
      return "TikTok";
    case "email":
      return "Email";
    default:
      return id.charAt(0).toUpperCase() + id.slice(1);
  }
}

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
 * Expects: customChannels, customPostsPerMonth,
 * customCampaignsPerQuarter (preferred) or legacy customCampaignsPerMonth,
 * customPromosPerQuarter (preferred) or legacy customPromosIncludedPerMonth,
 * customAdsManagementIncluded ("on"), customServiceLevel.
 *
 * Campaigns & promos are collected **per quarter** and stored as monthly averages
 * (`/3`) so promo allowance + delivery keep working.
 */
export function parseCustomModulesFromFormData(
  formData: FormData,
  fallbackLevel: ManagedServiceLevel = "managed_exceptions",
): MarketingPackageCustomModules {
  const levelRaw = String(formData.get("customServiceLevel") || "").trim();
  const serviceLevel = isManagedServiceLevel(levelRaw) ? levelRaw : fallbackLevel;
  // Checkboxes (name=customChannels) or legacy comma-separated single field.
  const channels = formData
    .getAll("customChannels")
    .flatMap((v) => String(v).split(/[,|\n]/))
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const n = (key: string, fallback: number) => {
    const v = Number(formData.get(key));
    return Number.isFinite(v) ? Math.max(0, v) : fallback;
  };
  const has = (key: string) => {
    const v = formData.get(key);
    return v != null && String(v).trim() !== "";
  };
  // Prefer explicit per-quarter fields; legacy month-named fields are also
  // treated as quarter counts (Custom builder product rule).
  const campaignsPerQuarter = has("customCampaignsPerQuarter")
    ? n("customCampaignsPerQuarter", 0)
    : n("customCampaignsPerMonth", 0);
  const promosPerQuarter = has("customPromosPerQuarter")
    ? n("customPromosPerQuarter", 0)
    : n("customPromosIncludedPerMonth", 0);
  return {
    channels,
    postsPerMonth: n("customPostsPerMonth", 0),
    campaignsPerMonth: quarterlyToMonthlyRate(campaignsPerQuarter),
    promosIncludedPerMonth: quarterlyToMonthlyRate(promosPerQuarter),
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
