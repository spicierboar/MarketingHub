// Order Now engine (Module 5 / Phase 6). Order lifecycle state machine, cart
// totals, and Connect-readiness checks.

import type {
  ConnectStatus,
  OrderFulfillment,
  OrderLine,
  OrderMenuItem,
  OrderStatus,
  OrderingSettings,
  RestaurantOrder,
} from "@/lib/types";

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Cannot move an order from "${from}" to "${to}".`);
  }
}

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending_payment":
      return "Awaiting payment";
    case "paid":
      return "Paid — new";
    case "accepted":
      return "Accepted";
    case "preparing":
      return "Preparing";
    case "ready":
      return "Ready";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function connectStatusLabel(status: ConnectStatus): string {
  switch (status) {
    case "not_started":
      return "Not connected";
    case "pending":
      return "Onboarding in progress";
    case "active":
      return "Payouts active";
    case "restricted":
      return "Restricted";
    default:
      return status;
  }
}

export function formatAudCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function orderTotals(lines: OrderLine[]): { subtotalCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  return { subtotalCents, totalCents: subtotalCents };
}

export function buildOrderLines(
  items: OrderMenuItem[],
  quantities: Record<string, number>,
): OrderLine[] {
  const lines: OrderLine[] = [];
  for (const item of items) {
    const qty = quantities[item.id] ?? 0;
    if (qty > 0) {
      lines.push({
        menuItemId: item.id,
        name: item.name,
        priceCents: item.priceCents,
        quantity: qty,
      });
    }
  }
  return lines;
}

export function orderingReadyForCheckout(settings: OrderingSettings): boolean {
  return settings.connectStatus === "active" && !!settings.stripeConnectAccountId;
}

export function assertFulfillmentAllowed(
  fulfillment: OrderFulfillment,
  settings: OrderingSettings,
): void {
  if (fulfillment === "pickup" && !settings.pickupEnabled) {
    throw new Error("Pickup is not available for this restaurant.");
  }
  if (fulfillment === "delivery" && !settings.deliveryEnabled) {
    throw new Error("Delivery is not available for this restaurant.");
  }
}

export function orderSummary(order: RestaurantOrder): string {
  const parts = [orderStatusLabel(order.status), formatAudCents(order.totalCents)];
  parts.push(`${order.lines.length} line(s)`);
  return parts.join(" · ");
}

export function defaultOrderingSettings(companyId: string): OrderingSettings {
  const t = new Date().toISOString();
  return {
    companyId,
    pickupEnabled: true,
    deliveryEnabled: false,
    minOrderCents: 0,
    buttonLabel: "Order Now",
    connectStatus: "not_started",
    updatedAt: t,
  };
}
