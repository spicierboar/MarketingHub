"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

/** Demo / staging card capture for agency workspace SaaS plan (no live charge). */
export function OnboardingPlanCheckout({
  planName,
  priceAudMonthly,
  mockMode,
  cancelled,
  action,
}: {
  planName: string;
  priceAudMonthly: number;
  mockMode: boolean;
  cancelled?: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="space-y-5">
      {cancelled && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Checkout was cancelled — pick a plan again or complete the demo payment
          below.
        </p>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
        <p className="font-medium text-foreground">Order summary</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            Workspace plan:{" "}
            <span className="font-medium text-foreground">{planName}</span>
          </span>
          <span className="font-semibold text-foreground">
            ${priceAudMonthly}
            <span className="font-normal text-muted-foreground"> / month</span>
          </span>
        </div>
        <p className="text-muted-foreground">
          This is your agency SaaS subscription (how many client companies you can
          manage). Client marketing packages (Basic / Pro / Blast) are chosen later
          when you add a client. Card details are never stored in Command Centre.
        </p>
      </div>

      {mockMode ? (
        <form action={action} className="space-y-4">
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Demo payment</span>
            <span className="text-muted-foreground">
              {" "}
              — Stripe live charges are off here. Completing this step records the
              plan selection and continues to terms (no real card charge).
            </span>
          </div>
          <Field
            label="Name on card"
            htmlFor="cardName"
            hint="Demo only — not sent to a payment processor"
          >
            <Input
              id="cardName"
              name="cardName"
              autoComplete="cc-name"
              placeholder="e.g. Sam Chen"
              defaultValue=""
            />
          </Field>
          <Field label="Card number" htmlFor="cardNumber">
            <Input
              id="cardNumber"
              name="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              defaultValue=""
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expiry" htmlFor="cardExpiry">
              <Input
                id="cardExpiry"
                name="cardExpiry"
                autoComplete="cc-exp"
                placeholder="MM / YY"
              />
            </Field>
            <Field label="CVC" htmlFor="cardCvc">
              <Input
                id="cardCvc"
                name="cardCvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
              />
            </Field>
          </div>
          <Button type="submit">Complete demo payment →</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          You should have been redirected to Stripe Checkout. If you cancelled,
          go back and choose a workspace plan again.
        </p>
      )}
    </div>
  );
}
