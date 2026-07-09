"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  createRestaurantOrder,
  getRestaurantOrder,
  listOrderMenuItemsByCompany,
  updateRestaurantOrder,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { companyHasAddon } from "@/lib/entitlements";
import { resolveOrigin } from "@/lib/origin";
import { assertPublicRate, clientIp } from "@/lib/ratelimit";
import {
  assertFulfillmentAllowed,
  buildOrderLines,
  orderTotals,
} from "@/lib/ordering";
import { loadPublicOrderStorefront } from "@/lib/ordering-public";
import { canUseLiveOrderingCheckout, createOrderCheckoutSession } from "@/lib/ordering-stripe";
import type { OrderFulfillment } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function placeOrderAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  await assertPublicRate("guest_order", await clientIp());

  const storefront = await loadPublicOrderStorefront(companyId);
  if (!storefront) throw new Error("Online ordering is not available.");

  const { company, settings } = storefront;
  const fulfillment = text(formData, "fulfillment") as OrderFulfillment;
  assertFulfillmentAllowed(fulfillment, settings);

  const customerName = text(formData, "customerName");
  const customerEmail = text(formData, "customerEmail");
  const customerPhone = text(formData, "customerPhone") || undefined;
  const deliveryAddress = text(formData, "deliveryAddress") || undefined;
  const notes = text(formData, "notes") || undefined;
  if (!customerName || !customerEmail) {
    throw new Error("Name and email are required.");
  }
  if (fulfillment === "delivery" && !deliveryAddress) {
    throw new Error("Delivery address is required.");
  }

  const items = await runInServiceContext(company.tenantId, () =>
    listOrderMenuItemsByCompany(companyId),
  );
  const quantities: Record<string, number> = {};
  for (const item of items) {
    const qty = Number(formData.get(`qty_${item.id}`) || 0);
    if (qty > 0) quantities[item.id] = Math.min(99, Math.floor(qty));
  }
  const lines = buildOrderLines(items, quantities);
  if (lines.length === 0) throw new Error("Add at least one item to your order.");
  const { subtotalCents, totalCents } = orderTotals(lines);
  if (totalCents < settings.minOrderCents) {
    throw new Error(
      `Minimum order is $${(settings.minOrderCents / 100).toFixed(2)}.`,
    );
  }

  const order = await runInServiceContext(company.tenantId, async () => {
    if (!(await companyHasAddon(companyId, "order_button"))) {
      throw new Error("Online ordering is not enabled.");
    }
    return createRestaurantOrder({
      companyId,
      status: "pending_payment",
      fulfillment,
      customerName,
      customerEmail,
      customerPhone,
      deliveryAddress,
      lines,
      subtotalCents,
      totalCents,
      notes,
      paymentStatus: "pending",
    });
  });

  const hdrs = await headers();
  const origin = resolveOrigin((n) => hdrs.get(n));

  if (canUseLiveOrderingCheckout(settings)) {
    const url = await createOrderCheckoutSession(order, settings, origin, company.tenantId);
    if (url) {
      await runInServiceContext(company.tenantId, () =>
        updateRestaurantOrder(order.id, { stripeCheckoutSessionId: "pending" }),
      );
      redirect(url);
    }
  }

  await runInServiceContext(company.tenantId, () =>
    updateRestaurantOrder(order.id, {
      status: "paid",
      paymentStatus: "simulated",
    }),
  );
  redirect(`/order/${companyId}?confirmed=${order.id}`);
}

export async function getConfirmedOrder(companyId: string, orderId: string) {
  const storefront = await loadPublicOrderStorefront(companyId);
  if (!storefront) return null;
  return runInServiceContext(storefront.company.tenantId, async () => {
    const order = await getRestaurantOrder(orderId);
    if (!order || order.companyId !== companyId) return null;
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "simulated") return null;
    return order;
  });
}
