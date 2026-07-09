"use server";

import { revalidatePath } from "next/cache";
import {
  createMenuDesign,
  getCompany,
  getMenuDesign,
  listMenuDesigns,
  updateMenuDesign,
} from "@/lib/db";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertCompanyAddon } from "@/lib/entitlements";
import {
  assertMenuDesignTransition,
  menuDesignStatusLabel,
  resolveMenuBillingClass,
} from "@/lib/menu-design";
import type { MenuDesignFormat, MenuDesignStatus } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function assertRestaurantReadyCompany(companyId: string) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status === "archived") {
    throw new Error("Company is archived.");
  }
  return company;
}

export async function requestMenuDesignAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "menus");
  await assertRestaurantReadyCompany(companyId);

  const title = text(formData, "title");
  const brief = text(formData, "brief");
  const format = text(formData, "format") as MenuDesignFormat;
  if (!title || !brief) throw new Error("Title and brief are required");
  if (!["print", "digital", "both"].includes(format)) {
    throw new Error("Format must be print, digital, or both.");
  }

  const year = new Date().getFullYear();
  const existing = await listMenuDesigns(user.tenantId, companyId);
  const billingClass = resolveMenuBillingClass(existing, year);

  const design = await createMenuDesign({
    companyId,
    title,
    brief,
    format,
    status: "requested",
    billingClass,
    quotaYear: year,
    deliverableAssetIds: [],
    createdById: user.id,
  });
  await logAction(user, "menus.design_requested", {
    targetType: "menu_design",
    targetId: design.id,
    companyId,
    detail: `${title} (${billingClass})`,
  });
  revalidatePath("/menus");
}

export async function advanceMenuDesignAction(formData: FormData) {
  const designId = text(formData, "designId");
  const to = text(formData, "to") as MenuDesignStatus;
  const design = await getMenuDesign(designId);
  if (!design) throw new Error("Menu design not found");
  const user = await requireAdmin();
  await assertCompanyAccess(design.companyId);
  await assertCompanyAddon(design.companyId, "menus");
  assertMenuDesignTransition(design.status, to);

  const patch: Parameters<typeof updateMenuDesign>[1] = { status: to };
  if (to === "in_design" || to === "delivered") {
    const notes = text(formData, "designerNotes");
    if (notes) patch.designerNotes = notes;
  }

  await updateMenuDesign(designId, patch);
  await logAction(user, "menus.design_advanced", {
    targetType: "menu_design",
    targetId: designId,
    companyId: design.companyId,
    detail: `${menuDesignStatusLabel(design.status)} → ${menuDesignStatusLabel(to)}`,
  });
  revalidatePath("/menus");
}

export async function linkMenuAssetAction(formData: FormData) {
  const designId = text(formData, "designId");
  const assetId = text(formData, "assetId");
  const design = await getMenuDesign(designId);
  if (!design) throw new Error("Menu design not found");
  const user = await assertCompanyAccess(design.companyId);
  await assertCompanyAddon(design.companyId, "menus");
  if (!["delivered", "client_review", "in_design"].includes(design.status)) {
    throw new Error("Deliverables can only be linked while the design is in progress.");
  }
  const ids = design.deliverableAssetIds ?? [];
  if (!ids.includes(assetId)) {
    await updateMenuDesign(designId, { deliverableAssetIds: [...ids, assetId] });
  }
  await logAction(user, "menus.design_asset_linked", {
    targetType: "menu_design",
    targetId: designId,
    companyId: design.companyId,
    detail: assetId,
  });
  revalidatePath("/menus");
}
