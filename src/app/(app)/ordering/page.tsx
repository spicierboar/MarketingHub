import { requireAdmin } from "@/lib/auth/rbac";
import {
  getOrderingSettings,
  listCompanies,
  listOrderMenuItems,
  listRestaurantOrders,
} from "@/lib/db";
import { ADDONS } from "@/lib/addons";
import { companyAddonMap } from "@/lib/entitlements";
import { resolveOrigin } from "@/lib/origin";
import { headers } from "next/headers";
import {
  connectStatusLabel,
  defaultOrderingSettings,
  formatAudCents,
  orderStatusLabel,
  orderSummary,
} from "@/lib/ordering";
import { orderingLive } from "@/lib/ordering-connectors";
import { stripeOrderingConfigured } from "@/lib/ordering-stripe";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { OrderStatus, RestaurantOrder } from "@/lib/types";
import {
  advanceOrderAction,
  deleteMenuItemAction,
  saveMenuItemAction,
  saveOrderingSettingsAction,
  simulateConnectAction,
  startConnectOnboardingAction,
  toggleMenuItemAction,
} from "./actions";

export default async function OrderingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; connect?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);
  const addons = company ? await companyAddonMap(user.tenantId, company.id) : null;

  const [menuItems, orders, settingsRow] = companyId
    ? await Promise.all([
        listOrderMenuItems(user.tenantId, companyId),
        listRestaurantOrders(user.tenantId, companyId),
        getOrderingSettings(companyId),
      ])
    : [[], [], undefined];
  const settings = settingsRow ?? (companyId ? defaultOrderingSettings(companyId) : null);

  const hdrs = await headers();
  const origin = resolveOrigin((n) => hdrs.get(n));
  const orderUrl = companyId ? `${origin}/order/${companyId}` : "";
  const live = orderingLive();
  const stripe = stripeOrderingConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Now"
        description="Direct online ordering for restaurant clients — menu, guest checkout, kitchen queue, Stripe Connect payouts."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Badge tone={live ? "success" : "neutral"}>
            {live ? "ORDERING_LIVE on" : "Simulated checkout"}
          </Badge>
          <Badge tone={stripe ? "success" : "neutral"}>
            {stripe ? "Stripe configured" : "No Stripe keys"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Client" htmlFor="ord-company">
              <Select id="ord-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
          {company && addons && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add-on:{" "}
              {addons.order_button ? (
                <span className="text-foreground">
                  {ADDONS.order_button.icon} {ADDONS.order_button.name}
                </span>
              ) : (
                <span>
                  {ADDONS.order_button.icon} {ADDONS.order_button.name} (off) — enable on{" "}
                  <a href="/billing" className="text-primary underline">
                    Billing
                  </a>
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {company && addons?.order_button && settings && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-6 p-6">
              <div>
                <h2 className="mb-1 font-semibold">Payouts (Stripe Connect)</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Guest payments route to the restaurant&apos;s Connect account — you never hold order money.
                </p>
                <Badge tone={settings.connectStatus === "active" ? "success" : "warning"}>
                  {connectStatusLabel(settings.connectStatus)}
                </Badge>
                <div className="mt-3 flex flex-wrap gap-2">
                  {live && stripe ? (
                    <form action={startConnectOnboardingAction}>
                      <input type="hidden" name="companyId" value={company.id} />
                      <Button type="submit" size="sm">
                        {settings.connectStatus === "not_started"
                          ? "Connect Stripe payouts"
                          : "Continue Connect onboarding"}
                      </Button>
                    </form>
                  ) : (
                    <form action={simulateConnectAction}>
                      <input type="hidden" name="companyId" value={company.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Simulate Connect (demo)
                      </Button>
                    </form>
                  )}
                </div>
              </div>

              <form action={saveOrderingSettingsAction} className="space-y-3 border-t pt-6">
                <input type="hidden" name="companyId" value={company.id} />
                <h3 className="font-medium">Ordering settings</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="pickupEnabled" defaultChecked={settings.pickupEnabled} />
                  Pickup enabled
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="deliveryEnabled" defaultChecked={settings.deliveryEnabled} />
                  Delivery enabled
                </label>
                <Field label="Minimum order (AUD)" htmlFor="min-aud">
                  <Input
                    id="min-aud"
                    name="minOrderAud"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={(settings.minOrderCents / 100).toFixed(2)}
                  />
                </Field>
                <Field label="Button label" htmlFor="btn-label">
                  <Input id="btn-label" name="buttonLabel" defaultValue={settings.buttonLabel} />
                </Field>
                <Button type="submit" size="sm">
                  Save settings
                </Button>
              </form>

              <div className="border-t pt-6">
                <h3 className="mb-2 font-medium">Embed / share</h3>
                <p className="mb-2 text-sm text-muted-foreground">Public order page (guest checkout):</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">{orderUrl}</code>
                <p className="mt-3 text-sm text-muted-foreground">Embed button:</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">{`<a href="${orderUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${settings.buttonLabel}</a>`}</code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Menu catalog</h2>
              <form action={saveMenuItemAction} className="mb-6 space-y-3 border-b pb-6">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Item name" htmlFor="mi-name">
                  <Input id="mi-name" name="name" required />
                </Field>
                <Field label="Category" htmlFor="mi-cat">
                  <Input id="mi-cat" name="category" placeholder="Coffee, Food…" />
                </Field>
                <Field label="Price (AUD)" htmlFor="mi-price">
                  <Input id="mi-price" name="priceAud" type="number" step="0.01" min="0.01" required />
                </Field>
                <Field label="Description" htmlFor="mi-desc">
                  <Textarea id="mi-desc" name="description" className="min-h-16" />
                </Field>
                <Button type="submit" size="sm">
                  Add menu item
                </Button>
              </form>
              {menuItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No menu items yet.</p>
              ) : (
                <ul className="space-y-3">
                  {menuItems.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {item.name}{" "}
                          <span className="text-muted-foreground">({item.category})</span>
                        </p>
                        <p className="text-muted-foreground">
                          {formatAudCents(item.priceCents)}
                          {!item.available && " · hidden"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <form action={toggleMenuItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="available" value={item.available ? "false" : "true"} />
                          <Button type="submit" size="sm" variant="outline">
                            {item.available ? "Hide" : "Show"}
                          </Button>
                        </form>
                        <form action={deleteMenuItemAction}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {company && addons?.order_button && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Kitchen queue</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {company && !addons?.order_button && (
        <Card>
          <CardContent className="p-6 text-sm text-amber-700">
            Enable the Order Now add-on on Billing to manage the menu and kitchen queue.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: RestaurantOrder }) {
  const next: Partial<Record<OrderStatus, OrderStatus>> = {
    paid: "accepted",
    accepted: "preparing",
    preparing: "ready",
    ready: "completed",
  };
  const forward = next[order.status];

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{order.customerName}</p>
          <p className="text-sm text-muted-foreground">{orderSummary(order)}</p>
          <p className="text-xs text-muted-foreground">
            {order.fulfillment} · {formatDate(order.createdAt)} · {order.customerEmail}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <ul className="mt-2 text-sm">
        {order.lines.map((l) => (
          <li key={`${l.menuItemId}-${l.name}`}>
            {l.quantity}× {l.name} — {formatAudCents(l.priceCents * l.quantity)}
          </li>
        ))}
      </ul>
      {order.notes && (
        <p className="mt-2 text-sm text-muted-foreground">Note: {order.notes}</p>
      )}
      {forward && (
        <form action={advanceOrderAction} className="mt-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="to" value={forward} />
          <Button type="submit" size="sm">
            → {orderStatusLabel(forward)}
          </Button>
        </form>
      )}
      {order.status !== "cancelled" && order.status !== "completed" && order.status !== "pending_payment" && (
        <form action={advanceOrderAction} className="mt-2 inline-block">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="to" value="cancelled" />
          <Button type="submit" size="sm" variant="outline">
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
