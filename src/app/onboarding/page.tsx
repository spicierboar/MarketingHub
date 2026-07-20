import { redirect } from "next/navigation";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import {
  currentPrivacy,
  currentTerms,
  getTenant,
  hasAcceptedTerms,
} from "@/lib/db";
import { mockPackageCheckoutEnabled } from "@/lib/billing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  listActivePackagesForSignup,
  quoteCustomPackagePrice,
  resolvePackageById,
} from "@/lib/marketing-packages";
import { OnboardingPackagePicker } from "@/components/onboarding-package-picker";
import { OnboardingDetailsFields } from "@/components/onboarding-details-fields";
import { OnboardingPlanCheckout } from "@/components/onboarding-plan-checkout";
import {
  currentPackageId,
  monthlyServiceOptionsAud,
} from "@/lib/managed-service-billing";
import {
  acceptOnboardingTermsAction,
  completeOnboardingPaymentAction,
  saveOnboardingDetailsAction,
  selectOnboardingPackageAction,
} from "./actions";

type Step = "details" | "package" | "terms" | "payment";

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "Your details" },
    { key: "package", label: "Marketing package" },
    { key: "terms", label: "Terms & privacy" },
    { key: "payment", label: "Payment" },
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

/**
 * Client onboarding only (for now).
 * We are the agency — whoever signs up is our client.
 * Path: details (+ optional website scrape) → marketing package → terms → payment.
 * Multi-agency / white-label SaaS signup is parked.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    checkout?: string;
    prefilled?: string;
    msg?: string;
    err?: string;
    payError?: string;
  }>;
}) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) redirect("/login");
  // Agency ops seats must not enter the client wizard (even if a prior bug
  // cleared onboardingCompletedAt). Use New Client / field sales instead.
  if (tenant.kind === "agency") redirect("/dashboard");
  if (tenant.onboardingCompletedAt) redirect("/dashboard");

  const params = await searchParams;
  const [terms, privacy] = await Promise.all([currentTerms(), currentPrivacy()]);
  const legalDocs = [terms, privacy].filter(
    (doc): doc is NonNullable<typeof doc> => Boolean(doc),
  );
  const detailsDone = !!(
    tenant.onboarding?.abn &&
    tenant.onboarding?.industry &&
    tenant.onboarding?.natureOfBusiness &&
    tenant.onboarding?.contactName &&
    tenant.onboarding?.contactEmail
  );
  const packageDone = !!tenant.onboarding?.marketingPackageId;
  const termsDone = (
    await Promise.all(
      legalDocs.map((doc) => hasAcceptedTerms(user.id, doc.version, doc.kind)),
    )
  ).every(Boolean);
  const mockCheckout = mockPackageCheckoutEnabled();

  const requested = params.step as Step | undefined;
  let step: Step = !detailsDone
    ? "details"
    : !packageDone
      ? "package"
      : !termsDone
        ? "terms"
        : "payment";

  if (requested === "details") step = "details";
  if (requested === "package" && detailsDone) step = "package";
  if (requested === "terms" && detailsDone && packageDone) step = "terms";
  if (
    requested === "payment" &&
    detailsDone &&
    packageDone &&
    termsDone
  ) {
    step = "payment";
  }
  // Parked agency SaaS path — never surface Workspace plan here.
  if (
    params.step === "who" ||
    params.step === "workspace" ||
    params.step === "plan"
  ) {
    step = !detailsDone
      ? "details"
      : !packageDone
        ? "package"
        : !termsDone
          ? "terms"
          : "payment";
  }

  const prefillBanner =
    params.prefilled === "1"
      ? "We prepared a staging preview from your website and public business listing. Check every detail before continuing."
      : params.prefilled === "partial"
        ? "Partial prefill — some public signals were thin. Review and complete any blank required fields."
        : params.prefilled === "0"
          ? "Website lookup did not return much. Fill the fields manually, or try another URL."
          : params.prefilled === "err"
            ? params.msg?.trim() ||
              "Could not prefill from that website. Check the URL and consent, then try again."
            : null;
  const prefillBannerTone =
    params.prefilled === "0" || params.prefilled === "err"
      ? ("warning" as const)
      : ("success" as const);

  const detailsFieldsKey = [
    params.prefilled ?? "",
    tenant.onboarding?.website ?? "",
    tenant.onboarding?.abn ?? "",
    tenant.onboarding?.industry ?? "",
    tenant.onboarding?.natureOfBusiness ?? "",
    tenant.onboarding?.contactPhone ?? "",
    tenant.onboarding?.notes ?? "",
  ].join("|");

  const packages = listActivePackagesForSignup(tenant).map((p) => ({
    id: p.id,
    name: p.name,
    priceAudMonthly: p.priceAudMonthly,
    blurb: p.blurb,
    channels: p.channels,
    postsPerMonth: p.postsPerMonth,
    campaignsPerMonth: p.campaignsPerMonth,
    campaignConceptsPerMonth: p.campaignConceptsPerMonth,
    searchVisibilityIncluded: p.searchVisibilityIncluded,
    promosIncludedPerMonth: p.promosIncludedPerMonth,
    adsManagementIncluded: p.adsManagementIncluded,
    imageQuotaPerMonth: p.imageQuotaPerMonth,
    videoQuotaPerMonth: p.videoQuotaPerMonth,
    defaultServiceLevel: p.defaultServiceLevel,
    customModuleRates: p.customModuleRates,
  }));

  const packageId = tenant.onboarding?.marketingPackageId;
  const catalogPkg = packageId
    ? resolvePackageById(tenant, packageId)
    : null;
  let paymentPackageName = catalogPkg?.name ?? "Marketing package";
  let paymentPrice = catalogPkg?.priceAudMonthly ?? 0;
  if (packageId === "custom" && catalogPkg && tenant.onboarding?.customModules) {
    const quote = quoteCustomPackagePrice(
      tenant.onboarding.customModules,
      catalogPkg.customModuleRates,
      catalogPkg.priceAudMonthly,
      tenant,
    );
    paymentPrice = quote.priceAudMonthly;
    paymentPackageName = `${catalogPkg.name} (custom)`;
  }
  paymentPrice += monthlyServiceOptionsAud(
    packageId ?? "starter",
    tenant.onboarding?.serviceOptions,
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Welcome to Marketing Command Centre</h1>
        <p className="text-sm text-muted-foreground">
          Let&apos;s set up <span className="font-medium">{tenant.name}</span>. This
          takes a minute.
        </p>
      </div>
      <Card>
        <CardContent className="p-6">
          <Stepper step={step} />

          {step === "details" && (
              <OnboardingDetailsFields
              key={`${detailsFieldsKey}|${params.err ?? ""}`}
              action={saveOnboardingDetailsAction}
              showWebsiteScrape
              prefillBanner={prefillBanner}
              prefillBannerTone={prefillBannerTone}
              serverError={params.err?.trim() || null}
              intro={
                <p className="text-sm text-muted-foreground">
                  Start with your business name, website and contact. We’ll prepare a
                  staging preview for you to edit before anything is activated.
                </p>
              }
              defaults={{
                businessName: tenant.onboarding?.companyName ?? tenant.name,
                abn: tenant.onboarding?.abn,
                industry: tenant.onboarding?.industry,
                natureOfBusiness: tenant.onboarding?.natureOfBusiness,
                contactName: tenant.onboarding?.contactName ?? user.name,
                contactEmail: tenant.onboarding?.contactEmail ?? user.email,
                contactPhone: tenant.onboarding?.contactPhone,
                notes: tenant.onboarding?.notes,
                website: tenant.onboarding?.website,
                scrapeConsent: !!tenant.onboarding?.scrapeConsentAt,
              }}
            />
          )}

          {step === "package" && (
            <div className="space-y-4">
              <OnboardingPackagePicker
                packages={packages}
                initialPackageId={currentPackageId(
                  tenant.onboarding?.marketingPackageId,
                )}
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

          {step === "terms" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Review and accept our terms, then continue to payment.
              </p>
              {tenant.onboarding?.marketingPackageId ? (
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
              {legalDocs.length > 0 ? (
                <>
                  {legalDocs.map((doc) => (
                    <div key={doc.id} className="rounded-md border border-border">
                      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                        <span className="font-medium">{doc.title}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          v{doc.version}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          effective {formatDate(doc.effectiveDate)}
                        </span>
                      </div>
                      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap bg-muted/30 p-4 text-sm text-muted-foreground">
                        {doc.body}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No terms are configured yet — you can continue to payment.
                </p>
              )}
              <div className="flex items-center justify-between">
                <a
                  href="/onboarding?step=package"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  ← Back
                </a>
                <form action={acceptOnboardingTermsAction}>
                  <Button type="submit">
                    {legalDocs.length
                      ? "Accept terms & privacy →"
                      : "Continue to payment →"}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {mockCheckout
                  ? "Enter local demo card details to finish setup (no live charge)."
                  : "Continue to Stripe Checkout to finish payment securely."}
              </p>
              <OnboardingPlanCheckout
                key={params.payError ?? "payment"}
                packageName={paymentPackageName}
                priceAudMonthly={paymentPrice}
                mockMode={mockCheckout}
                cancelled={params.checkout === "cancelled"}
                serverError={params.payError?.trim() || null}
                action={completeOnboardingPaymentAction}
              />
              <a
                href="/onboarding?step=terms"
                className="text-xs text-muted-foreground hover:underline"
              >
                ← Back to terms
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
