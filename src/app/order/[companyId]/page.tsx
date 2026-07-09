import { getConfirmedOrder } from "./actions";
import { loadPublicOrderStorefront } from "@/lib/ordering-public";
import { formatAudCents } from "@/lib/ordering";
import { placeOrderAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Order online" };

export default async function PublicOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ confirmed?: string; cancelled?: string }>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const storefront = await loadPublicOrderStorefront(companyId);

  if (!storefront) {
    return (
      <Shell title="Order online">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Ordering isn&apos;t available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This restaurant hasn&apos;t enabled direct online ordering yet.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { company, items, settings } = storefront;

  if (sp.confirmed) {
    const order = await getConfirmedOrder(companyId, sp.confirmed);
    if (order) {
      return (
        <Shell title={company.name}>
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <h1 className="text-xl font-semibold text-green-700">Order confirmed</h1>
              <p className="text-sm text-muted-foreground">
                Thanks {order.customerName} — we&apos;ve received your order for{" "}
                <strong>{formatAudCents(order.totalCents)}</strong>.
              </p>
              <p className="text-sm">
                {order.fulfillment === "pickup"
                  ? "We'll have it ready for pickup soon."
                  : "We'll deliver to the address you provided."}
              </p>
            </CardContent>
          </Card>
        </Shell>
      );
    }
  }

  if (sp.cancelled) {
    return (
      <Shell title={company.name}>
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Checkout cancelled</h1>
            <p className="mt-2 text-sm text-muted-foreground">You can try again below.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Shell title={company.name}>
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-1 text-xl font-semibold">{company.name}</h1>
          <p className="mb-6 text-sm text-muted-foreground">Order for pickup or delivery</p>

          <form action={placeOrderAction} className="space-y-6">
            <input type="hidden" name="companyId" value={companyId} />

            {Object.entries(grouped).map(([category, catItems]) => (
              <div key={category}>
                <h2 className="mb-3 font-medium">{category}</h2>
                <ul className="space-y-3">
                  {catItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        )}
                        <p className="text-sm">{formatAudCents(item.priceCents)}</p>
                      </div>
                      <Field label="Qty" htmlFor={`qty-${item.id}`}>
                        <Input
                          id={`qty-${item.id}`}
                          name={`qty_${item.id}`}
                          type="number"
                          min="0"
                          max="99"
                          defaultValue="0"
                          className="w-20"
                        />
                      </Field>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="space-y-3 border-t pt-6">
              <h2 className="font-medium">Your details</h2>
              <Field label="Fulfillment" htmlFor="fulfillment">
                <Select id="fulfillment" name="fulfillment" defaultValue="pickup">
                  {settings.pickupEnabled && <option value="pickup">Pickup</option>}
                  {settings.deliveryEnabled && <option value="delivery">Delivery</option>}
                </Select>
              </Field>
              <Field label="Name" htmlFor="cust-name">
                <Input id="cust-name" name="customerName" required />
              </Field>
              <Field label="Email" htmlFor="cust-email">
                <Input id="cust-email" name="customerEmail" type="email" required />
              </Field>
              <Field label="Phone" htmlFor="cust-phone">
                <Input id="cust-phone" name="customerPhone" type="tel" />
              </Field>
              {settings.deliveryEnabled && (
                <Field label="Delivery address" htmlFor="cust-addr">
                  <Textarea id="cust-addr" name="deliveryAddress" className="min-h-16" />
                </Field>
              )}
              <Field label="Notes" htmlFor="cust-notes">
                <Textarea id="cust-notes" name="notes" placeholder="Allergies, pickup time…" className="min-h-16" />
              </Field>
              {settings.minOrderCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  Minimum order: {formatAudCents(settings.minOrderCents)}
                </p>
              )}
              <Button type="submit" className="w-full sm:w-auto">
                {settings.buttonLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}
