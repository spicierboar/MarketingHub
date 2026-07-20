"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  type DemoCardFieldErrors,
  validateDemoCardFields,
} from "@/lib/form-validation";
import { cn } from "@/lib/utils";

function errClass(hasError: boolean) {
  return hasError ? "border-red-500 focus-visible:ring-red-500" : undefined;
}

/** Local-only demo card form; production renders a Stripe Checkout redirect. */
export function OnboardingPlanCheckout({
  packageName,
  priceAudMonthly,
  mockMode,
  cancelled,
  serverError,
  action,
}: {
  packageName: string;
  priceAudMonthly: number;
  mockMode: boolean;
  cancelled?: boolean;
  /** Server-side validation message when client checks were bypassed. */
  serverError?: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [errors, setErrors] = useState<DemoCardFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(serverError ?? null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const result = validateDemoCardFields({
      cardName: String(fd.get("cardName") || ""),
      cardNumber: String(fd.get("cardNumber") || ""),
      cardExpiry: String(fd.get("cardExpiry") || ""),
      cardCvc: String(fd.get("cardCvc") || ""),
    });
    if (!result.ok) {
      e.preventDefault();
      setErrors(result.errors);
      setFormError("Fix the highlighted fields before continuing.");
      return;
    }
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="space-y-5">
      {cancelled && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Checkout was cancelled — retry payment below to finish setup.
        </p>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
        <p className="font-medium text-foreground">Order summary</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            Marketing package:{" "}
            <span className="font-medium text-foreground">{packageName}</span>
          </span>
          <span className="font-semibold text-foreground">
            A${priceAudMonthly}
            <span className="font-normal text-muted-foreground"> / month excl GST</span>
          </span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-2">
          <span>Website connection setup</span>
          <span className="font-semibold text-foreground">A$299 once-off excl GST</span>
        </div>
        <p className="text-muted-foreground">
          Advertising-platform charges go directly to your card, are separate from
          service fees, and stay within your approved monthly cap. Card details are
          never stored in Command Centre.
        </p>
      </div>

      {mockMode ? (
        <form action={action} onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Demo payment</span>
            <span className="text-muted-foreground">
              {" "}
              — Stripe live charges are off here. Completing this step records
              the package selection and finishes setup (no real card charge).
            </span>
          </div>
          {formError ? (
            <p
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
          <Field
            label="Name on card"
            htmlFor="cardName"
            hint="Demo only — not sent to a payment processor"
            error={errors.cardName}
          >
            <Input
              id="cardName"
              name="cardName"
              autoComplete="cc-name"
              placeholder="e.g. Sam Chen"
              defaultValue=""
              aria-invalid={!!errors.cardName}
              className={cn(errClass(!!errors.cardName))}
              onChange={() =>
                setErrors((prev) => {
                  if (!prev.cardName) return prev;
                  const next = { ...prev };
                  delete next.cardName;
                  return next;
                })
              }
            />
          </Field>
          <Field label="Card number" htmlFor="cardNumber" error={errors.cardNumber}>
            <Input
              id="cardNumber"
              name="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              defaultValue=""
              aria-invalid={!!errors.cardNumber}
              className={cn(errClass(!!errors.cardNumber))}
              onChange={() =>
                setErrors((prev) => {
                  if (!prev.cardNumber) return prev;
                  const next = { ...prev };
                  delete next.cardNumber;
                  return next;
                })
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expiry" htmlFor="cardExpiry" error={errors.cardExpiry}>
              <Input
                id="cardExpiry"
                name="cardExpiry"
                autoComplete="cc-exp"
                placeholder="MM / YY"
                aria-invalid={!!errors.cardExpiry}
                className={cn(errClass(!!errors.cardExpiry))}
                onChange={() =>
                  setErrors((prev) => {
                    if (!prev.cardExpiry) return prev;
                    const next = { ...prev };
                    delete next.cardExpiry;
                    return next;
                  })
                }
              />
            </Field>
            <Field label="CVC" htmlFor="cardCvc" error={errors.cardCvc}>
              <Input
                id="cardCvc"
                name="cardCvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                aria-invalid={!!errors.cardCvc}
                className={cn(errClass(!!errors.cardCvc))}
                onChange={() =>
                  setErrors((prev) => {
                    if (!prev.cardCvc) return prev;
                    const next = { ...prev };
                    delete next.cardCvc;
                    return next;
                  })
                }
              />
            </Field>
          </div>
          <Button type="submit">Activate service →</Button>
        </form>
      ) : (
        <form action={action} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Card details are collected only on Stripe&apos;s hosted Checkout page.
            Service delivery starts after Stripe confirms settlement by signed webhook.
          </p>
          <Button type="submit">Continue to secure Stripe Checkout →</Button>
        </form>
      )}
    </div>
  );
}
