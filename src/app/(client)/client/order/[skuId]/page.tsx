import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  formatMenuPriceFrom,
  getClientMenuSku,
} from "@/lib/client-order-menu";
import { placeClientMenuOrderAction } from "../actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { ClientOrderBriefFields } from "@/components/client-order-brief-fields";

export default async function ClientOrderSkuPage({
  params,
}: {
  params: Promise<{ skuId: string }>;
}) {
  await requirePortalUser();
  const { skuId } = await params;
  const sku = getClientMenuSku(skuId);
  if (!sku) notFound();

  return (
    <div>
      <PageHeader
        title={sku.title}
        explainer={sku.blurb}
        parent={{ href: "/client/order", label: "Extras" }}
      />
      <div className="mx-auto max-w-xl space-y-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatMenuPriceFrom(sku.priceFromAud)}
          </span>
          {" "}
          · Outside your subscription. Your order goes to the agency for
          fulfilment.
        </p>

        <form action={placeClientMenuOrderAction} className="space-y-5">
          <input type="hidden" name="skuId" value={sku.id} />

          <ClientOrderBriefFields
            skuId={sku.id}
            categoryId={sku.categoryId}
            dishTitle={sku.title}
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
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Link href="/client/order" className={buttonClasses("ghost", "md")}>
              Back to Extras
            </Link>
            <ActionSubmitButton type="submit" pendingLabel="Submitting…">
              Pay and place order
            </ActionSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
