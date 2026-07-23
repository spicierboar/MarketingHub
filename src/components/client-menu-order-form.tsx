import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { ClientOrderBriefFields } from "@/components/client-order-brief-fields";
import { ClientOrderBriefConfirm } from "@/components/client-order-brief-confirm";
import { ClientOrderSkuExplainer } from "@/components/client-order-sku-explainer";
import { formatMenuPriceFrom, type ClientMenuSku } from "@/lib/client-order-menu";
import type { OrderBriefPrefill } from "@/lib/client-order-brief-prefill";
import { placeClientMenuOrderAction } from "@/app/(client)/client/order/actions";

/**
 * Content add-on order form body — used inside the Extras FormModal
 * (and nowhere as a standalone page).
 */
export function ClientMenuOrderForm({
  sku,
  prefill,
  onCancel,
}: {
  sku: ClientMenuSku;
  prefill: OrderBriefPrefill;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-5">
      <ClientOrderSkuExplainer sku={sku} />

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatMenuPriceFrom(sku.priceFromAud)}
        </span>{" "}
        · Outside your subscription. Your order goes to the agency for fulfilment.
      </p>

      <form action={placeClientMenuOrderAction} className="space-y-5">
        <input type="hidden" name="skuId" value={sku.id} />

        <ClientOrderBriefFields
          skuId={sku.id}
          categoryId={sku.categoryId}
          dishTitle={sku.title}
          prefill={prefill}
        />

        <Field
          label="Working title (optional)"
          htmlFor="topic"
          hint="Only if you want a specific headline — otherwise we draft from the topic above"
        >
          <Input
            id="topic"
            name="topic"
            placeholder={`e.g. a headline for this ${sku.title.toLowerCase()}`}
          />
        </Field>

        <Field
          label="Preferred date (optional)"
          htmlFor="preferredDate"
          hint="Use when timing is “Specific date”"
        >
          <Input id="preferredDate" name="preferredDate" type="date" />
        </Field>

        <ClientOrderBriefConfirm
          skuId={sku.id}
          categoryId={sku.categoryId}
          dishTitle={sku.title}
        />

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <ActionSubmitButton
            type="submit"
            pendingLabel="Submitting…"
            className="whitespace-nowrap"
          >
            Pay and place order
          </ActionSubmitButton>
        </div>
      </form>
    </div>
  );
}
