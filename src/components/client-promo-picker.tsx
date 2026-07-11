"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  computePromoPricing,
  durationLabel,
  industryLabel,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import { requestPromoAction } from "@/app/(client)/client/promos/actions";

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export function ClientPromoPicker({
  templates,
}: {
  templates: PromoTemplate[];
  /** @deprecated Per-template markup is used; kept for call-site compatibility. */
  markupPercent?: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );
  const [packagePrice, setPackagePrice] = useState<number>(0);
  const markup = selected?.markupPercent ?? 0.42;
  const pricing = computePromoPricing(
    packagePrice || selected?.suggestedClientPriceUsd || 0,
    markup,
  );

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ready-made promotions for your industry yet — ask us if you want a custom campaign.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((t) => {
          const active = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSelectedId(t.id);
                setPackagePrice(t.suggestedClientPriceUsd);
              }}
              className={`rounded-md border p-3 text-left transition-colors ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {industryLabel(t.industry)}
              </p>
              <p className="mt-0.5 text-sm font-semibold">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.promotion}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {durationLabel(t)} · {money(t.suggestedClientPriceUsd)} ·{" "}
                {Math.round(t.markupPercent * 100)}% markup
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t.outlines.length} ready-to-publish posts included
              </p>
            </button>
          );
        })}
      </div>

      {selected && (
        <form
          action={requestPromoAction}
          className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
        >
          <input type="hidden" name="templateId" value={selected.id} />
          <p className="text-sm font-medium">Customise {selected.name}</p>
          <p className="text-xs text-muted-foreground">
            Posts, hashtags, and CTAs are pre-written. You only adjust package price, start date,
            and channels. {Math.round(markup * 100)}% markup is built into the package.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date" htmlFor="startDate">
              <Input id="startDate" name="startDate" type="date" required />
            </Field>
            <Field
              label="End date"
              htmlFor="endDate"
              hint={
                selected.ongoing
                  ? "Optional — ongoing packs default to ~30 days"
                  : `Optional — defaults to ${durationLabel(selected)}`
              }
            >
              <Input id="endDate" name="endDate" type="date" />
            </Field>
          </div>

          <Field label="Package price (AUD)" htmlFor="budgetUsd" hint="What you pay for this promo">
            <Input
              id="budgetUsd"
              name="budgetUsd"
              type="number"
              min={50}
              step={10}
              required
              value={packagePrice || ""}
              onChange={(e) => setPackagePrice(Number(e.target.value) || 0)}
            />
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium">Social channels</p>
            <div className="flex flex-wrap gap-3">
              {selected.availableChannels.map((ch) => (
                <label key={ch} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    name="channels"
                    value={ch}
                    defaultChecked={selected.defaultChannels.includes(ch)}
                  />
                  {ch.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Promotion</span>
              <span className="text-right">{selected.promotion}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Delivery portion</span>
              <span>{money(pricing.budgetUsd)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">
                Markup ({Math.round(markup * 100)}%)
              </span>
              <span>{money(pricing.feeUsd)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-medium">
              <span>You pay</span>
              <span>{money(pricing.totalUsd)}</span>
            </div>
          </div>

          <Field label="Notes for us (optional)" htmlFor="notes">
            <Input id="notes" name="notes" placeholder="e.g. Focus on gift hampers" />
          </Field>

          <Button type="submit">Request this promotion</Button>
        </form>
      )}
    </div>
  );
}
