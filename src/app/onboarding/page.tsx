import { redirect } from "next/navigation";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import { currentTerms, getTenant, hasAcceptedTerms } from "@/lib/db";
import { stripeConfigured, useMockPackageCheckout } from "@/lib/billing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { listActivePackagesForSignup } from "@/lib/marketing-packages";
import { OnboardingPackagePicker } from "@/components/onboarding-package-picker";
import { OnboardingDetailsFields } from "@/components/onboarding-details-fields";
import { OnboardingPlanCheckout } from "@/components/onboarding-plan-checkout";
import {
  completeOnboardingAction,
  completeOnboardingPlanPaymentAction,
  saveOnboardingDetailsAction,
  selectOnboardingPackageAction,
  selectOnboardingPlanAction,
} from "./actions";

type Step = "details" | "package" | "workspace" | "payment" | "terms";

function Stepper({
  step,
  isAgency,
  showPayment,
}: {
  step: Step;
  isAgency: boolean;
  /** Mock/demo card step (live Stripe captures card off-site after plan pick). */
  showPayment: boolean;
}) {
  // Agency SaaS signup ≠ client marketing packages (those are New Client / Add Client).
  const steps: { key: Step; label: string }[] = isAgency
    ? [
        { key: "details", label: "Your details" },
        { key: "workspace", label: "Workspace plan" },
        ...(showPayment
          ? [{ key: "payment" as const, label: "Payment" }]
          : []),
        { key: "terms", label: "Accept terms" },
      ]
    : [
        { key: "details", label: "Your details" },
        { key: "package", label: "Marketing package" },
        { key: "terms", label: "Accept terms" },
      ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={
              "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
              (i < idx
                ? "bg-primary text-primary-foreground"
                : i === idx
                  ? "bg-primary/20 text-primary ring-2 ring-primary"
                  : "bg-muted text-muted-foreground")
            }
          >
            {i < idx ? "✓" : i + 1}
          </span>
          <span className={i === idx ? "font-medium" : "text-muted-foreground"}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-muted-foreground">→</span>
          )}
        </li>
      ))}
    </ol>
  );
}

// Workspace onboarding wizard. Agency tenants: details → SaaS plan → payment → terms.
// Business-group tenants: details → marketing package → terms.
// Client marketing packages (Basic/Pro/Blast) for agencies are chosen on New Client.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; checkout?: string }>;
}) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) redirect("/login");
  // Already onboarded → nothing to do.
  if (tenant.onboardingCompletedAt) redirect("/dashboard");

  const params = await searchParams;
  const isAgency = tenant.kind === "agency";
  const mockPlanCheckout = useMockPackageCheckout();
  const detailsDone = !!(
    tenant.onboarding?.abn &&
    tenant.onboarding?.industry &&
    tenant.onboarding?.natureOfBusiness &&
    tenant.onboarding?.contactName &&
    tenant.onboarding?.contactEmail
  );
  const packageDone = !!tenant.onboarding?.marketingPackageId;
  // Agency plan is "done" once a known plan is set (seed default is starter —
  // treat explicit selection via audit as optional; require plan in PLANS which
  // always holds for seeded tenants). After details, always show workspace.
  const planSelected = isAgency && !!(tenant.plan && tenant.plan in PLANS);

  // Resolve the step: an explicit ?step wins (if its prerequisites are met),
  // else the first incomplete step.
  const requested = params.step as Step | undefined;
  let step: Step;
  if (!detailsDone) {
    step = "details";
  } else if (isAgency) {
    // Agency never sees marketing package. After details → workspace → payment → terms.
    // Payment is skipped when returning from live Stripe (checkout=success → terms).
    if (params.checkout === "success") {
      step = "terms";
    } else {
      step = "workspace";
    }
  } else {
    step = !packageDone ? "package" : "terms";
  }

  if (requested === "details") step = "details";
  if (requested === "package" && detailsDone && !isAgency) step = "package";
  if (requested === "workspace" && detailsDone && isAgency) step = "workspace";
  if (requested === "payment" && detailsDone && isAgency && planSelected) {
    step = "payment";
  }
  // Legacy ?step=plan → workspace (agency) or package (business group).
  if (params.step === "plan" && detailsDone) {
    step = isAgency ? "workspace" : "package";
  }
  if (requested === "terms" && detailsDone) {
    if (isAgency || packageDone) step = "terms";
  }

  // Agency: ignore stale ?step=package bookmarks.
  if (isAgency && (requested === "package" || step === "package")) {
    step = "workspace";
  }

  const terms = await currentTerms();
  const packages = listActivePackagesForSignup(tenant).map((p) => ({
    id: p.id,
    name: p.name,
    priceAudMonthly: p.priceAudMonthly,
    blurb: p.blurb,
    channels: p.channels,
    postsPerMonth: p.postsPerMonth,
    campaignsPerMonth: p.campaignsPerMonth,
    promosIncludedPerMonth: p.promosIncludedPerMonth,
    adsManagementIncluded: p.adsManagementIncluded,
    imageQuotaPerMonth: p.imageQuotaPerMonth,
    videoQuotaPerMonth: p.videoQuotaPerMonth,
    defaultServiceLevel: p.defaultServiceLevel,
    customModuleRates: p.customModuleRates,
  }));

  const selectedPlan = PLANS[tenant.plan] ?? PLANS.starter;
  const backFromTerms = isAgency
    ? mockPlanCheckout
      ? "/onboarding?step=payment"
      : "/onboarding?step=workspace"
    : "/onboarding?step=package";

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Welcome to Marketing Command Centre</h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s set up <span className="font-medium">{tenant.name}</span>. This
          takes a minute.
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <Stepper
            step={step}
            isAgency={isAgency}
            showPayment={mockPlanCheckout || !stripeConfigured()}
          />

          {step === "details" && (
            <form action={saveOnboardingDetailsAction} className="space-y-4">
              <p className="text-sm text-muted-foreground">Tell us about your business.</p>
              <OnboardingDetailsFields
                defaults={{
                  abn: tenant.onboarding?.abn,
                  industry: tenant.onboarding?.industry,
                  natureOfBusiness: tenant.onboarding?.natureOfBusiness,
                  contactName: tenant.onboarding?.contactName ?? user.name,
                  contactEmail: tenant.onboarding?.contactEmail ?? user.email,
                  contactPhone: tenant.onboarding?.contactPhone,
                  notes: tenant.onboarding?.notes,
                }}
              />
              <Button type="submit">Continue →</Button>
            </form>
          )}

          {step === "package" && !isAgency && (
            <div className="space-y-4">
              <OnboardingPackagePicker
                packages={packages}
                initialPackageId={tenant.onboarding?.marketingPackageId}
                initialCustomModules={tenant.onboarding?.customModules}
                action={selectOnboardingPackageAction}
              />
              <a
                href="/onboarding?step=details"
                className="text-xs text-muted-foreground hover:underline"
              >
                ← Back to details
              </a>
            </div>
          )}

          {step === "workspace" && isAgency && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose a <span className="font-medium">Workspace / Agency plan</span>{" "}
                — how many client companies this agency can manage. Client marketing
                packages (Basic / Pro / Blast) are selected later when you add a
                client, not during agency signup.
                {mockPlanCheckout
                  ? " Next you'll enter card details in a demo payment step (no live charge)."
                  : stripeConfigured()
                    ? " You'll enter your card securely on Stripe Checkout — we never store card details."
                    : " Card capture runs through Stripe in production; here the plan is applied via a demo payment step."}
              </p>
              {params.checkout === "cancelled" && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Stripe Checkout was cancelled — choose a plan to try again.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {PLAN_ORDER.map((id) => {
                  const p = PLANS[id];
                  return (
                    <form key={id} action={selectOnboardingPlanAction} className="flex">
                      <input type="hidden" name="plan" value={id} />
                      <button
                        type="submit"
                        className="flex w-full flex-col rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="mt-1 text-2xl font-bold">
                          ${p.priceAudMonthly}
                          <span className="text-sm font-normal text-muted-foreground">
                            /mo
                          </span>
                        </span>
                        <span className="mt-1 text-xs text-muted-foreground">
                          {p.companyLimit === null
                            ? "Unlimited"
                            : `Up to ${p.companyLimit}`}{" "}
                          client{p.companyLimit === 1 ? "" : "s"}
                        </span>
                        <span className="mt-2 text-xs text-muted-foreground">
                          {p.blurb}
                        </span>
                      </button>
                    </form>
                  );
                })}
              </div>
              <a
                href="/onboarding?step=details"
                className="text-xs text-muted-foreground hover:underline"
              >
                ← Back to details
              </a>
            </div>
          )}

          {step === "payment" && isAgency && (
            <div className="space-y-4">
              <OnboardingPlanCheckout
                planName={selectedPlan.name}
                priceAudMonthly={selectedPlan.priceAudMonthly}
                mockMode={mockPlanCheckout || !stripeConfigured()}
                cancelled={params.checkout === "cancelled"}
                action={completeOnboardingPlanPaymentAction}
              />
              <a
                href="/onboarding?step=workspace"
                className="text-xs text-muted-foreground hover:underline"
              >
                ← Back to workspace plan
              </a>
            </div>
          )}

          {step === "terms" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Finally, please review and accept our terms to finish setting up your
                workspace.
              </p>
              {isAgency ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Workspace plan:{" "}
                  <span className="font-medium text-foreground">
                    {selectedPlan.name}
                  </span>{" "}
                  (A${selectedPlan.priceAudMonthly}/mo). Marketing packages for each
                  client are chosen when you add them.
                </p>
              ) : tenant.onboarding?.marketingPackageId ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Marketing package:{" "}
                  <span className="font-medium text-foreground">
                    {tenant.onboarding.marketingPackageId}
                  </span>
                  {tenant.onboarding.marketingPackageId === "custom" &&
                  tenant.onboarding.customModules
                    ? ` · ${tenant.onboarding.customModules.serviceLevel}`
                    : null}
                  . Ad spend is always extra.
                </p>
              ) : null}
              {params.checkout === "success" && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Payment received — accept terms below to finish.
                </p>
              )}
              {terms ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{terms.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      v{terms.version}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      effective {formatDate(terms.effectiveDate)}
                    </span>
                  </div>
                  <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {terms.body}
                  </div>
                  {(await hasAcceptedTerms(user.id, terms.version)) && (
                    <p className="text-xs text-emerald-600">
                      You&apos;ve already accepted this version — just finish below.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No terms are configured yet — you can finish setup.
                </p>
              )}
              <div className="flex items-center justify-between">
                <a
                  href={backFromTerms}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  ← Back
                </a>
                <form action={completeOnboardingAction}>
                  <Button type="submit">Accept &amp; finish setup</Button>
                </form>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
