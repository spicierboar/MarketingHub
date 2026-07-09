"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  createOrderMenuItem,
  deleteOrderMenuItem,
  getCompany,
  getOrderingSettings,
  getRestaurantOrder,
  listOrderMenuItems,
  updateOrderMenuItem,
  updateRestaurantOrder,
  upsertOrderingSettings,
} from "@/lib/db";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertCompanyAddon } from "@/lib/entitlements";
import { resolveOrigin } from "@/lib/origin";
import {
  assertOrderTransition,
  defaultOrderingSettings,
  orderStatusLabel,
} from "@/lib/ordering";
import { orderingLive } from "@/lib/ordering-connectors";
import {
  createConnectOnboarding,
  stripeOrderingConfigured,
} from "@/lib/ordering-stripe";
import type { OrderStatus } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function assertOrderCompany(companyId: string) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status === "archived") throw new Error("Company is archived.");
  return company;
}

export async function saveMenuItemAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  await assertOrderCompany(companyId);

  const name = text(formData, "name");
  const category = text(formData, "category") || "General";
  const description = text(formData, "description") || undefined;
  const priceCents = Math.round(Number(formData.get("priceAud") || 0) * 100);
  const sortOrder = Number(formData.get("sortOrder") || 0);
  if (!name || priceCents <= 0) throw new Error("Name and price are required.");

  await createOrderMenuItem({
    companyId,
    name,
    description,
    category,
    priceCents,
    sortOrder,
    available: true,
  });
  await logAction(user, "ordering.menu_item_created", {
    targetType: "order_menu_item",
    companyId,
    detail: name,
  });
  revalidatePath("/ordering");
}

export async function toggleMenuItemAction(formData: FormData) {
  const itemId = text(formData, "itemId");
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  const available = text(formData, "available") === "true";
  await updateOrderMenuItem(itemId, { available });
  await logAction(user, "ordering.menu_item_toggled", {
    targetType: "order_menu_item",
    targetId: itemId,
    companyId,
    detail: available ? "available" : "hidden",
  });
  revalidatePath("/ordering");
}

export async function deleteMenuItemAction(formData: FormData) {
  const itemId = text(formData, "itemId");
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  await deleteOrderMenuItem(itemId);
  await logAction(user, "ordering.menu_item_deleted", {
    targetType: "order_menu_item",
    targetId: itemId,
    companyId,
  });
  revalidatePath("/ordering");
}

export async function saveOrderingSettingsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  await assertOrderCompany(companyId);

  const existing = (await getOrderingSettings(companyId)) ?? defaultOrderingSettings(companyId);
  const settings = await upsertOrderingSettings({
    ...existing,
    pickupEnabled: formData.get("pickupEnabled") === "on",
    deliveryEnabled: formData.get("deliveryEnabled") === "on",
    minOrderCents: Math.round(Number(formData.get("minOrderAud") || 0) * 100),
    buttonLabel: text(formData, "buttonLabel") || "Order Now",
  });
  await logAction(user, "ordering.settings_updated", {
    targetType: "ordering_settings",
    targetId: companyId,
    companyId,
    detail: `pickup=${settings.pickupEnabled} delivery=${settings.deliveryEnabled}`,
  });
  revalidatePath("/ordering");
}

export async function startConnectOnboardingAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  const company = await assertOrderCompany(companyId);
  if (!orderingLive() || !stripeOrderingConfigured()) {
    throw new Error("Stripe Connect requires ORDERING_LIVE=true and Stripe keys.");
  }
  const existing = (await getOrderingSettings(companyId)) ?? defaultOrderingSettings(companyId);
  const hdrs = await headers();
  const origin = resolveOrigin((n) => hdrs.get(n));
  const link = await createConnectOnboarding(
    companyId,
    company.name,
    origin,
    existing.stripeConnectAccountId,
  );
  if (!link) throw new Error("Could not start Stripe Connect onboarding.");
  await upsertOrderingSettings({
    ...existing,
    stripeConnectAccountId: link.accountId,
    connectStatus: "pending",
  });
  await logAction(user, "ordering.connect_started", {
    targetType: "ordering_settings",
    targetId: companyId,
    companyId,
  });
  redirect(link.url);
}

export async function simulateConnectAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "order_button");
  if (orderingLive()) throw new Error("Simulate Connect is only for demo mode.");
  const existing = (await getOrderingSettings(companyId)) ?? defaultOrderingSettings(companyId);
  await upsertOrderingSettings({
    ...existing,
    stripeConnectAccountId: `acct_demo_${companyId}`,
    connectStatus: "active",
  });
  await logAction(user, "ordering.connect_simulated", {
    targetType: "ordering_settings",
    targetId: companyId,
    companyId,
  });
  revalidatePath("/ordering");
}

export async function advanceOrderAction(formData: FormData) {
  const orderId = text(formData, "orderId");
  const to = text(formData, "to") as OrderStatus;
  const order = await getRestaurantOrder(orderId);
  if (!order) throw new Error("Order not found");
  const user = await requireAdmin();
  await assertCompanyAccess(order.companyId);
  await assertCompanyAddon(order.companyId, "order_button");
  assertOrderTransition(order.status, to);
  await updateRestaurantOrder(orderId, { status: to });
  await logAction(user, "ordering.order_advanced", {
    targetType: "restaurant_order",
    targetId: orderId,
    companyId: order.companyId,
    detail: `${orderStatusLabel(order.status)} → ${orderStatusLabel(to)}`,
  });
  revalidatePath("/ordering");
}
