"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/rbac";
import { getTenant, updateTenant } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  isMarketingPackageId,
  packageFor,
  PACKAGE_ORDER,
} from "@/lib/marketing-packages";
import type {
  AgencyMarketingPackageOverride,
  AddonId,
  ManagedServiceLevel,
  MarketingPackageId,
} from "@/lib/types";

const SERVICE_LEVELS: ManagedServiceLevel[] = [
  "approval",
  "managed_exceptions",
  "fully_managed",
];

const ADDON_IDS: AddonId[] = ["video", "photo", "menus", "order_button", "bookings"];

/** Checkboxes (name=channels) or legacy comma-separated field. */
function parseChannels(fd: FormData): string[] {
  return fd
    .getAll("channels")
    .flatMap((v) => String(v).split(/[,|\n]/))
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function parseAddonIds(fd: FormData): AddonId[] {
  return fd
    .getAll("includedAddonIds")
    .map((v) => String(v))
    .filter((v): v is AddonId => ADDON_IDS.includes(v as AddonId));
}

function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}

function upsertCatalog(
  prev: AgencyMarketingPackageOverride[],
  next: AgencyMarketingPackageOverride,
): AgencyMarketingPackageOverride[] {
  const idx = prev.findIndex((o) => o.id === next.id);
  if (idx >= 0) {
    const copy = [...prev];
    copy[idx] = next;
    return copy;
  }
  return [...prev, next];
}

export async function saveMarketingPackageOverrideAction(formData: FormData) {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");

  const idRaw = String(formData.get("packageId") || "").trim();
  if (!isMarketingPackageId(idRaw)) throw new Error("Invalid package id.");
  const packageId = idRaw as MarketingPackageId;
  const base = packageFor(packageId);

  const levelRaw = String(formData.get("defaultServiceLevel") || "").trim();
  if (!SERVICE_LEVELS.includes(levelRaw as ManagedServiceLevel)) {
    throw new Error("Invalid service level.");
  }

  const override: AgencyMarketingPackageOverride = {
    id: packageId,
    name: String(formData.get("name") || "").trim() || base.name,
    priceAudMonthly: Math.max(0, num(formData, "priceAudMonthly", base.priceAudMonthly)),
    blurb: String(formData.get("blurb") || "").trim() || base.blurb,
    channels: parseChannels(formData),
    postsPerMonth: Math.max(0, num(formData, "postsPerMonth", base.postsPerMonth)),
    campaignsPerMonth: Math.max(0, num(formData, "campaignsPerMonth", base.campaignsPerMonth)),
    promosIncludedPerMonth: Math.max(
      0,
      num(formData, "promosIncludedPerMonth", base.promosIncludedPerMonth),
    ),
    adsManagementIncluded: formData.get("adsManagementIncluded") === "on",
    includedAddonIds: parseAddonIds(formData),
    imageQuotaPerMonth: Math.max(0, num(formData, "imageQuotaPerMonth", base.imageQuotaPerMonth)),
    videoQuotaPerMonth: Math.max(0, num(formData, "videoQuotaPerMonth", base.videoQuotaPerMonth)),
    defaultServiceLevel: levelRaw as ManagedServiceLevel,
    active: formData.get("active") === "on",
  };

  if (packageId === "custom") {
    const ratesRaw = String(formData.get("customModuleRates") || "").trim();
    if (ratesRaw) {
      try {
        const parsed = JSON.parse(ratesRaw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          override.customModuleRates = parsed as Record<string, number>;
        }
      } catch {
        // keep prior / omit invalid JSON
      }
    } else if (base.customModuleRates) {
      override.customModuleRates = { ...base.customModuleRates };
    }
  }

  const catalog = upsertCatalog(tenant.marketingPackageCatalog ?? [], override);
  // Keep stable order matching PLATFORM order; drop unknown ids.
  const ordered = PACKAGE_ORDER.map(
    (id) => catalog.find((o) => o.id === id),
  ).filter((o): o is AgencyMarketingPackageOverride => Boolean(o));

  await updateTenant(user.tenantId, { marketingPackageCatalog: ordered });
  await logAction(user, "tenant.marketing_package_saved", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: `${override.id}: ${override.name} A$${override.priceAudMonthly}/mo`,
  });
  revalidatePath("/marketing-packages");
  revalidatePath("/companies");
}

export async function resetMarketingPackageOverrideAction(formData: FormData) {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");

  const idRaw = String(formData.get("packageId") || "").trim();
  if (!isMarketingPackageId(idRaw)) throw new Error("Invalid package id.");
  const packageId = idRaw as MarketingPackageId;

  const catalog = (tenant.marketingPackageCatalog ?? []).filter(
    (o) => o.id !== packageId,
  );
  await updateTenant(user.tenantId, { marketingPackageCatalog: catalog });
  await logAction(user, "tenant.marketing_package_reset", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: packageId,
  });
  revalidatePath("/marketing-packages");
  revalidatePath("/companies");
}
