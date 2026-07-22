import { getExtraOrderExplainer } from "@/lib/client-order-explainer";
import { getExtraSkuSpec } from "@/lib/client-order-sku-specs";
import type { ClientMenuSku } from "@/lib/client-order-catalogue-data";

/**
 * Always-visible education block on Extra order pages —
 * what it is, how to use it, how we deploy it, and (when a curated spec
 * exists) exactly what you receive.
 */
export function ClientOrderSkuExplainer({ sku }: { sku: ClientMenuSku }) {
  const explainer = getExtraOrderExplainer(sku);
  const spec = getExtraSkuSpec(sku.id);

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
        {spec ? (
          <div>
            <dt className="font-medium text-foreground">You receive</dt>
            <dd className="mt-0.5 text-muted-foreground leading-relaxed">
              <p>{spec.deliverable}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {spec.includes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {spec.excludes?.length ? (
                <p className="mt-1.5 text-xs">
                  <span className="font-medium">Not included:</span>{" "}
                  {spec.excludes.join("; ")}
                </p>
              ) : null}
              {spec.typicalLength || spec.channels?.length ? (
                <p className="mt-1.5 text-xs">
                  {spec.typicalLength ? `Typical length: ${spec.typicalLength}` : null}
                  {spec.typicalLength && spec.channels?.length ? " · " : null}
                  {spec.channels?.length ? `Delivered for: ${spec.channels.join(", ")}` : null}
                </p>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}
