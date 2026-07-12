"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import {
  durationLabel,
  industryLabel,
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

type Tab = "promo" | "custom";

/**
 * Account → Request extra work.
 * Ready-made: one-tap (template defaults). Custom: topic + notes FormModal.
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
  const [tab, setTab] = useState<Tab>("promo");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  const confirm = useMemo(
    () => promos.find((p) => p.template.id === confirmId) ?? null,
    [promos, confirmId],
  );

  return (
    <section id="extra-work" className="scroll-mt-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Request extra work</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ready-made promo or a short custom ask. We draft; you approve — nothing goes live
            on its own.
          </p>
        </div>
        {allowance.limit > 0 ? (
          <Badge tone={allowance.remaining > 0 ? "success" : "warning"}>
            {allowance.remaining > 0
              ? `${allowance.remaining} included left (${allowance.periodKey})`
              : `Allowance used · extras billed (${allowance.periodKey})`}
          </Badge>
        ) : (
          <Badge tone="warning">Extras billed</Badge>
        )}
      </div>

      <div className="flex gap-1 rounded-md border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setTab("promo")}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium sm:text-sm ${
            tab === "promo"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Ready-made promo
        </button>
        <button
          type="button"
          onClick={() => setTab("custom")}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium sm:text-sm ${
            tab === "custom"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Custom ask
        </button>
      </div>

      {tab === "promo" ? (
        <div className="space-y-3">
          {promos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No ready-made promos for your industry yet — use Custom ask.
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
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {industryLabel(t.industry)}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold">{t.name}</p>
                    <p className="mt-1 flex-1 text-xs text-muted-foreground">
                      {t.promotion}
                    </p>
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
                        onClick={() => setConfirmId(t.id)}
                      >
                        Request
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Tell us what you need in plain language. We&apos;ll open a ticket and start a draft
            for review.
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
            Write a custom ask
          </Button>
        </div>
      )}

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
                placeholder="e.g. Focus on weekend brunch for locals"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
              <Button type="submit">Confirm request</Button>
            </div>
          </form>
        </FormModal>
      )}

      {customOpen && (
        <FormModal
          title="Custom ask"
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
                placeholder="e.g. New seasonal menu push"
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
                placeholder="e.g. Promote our new winter soup special from next Monday — $12.90 takeaway, aim at locals within 10 minutes."
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
              <Button type="submit">Send ask</Button>
            </div>
          </form>
        </FormModal>
      )}
    </section>
  );
}
