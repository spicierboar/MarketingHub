import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import {
  formatMenuPriceFrom,
  getClientMenuSku,
} from "@/lib/client-order-menu";
import { placeClientMenuOrderAction } from "../actions";
import { ActionSubmitButton } from "@/components/action-submit-button";

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
        parent={{ href: "/client/order", label: "Order menu" }}
      />
      <div className="mx-auto max-w-xl space-y-6 px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatMenuPriceFrom(sku.priceFromAud)}
          </span>
          {" "}
          · Outside your subscription package. Your agency will confirm and deliver;
          checkout for payment will be added next.
        </p>

        <form action={placeClientMenuOrderAction} className="space-y-5">
          <input type="hidden" name="skuId" value={sku.id} />
          <Field
            label="Subject"
            htmlFor="topic"
            hint="What should this be about?"
          >
            <Input
              id="topic"
              name="topic"
              required
              placeholder={`e.g. ${sku.title} for…`}
            />
          </Field>
          <Field
            label="Details"
            htmlFor="notes"
            hint="Key facts, timing, tone — plain language is fine"
          >
            <Textarea id="notes" name="notes" required rows={5} />
          </Field>
          <Field label="Preferred date (optional)" htmlFor="preferredDate">
            <Input id="preferredDate" name="preferredDate" type="date" />
          </Field>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <Link href="/client/order" className={buttonClasses("ghost", "md")}>
              Back to menu
            </Link>
            <ActionSubmitButton type="submit" pendingLabel="Sending…">
              Place order
            </ActionSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
