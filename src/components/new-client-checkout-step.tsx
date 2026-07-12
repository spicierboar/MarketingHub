"use client";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

/** Full Checkout UX for New Client — mock card fields or Stripe redirect. */
export function NewClientCheckoutStep({
  companyId,
  companyName,
  packageName,
  priceAudMonthly,
  mockMode,
  cancelled,
  action,
  skipAction,
}: {
  companyId: string;
  companyName: string;
  packageName: string;
  priceAudMonthly: number;
  mockMode: boolean;
  cancelled?: boolean;
  action: (formData: FormData) => void | Promise<void>;
  skipAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="space-y-5">
      {cancelled && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Checkout was cancelled — you can try again or skip for now (billing stays
          pending).
        </p>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
        <p className="font-medium text-foreground">Order summary</p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span>
            {packageName}{" "}
            <span className="text-muted-foreground">for {companyName}</span>
          </span>
          <span className="font-semibold text-foreground">
            ${priceAudMonthly}
            <span className="font-normal text-muted-foreground"> / month</span>
          </span>
        </div>
        <p className="text-muted-foreground">
          Ad media spend is always extra and prepaid. Card details are never stored
          in Command Centre.
        </p>
      </div>

      {mockMode ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Demo payment</span>
            <span className="text-muted-foreground">
              {" "}
              — Stripe live keys / package prices are not active. Completing this
              step clears billing-pending for the demo and continues to client login.
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
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit">Complete demo payment</Button>
            <Button type="submit" variant="secondary" formAction={skipAction}>
              Skip for now
            </Button>
          </div>
        </form>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          <p className="text-sm text-muted-foreground">
            You will be redirected to Stripe Checkout to pay for this marketing
            package. On success you return here to create the client login.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Pay with Stripe</Button>
            <Button type="submit" variant="secondary" formAction={skipAction}>
              Skip for now
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
