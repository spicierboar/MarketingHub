import { redirect } from "next/navigation";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import { currentTerms, getTenant, hasAcceptedTerms } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { listActivePackagesForSignup } from "@/lib/marketing-packages";
import { OnboardingPackagePicker } from "@/components/onboarding-package-picker";
import { OnboardingDetailsFields } from "@/components/onboarding-details-fields";
import {
  completeOnboardingAction,
  saveOnboardingDetailsAction,
  selectOnboardingPackageAction,
} from "./actions";

type Step = "details" | "package" | "terms";

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
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

/**
 * Client onboarding only (for now).
 * We are the agency — whoever signs up is our client.
 * Path: details (+ optional website scrape) → marketing package → terms.
 * Multi-agency / white-label SaaS signup is parked.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; checkout?: string }>;
}) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) redirect("/login");
  if (tenant.onboardingCompletedAt) redirect("/dashboard");

  const params = await searchParams;
  const detailsDone = !!(
    tenant.onboarding?.abn &&
    tenant.onboarding?.industry &&
    tenant.onboarding?.natureOfBusiness &&
    tenant.onboarding?.contactName &&
    tenant.onboarding?.contactEmail
  );
  const packageDone = !!tenant.onboarding?.marketingPackageId;

  const requested = params.step as Step | undefined;
  let step: Step = !detailsDone
    ? "details"
    : !packageDone
      ? "package"
      : "terms";

  if (requested === "details") step = "details";
  if (requested === "package" && detailsDone) step = "package";
  if (requested === "terms" && detailsDone && packageDone) step = "terms";
  // Legacy agency bookmarks → client package path.
  if (
    params.step === "who" ||
    params.step === "workspace" ||
    params.step === "payment" ||
    params.step === "plan"
  ) {
    step = !detailsDone ? "details" : !packageDone ? "package" : "terms";
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
          <Stepper step={step} />

          {step === "details" && (
            <form action={saveOnboardingDetailsAction} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tell us about your business. Add a website (optional) so we can
                pre-fill your profile from public pages.
              </p>
              <OnboardingDetailsFields
                showWebsiteScrape
                defaults={{
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
              <Button type="submit">Continue →</Button>
            </form>
          )}

          {step === "package" && (
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

          {step === "terms" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Finally, please review and accept our terms to finish setting up.
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
                  href="/onboarding?step=package"
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
