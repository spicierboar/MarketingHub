"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Field, Select } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import {
  CLIENT_ORDER_CATEGORIES,
  formatMenuPriceFrom,
  getClientMenuSku,
  skusForCategory,
  type ClientMenuSku,
} from "@/lib/client-order-menu";

/**
 * Cascading category → item picker for Extras content add-ons.
 */
export function ClientOrderCataloguePicker({
  initialSkuId,
}: {
  initialSkuId?: string;
}) {
  const initial = initialSkuId ? getClientMenuSku(initialSkuId) : undefined;
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [skuId, setSkuId] = useState(initial?.id ?? "");

  const items = useMemo(
    () => (categoryId ? skusForCategory(categoryId) : []),
    [categoryId],
  );

  const selected: ClientMenuSku | undefined = useMemo(
    () => (skuId ? getClientMenuSku(skuId) : undefined),
    [skuId],
  );

  const categoryMeta = CLIENT_ORDER_CATEGORIES.find((c) => c.id === categoryId);

  return (
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
            ? categoryMeta.blurb
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

      {selected ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{selected.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{selected.blurb}</p>
            <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
              {formatMenuPriceFrom(selected.priceFromAud)}
            </p>
          </div>
          <Link
            href={`/client/order/${selected.id}`}
            className={buttonClasses("default", "sm")}
          >
            Continue to order
          </Link>
        </div>
      ) : null}
    </div>
  );
}
