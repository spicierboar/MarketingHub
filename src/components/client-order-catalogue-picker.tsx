"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/form-modal";
import { ClientMenuOrderForm } from "@/components/client-menu-order-form";
import type { OrderBriefPrefill } from "@/lib/client-order-brief-prefill";
import {
  CLIENT_ORDER_CATEGORIES,
  formatMenuPriceFrom,
  getClientMenuSku,
  skusForCategory,
  type ClientMenuSku,
} from "@/lib/client-order-menu";

const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "AEO", meaning: "Answer Engine Optimisation — writing so AI assistants (ChatGPT, Perplexity) quote you directly." },
  { term: "GEO", meaning: "Generative Engine Optimisation — evidence-led content generative AI can trust and cite." },
  { term: "LLMO", meaning: "Large Language Model Optimisation — copy structured so AI tools parse it accurately." },
  { term: "SEO", meaning: "Search Engine Optimisation — the classic discipline of ranking well in Google." },
];

/** True when an item's id/optimiseFor tags reference AEO/GEO/LLMO/SEO jargon. */
function isDiscoveryJargon(sku: ClientMenuSku | undefined): boolean {
  if (!sku) return false;
  if (sku.categoryId === "discovery") return true;
  const optimise = sku.optimiseFor ?? [];
  if (optimise.some((o) => o === "aeo" || o === "geo" || o === "llmo" || o === "seo")) {
    return true;
  }
  return /\b(aeo|geo|llmo|seo)\b/i.test(`${sku.id} ${sku.title}`);
}

/** Compact glossary for the AEO/GEO/LLMO/SEO jargon used in the Discovery category. */
function ExtrasGlossaryCard() {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5" aria-label="Discovery jargon glossary">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Jargon, plain-language
      </p>
      <dl className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="text-xs leading-snug text-muted-foreground">
            <dt className="inline font-semibold text-foreground">{g.term}</dt>
            <dd className="inline"> — {g.meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Cascading category → item picker for Extras content add-ons.
 * “Continue to order” opens the brief form in a modal (not a full page).
 */
export function ClientOrderCataloguePicker({
  initialSkuId,
  openSkuId,
  prefill,
}: {
  initialSkuId?: string;
  /** Deep-link / redirect from `/client/order/[skuId]`. */
  openSkuId?: string;
  prefill: OrderBriefPrefill;
}) {
  const router = useRouter();
  const initial = initialSkuId ? getClientMenuSku(initialSkuId) : undefined;
  const openInitial = openSkuId ? getClientMenuSku(openSkuId) : undefined;
  const [categoryId, setCategoryId] = useState(
    openInitial?.categoryId ?? initial?.categoryId ?? "",
  );
  const [skuId, setSkuId] = useState(openInitial?.id ?? initial?.id ?? "");
  const [orderSkuId, setOrderSkuId] = useState<string | null>(
    openInitial?.id ?? null,
  );

  useEffect(() => {
    if (!openSkuId) return;
    const sku = getClientMenuSku(openSkuId);
    if (!sku) return;
    setCategoryId(sku.categoryId);
    setSkuId(sku.id);
    setOrderSkuId(sku.id);
  }, [openSkuId]);

  const items = useMemo(
    () => (categoryId ? skusForCategory(categoryId) : []),
    [categoryId],
  );

  const selected: ClientMenuSku | undefined = useMemo(
    () => (skuId ? getClientMenuSku(skuId) : undefined),
    [skuId],
  );

  const orderSku = orderSkuId ? getClientMenuSku(orderSkuId) : undefined;
  const categoryMeta = CLIENT_ORDER_CATEGORIES.find((c) => c.id === categoryId);

  const closeOrderModal = () => {
    setOrderSkuId(null);
    router.replace("/client/order", { scroll: false });
  };

  return (
    <>
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
        <Field label="Category" htmlFor="extras-category">
          <Select
            id="extras-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSkuId("");
            }}
          >
            <option value="">Select a category…</option>
            {CLIENT_ORDER_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Item"
          htmlFor="extras-item"
          hint={
            categoryMeta
              ? `${categoryMeta.blurb} · ${items.length} item${items.length === 1 ? "" : "s"}`
              : "Choose a category first to see available items"
          }
        >
          <Select
            id="extras-item"
            value={skuId}
            disabled={!categoryId}
            onChange={(e) => setSkuId(e.target.value)}
          >
            <option value="">
              {categoryId ? "Select an item…" : "Select a category first…"}
            </option>
            {items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {formatMenuPriceFrom(s.priceFromAud)}
              </option>
            ))}
          </Select>
        </Field>

        {categoryId === "discovery" || isDiscoveryJargon(selected) ? (
          <ExtrasGlossaryCard />
        ) : null}

        {categoryId === "brand_motion" ? (
          <div
            className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
            aria-label="Brand and motion fulfilment note"
          >
            <p className="font-semibold text-foreground">How Brand &amp; motion works</p>
            <p className="mt-1">
              You approve a creative brief or script first. Studio then renders the
              final logo, GIF, ad, film, or animation file. Finished visuals are not
              instant AI downloads and are not auto-posted.
            </p>
          </div>
        ) : null}

        {selected ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{selected.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{selected.blurb}</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {formatMenuPriceFrom(selected.priceFromAud)}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setOrderSkuId(selected.id)}
            >
              Continue to order
            </Button>
          </div>
        ) : null}
      </div>

      {orderSku ? (
        <FormModal
          title={orderSku.title}
          description={`${formatMenuPriceFrom(orderSku.priceFromAud)} · Outside your subscription — agency fulfilment after you submit.`}
          wide
          onClose={closeOrderModal}
        >
          <ClientMenuOrderForm
            sku={orderSku}
            prefill={prefill}
            onCancel={closeOrderModal}
          />
        </FormModal>
      ) : null}
    </>
  );
}
