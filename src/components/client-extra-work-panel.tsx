"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import {
  durationLabel,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import {
  requestCustomWorkAction,
  requestExtraPromoAction,
} from "@/app/(client)/client/account/actions";

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export type ExtraWorkPromoCard = {
  template: PromoTemplate;
  billingClass: "included" | "extra";
  expectedFeeUsd: number;
  totalUsd: number;
  feeUsd: number;
};

/**
 * Extras page — ready-made campaigns + custom paid ask.
 * Copy stays industry-agnostic; catalog items may still match the client’s vertical.
 */
export function ClientExtraWorkPanel({
  promos,
  allowance,
  customWorkFeeAud,
}: {
  promos: ExtraWorkPromoCard[];
  allowance: {
    remaining: number;
    limit: number;
    used: number;
    periodKey: string;
  };
  customWorkFeeAud: number | null;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const confirm = useMemo(
    () => promos.find((p) => p.template.id === confirmId) ?? null,
    [promos, confirmId],
  );

  return (
    <div className="space-y-8">
      <section id="promos" className="scroll-mt-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Ready-made campaigns</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dates and channels set for you. We draft; you approve — nothing goes live on its own.
            </p>
          </div>
          {allowance.limit > 0 ? (
            <Badge tone={allowance.remaining > 0 ? "success" : "warning"}>
              {allowance.remaining > 0
                ? `${allowance.remaining} included left (${allowance.periodKey})`
                : `Allowance used (${allowance.periodKey})`}
            </Badge>
          ) : null}
        </div>

        {promos.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No ready-made campaigns for your business yet — use a custom order below.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {promos.map((p) => {
              const t = p.template;
              const included = p.billingClass === "included";
              return (
                <li
                  key={t.id}
                  className="flex flex-col rounded-md border border-border bg-card p-3"
                >
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.promotion}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs">
                      {included ? (
                        <span className="font-medium text-emerald-700">
                          Included in package
                        </span>
                      ) : (
                        <span className="font-medium">
                          Extra · {money(p.expectedFeeUsd)}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            (incl. {money(p.feeUsd)} fee)
                          </span>
                        </span>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {durationLabel(t)} · dates &amp; channels set for you
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={included ? "outline" : "default"}
                      className="shrink-0 whitespace-nowrap"
                      onClick={() => setConfirmId(t.id)}
                    >
                      Continue to order
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="custom-order" className="scroll-mt-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Custom order</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Not on the list? Describe what you need — we quote and draft for Approvals.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Plain language is fine. This is a paid special outside your subscription, not a
            free message.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {customWorkFeeAud != null && customWorkFeeAud > 0
              ? `Indicative fee ${money(customWorkFeeAud)} — confirmed by your agency.`
              : "Fee quoted by your agency."}
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => setCustomOpen(true)}
          >
            Place custom order
          </Button>
        </div>
      </section>

      {confirm && (
        <FormModal
          title={`Request ${confirm.template.name}?`}
          description="We'll open a ticket and prepare draft posts. Dates and channels come from the package — your agency can adjust. Nothing publishes without approval."
          onClose={() => setConfirmId(null)}
        >
          <form action={requestExtraPromoAction} className="space-y-4">
            <input type="hidden" name="templateId" value={confirm.template.id} />
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Billing</span>
                <span className="font-medium">
                  {confirm.billingClass === "included"
                    ? "Included in package"
                    : `Extra · ${money(confirm.expectedFeeUsd)}`}
                </span>
              </div>
              {confirm.billingClass === "extra" ? (
                <>
                  <div className="mt-1 flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Catalog package</span>
                    <span>{money(confirm.totalUsd)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Markup ({Math.round(confirm.template.markupPercent * 100)}%)
                    </span>
                    <span>{money(confirm.feeUsd)}</span>
                  </div>
                </>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {confirm.template.blurb || confirm.template.promotion}
              </p>
            </div>
            <Field
              label="Note for us (optional)"
              htmlFor="extra-promo-notes"
              hint="Anything we should emphasise for your audience"
            >
              <Input
                id="extra-promo-notes"
                name="notes"
                placeholder="e.g. Focus on weekday offers for local customers"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
              <Button type="submit" className="whitespace-nowrap">
                Continue to order
              </Button>
            </div>
          </form>
        </FormModal>
      )}

      {customOpen && (
        <FormModal
          title="Custom order"
          description="Short plain-language request — not a full brief. We'll draft something for Approvals."
          onClose={() => setCustomOpen(false)}
        >
          <form action={requestCustomWorkAction} className="space-y-4">
            <Field
              label="Subject (optional)"
              htmlFor="custom-topic"
              hint="Leave blank and we’ll use the start of your message"
            >
              <Input
                id="custom-topic"
                name="topic"
                placeholder="e.g. New product or service launch"
              />
            </Field>
            <Field
              label="What do you need?"
              htmlFor="custom-notes"
              hint="Plain language is fine — we’ll turn this into a draft for Approvals"
            >
              <Textarea
                id="custom-notes"
                name="notes"
                required
                rows={5}
                placeholder="e.g. Promote our new offer from next Monday — include price, who it’s for, and any deadline."
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              {customWorkFeeAud != null && customWorkFeeAud > 0
                ? `Indicative fee ${money(customWorkFeeAud)}. Ads media stay extra.`
                : "Fee quoted by your agency. Ads media stay extra."}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Place order</Button>
            </div>
          </form>
        </FormModal>
      )}
    </div>
  );
}
