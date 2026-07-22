import { getExtraOrderExplainer } from "@/lib/client-order-explainer";
import type { ClientMenuSku } from "@/lib/client-order-catalogue-data";

/**
 * Always-visible education block on Extra order pages —
 * what it is, how to use it, how we deploy it.
 */
export function ClientOrderSkuExplainer({ sku }: { sku: ClientMenuSku }) {
  const explainer = getExtraOrderExplainer(sku);

  return (
    <aside
      className="rounded-lg border border-border bg-muted/40 px-4 py-3.5"
      aria-label={`About ${sku.title}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        About this Extra
      </p>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-foreground">What it is</dt>
          <dd className="mt-0.5 text-muted-foreground leading-relaxed">
            {explainer.about}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">How you can use it</dt>
          <dd className="mt-0.5 text-muted-foreground leading-relaxed">
            {explainer.usedFor}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">How we deploy it</dt>
          <dd className="mt-0.5 text-muted-foreground leading-relaxed">
            {explainer.deployed}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
