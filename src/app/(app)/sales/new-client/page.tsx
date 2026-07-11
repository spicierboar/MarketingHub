import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSalesRepOrAdmin } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { stripeConfigured } from "@/lib/billing";
import { ADDONS, ADDON_ORDER, isAddonId } from "@/lib/addons";
import type { AddonId } from "@/lib/types";
import { PROFILE_FIELD_HELP } from "@/lib/profile-suggestions";
import { ProfileSuggestButton } from "@/components/profile-suggest-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { BusinessTypeSection } from "@/app/(app)/companies/business-profile-fields";
import {
  nextUnpaidAddon,
  provisionClientAction,
  saveAddonsStepAction,
  saveBusinessStepAction,
  skipAddonsAction,
  skipCheckoutAction,
  startAddonCheckoutAction,
} from "../actions";

type Step = "business" | "addons" | "checkout" | "provision" | "done";

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "business", label: "Business" },
    { key: "addons", label: "Add-ons" },
    { key: "checkout", label: "Checkout" },
    { key: "provision", label: "Client login" },
    { key: "done", label: "Done" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold " +
              (i <= idx
                ? "bg-primary/20 text-primary ring-2 ring-primary"
                : "bg-muted text-muted-foreground")
            }
          >
            {i + 1}
          </span>
          <span className={i === idx ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    companyId?: string;
    addons?: string;
    paid?: string;
    checkout?: string;
    clientEmail?: string;
  }>;
}) {
  await requireSalesRepOrAdmin();
  const params = await searchParams;
  const companyId = params.companyId?.trim();
  let step: Step = "business";
  if (params.step === "addons" && companyId) step = "addons";
  else if (params.step === "checkout" && companyId) step = "checkout";
  else if (params.step === "provision" && companyId) step = "provision";
  else if (params.step === "done" && companyId) step = "done";
  const company = companyId ? await getCompany(companyId) : null;
  if (companyId && !company) redirect("/sales/new-client");
  const selectedAddons = (params.addons ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isAddonId) as AddonId[];
  const checkoutQueue =
    params.checkout === "success" && params.paid && isAddonId(params.paid)
      ? selectedAddons.filter((id) => id !== params.paid)
      : selectedAddons;
  if (step === "checkout" && companyId) {
    const unpaid = await nextUnpaidAddon(companyId, checkoutQueue);
    if (!unpaid) redirect(`/sales/new-client?step=provision&companyId=${companyId}`);
  }
  const unpaidAddon =
    step === "checkout" && companyId
      ? await nextUnpaidAddon(companyId, checkoutQueue)
      : null;

  return (
    <div>
      <PageHeader
        title="New client"
        description="Field sales wizard — company, add-ons, client portal login."
      />
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6">
            <Stepper step={step} />
            {step === "business" && (
              <form id="new-client-business-form" action={saveBusinessStepAction} className="space-y-4">
                <Field
                  label="Client name"
                  htmlFor="name"
                  hint="Trading name customers recognise — not necessarily the legal entity."
                >
                  <Input id="name" name="name" required placeholder="e.g. Bondi Beach Café" />
                </Field>
                <BusinessTypeSection initialType="other" />
                <ProfileSuggestButton formId="new-client-business-form" compact />
                <Field
                  label="Nature of business"
                  htmlFor="natureOfBusiness"
                  hint={PROFILE_FIELD_HELP.natureOfBusiness}
                >
                  <Textarea
                    id="natureOfBusiness"
                    name="natureOfBusiness"
                    rows={2}
                    placeholder="e.g. A family café in Bondi serving breakfast and lunch."
                  />
                </Field>
                <Field
                  label="Target customers"
                  htmlFor="targetCustomers"
                  hint={PROFILE_FIELD_HELP.targetCustomers}
                >
                  <Textarea
                    id="targetCustomers"
                    name="targetCustomers"
                    rows={2}
                    placeholder="Local families and weekday workers"
                  />
                </Field>
                <Field
                  label="Brand voice"
                  htmlFor="brandVoice"
                  hint={PROFILE_FIELD_HELP.brandVoice}
                >
                  <Textarea
                    id="brandVoice"
                    name="brandVoice"
                    rows={2}
                    placeholder="Warm and neighbourly — never pushy"
                  />
                </Field>
                <Button type="submit">Continue</Button>
              </form>
            )}
            {step === "addons" && company && (
              <form action={saveAddonsStepAction} className="space-y-4">
                <input type="hidden" name="companyId" value={company.id} />
                <p className="text-sm text-muted-foreground">
                  Optional paid capabilities for this client. Skip if you only need the base plan.
                </p>
                {ADDON_ORDER.map((id) => (
                  <label key={id} className="flex gap-3 rounded border p-3">
                    <input type="checkbox" name="addonId" value={id} className="mt-1" />
                    <span className="text-sm">
                      <span className="font-medium">
                        {ADDONS[id].icon} {ADDONS[id].name} — ${ADDONS[id].priceAudMonthly}/mo
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">{ADDONS[id].blurb}</span>
                    </span>
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" formAction={skipAddonsAction}>
                    Skip
                  </Button>
                  <Button type="submit">Continue</Button>
                </div>
              </form>
            )}
            {step === "checkout" && company && unpaidAddon && (
              <form action={startAddonCheckoutAction} className="space-y-4">
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="addonId" value={unpaidAddon} />
                <input type="hidden" name="remaining" value={checkoutQueue.join(",")} />
                <p className="text-sm">
                  {ADDONS[unpaidAddon].name} for {company.name}
                </p>
                <Button type="submit">
                  {stripeConfigured() ? "Stripe checkout" : "Enable (demo)"}
                </Button>
                <Button type="submit" variant="secondary" formAction={skipCheckoutAction}>
                  Skip
                </Button>
              </form>
            )}
            {step === "provision" && company && (
              <form action={provisionClientAction} className="space-y-4">
                <input type="hidden" name="companyId" value={company.id} />
                <p className="text-sm text-muted-foreground">
                  Creates the client&apos;s portal login. They sign in with a magic link — no
                  password.
                </p>
                <Field label="Client name" htmlFor="name">
                  <Input id="name" name="name" required />
                </Field>
                <Field
                  label="Client email"
                  htmlFor="email"
                  hint="Where the magic-link invite is sent (or used at /login in demo)."
                >
                  <Input id="email" name="email" type="email" required />
                </Field>
                <Button type="submit">Create login</Button>
              </form>
            )}
            {step === "done" && company && (
              <div className="space-y-4 text-center">
                <h2 className="text-lg font-semibold">{company.name} is ready</h2>
                {params.clientEmail && (
                  <p className="text-sm text-muted-foreground">
                    {params.clientEmail} — magic link at /login
                  </p>
                )}
                <Link href={`/companies/${company.id}`}>
                  <Button variant="secondary">View company</Button>
                </Link>
                <Link href="/sales/new-client">
                  <Button>Add another</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
