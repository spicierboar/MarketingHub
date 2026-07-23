"use client";

/**
 * Client self-serve package change — select → quote (with credit) → confirm.
 */

import { useMemo, useState } from "react";
import { FormModal } from "@/components/form-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmClientPackageChangeAction } from "@/app/(client)/client/account/package-actions";
import {
  buildClientPackageChangeQuote,
  type ClientPackageOption,
} from "@/lib/client-package-change";
import type { CurrentMarketingPackageId } from "@/lib/types";

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export function ClientPackageChangePanel({
  companyId,
  currentPackageId,
  currentPackageName,
  currentPriceAud,
  options,
  creditBalanceUsd,
  packageChangePendingBilling,
  periodEndIso,
}: {
  companyId: string;
  currentPackageId: CurrentMarketingPackageId;
  currentPackageName: string;
  currentPriceAud: number;
  options: ClientPackageOption[];
  creditBalanceUsd: number;
  packageChangePendingBilling: boolean;
  periodEndIso?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectable = useMemo(
    () => options.filter((o) => o.id !== currentPackageId),
    [options, currentPackageId],
  );

  const displayQuote = useMemo(() => {
    if (!selectedId) return null;
    const target = options.find((o) => o.id === selectedId);
    if (!target) return null;
    return buildClientPackageChangeQuote({
      currentPackageId,
      currentPackageName,
      currentPriceAud,
      targetPackageId: target.id,
      targetPackageName: target.name,
      targetPriceAud: target.priceAudMonthly,
      creditBalanceUsd,
      periodEndIso,
    });
  }, [
    selectedId,
    options,
    currentPackageId,
    currentPackageName,
    currentPriceAud,
    creditBalanceUsd,
    periodEndIso,
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {packageChangePendingBilling ? (
          <Badge tone="warning">Billing pending</Badge>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="whitespace-nowrap"
          disabled={packageChangePendingBilling || selectable.length === 0}
          onClick={() => {
            setSelectedId(null);
            setOpen(true);
          }}
        >
          Change package
        </Button>
      </div>

      {open ? (
        <FormModal
          title="Change marketing package"
          description="Upgrade takes effect after payment confirms. Downgrades schedule at period end; monthly savings credit your account balance."
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current:{" "}
              <span className="font-medium text-foreground">
                {currentPackageName}
              </span>{" "}
              · {money(currentPriceAud)}/mo excl GST
            </p>

            <ul className="space-y-2">
              {selectable.map((opt) => {
                const active = selectedId === opt.id;
                const delta = opt.priceAudMonthly - currentPriceAud;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(opt.id)}
                      className={`flex w-full flex-col gap-1 rounded-md border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{opt.name}</span>
                        <span className="text-sm font-medium tabular-nums">
                          {money(opt.priceAudMonthly)}
                          <span className="font-normal text-muted-foreground">
                            /mo
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{opt.blurb}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {opt.imageQuotaPerMonth} campaign images +{" "}
                        {opt.videoQuotaPerMonth} short videos / mo
                        {delta !== 0
                          ? ` · ${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}/mo`
                          : null}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            {displayQuote && displayQuote.kind !== "same" ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-medium capitalize">{displayQuote.kind}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Monthly delta</span>
                  <span className="tabular-nums">
                    {displayQuote.priceDeltaAud >= 0 ? "+" : "−"}
                    {money(Math.abs(displayQuote.priceDeltaAud))}
                  </span>
                </div>
                {displayQuote.creditAppliedAud > 0 ? (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {displayQuote.kind === "upgrade"
                        ? "Credit applied"
                        : "Credit refunded to balance"}
                    </span>
                    <span className="tabular-nums">
                      {displayQuote.kind === "upgrade" ? "−" : "+"}
                      {money(displayQuote.creditAppliedAud)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-t border-border pt-2 font-medium">
                  <span>Due now</span>
                  <span className="tabular-nums">
                    {money(displayQuote.amountDueNowAud)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {displayQuote.effectiveAtLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  Available credit: {money(creditBalanceUsd)}
                </p>
              </div>
            ) : null}

            <form
              action={confirmClientPackageChangeAction}
              className="flex justify-end gap-2"
            >
              <input type="hidden" name="companyId" value={companyId} />
              <input
                type="hidden"
                name="targetPackageId"
                value={selectedId ?? ""}
              />
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="whitespace-nowrap"
                disabled={
                  !selectedId || !displayQuote || displayQuote.kind === "same"
                }
              >
                {displayQuote?.submitLabel ?? "Confirm change"}
              </Button>
            </form>
          </div>
        </FormModal>
      ) : null}
    </>
  );
}
