import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSalesRepOrAdmin } from "@/lib/auth/rbac";
import { getCompany, getTenant } from "@/lib/db";
import {
  mockPackageCheckoutEnabled,
  stripeConfigured,
} from "@/lib/billing";
import {
  listActivePackagesForSignup,
  resolvePackageById,
} from "@/lib/marketing-packages";
import type { MarketingPackageId } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { NewClientProfileFields } from "@/components/new-client-profile-fields";
import { NewClientWebsiteStep } from "@/components/new-client-website-step";
import { NewClientCheckoutStep } from "@/components/new-client-checkout-step";
import { FormSeedButton } from "@/components/form-seed-button";
import { OnboardingPackagePicker } from "@/components/onboarding-package-picker";
import {
  confirmPackageCheckoutSuccessAction,
  provisionClientAction,
  saveBusinessStepAction,
  savePackageStepAction,
  skipCheckoutAction,
  skipPackageAction,
  startPackageCheckoutAction,
} from "../actions";
import { wizardPath } from "../wizard-path";

type Step = "website" | "business" | "package" | "checkout" | "provision" | "done";

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "website", label: "Website" },
    { key: "business", label: "Profile" },
    { key: "package", label: "Package" },
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
          <span className={i === idx ? "font-medium" : "text-muted-foreground"}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
    >
      ← {label}
    </Link>
  );
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    companyId?: string;
    clientEmail?: string;
    scraped?: string;
    checkout?: string;
    session_id?: string;
    paid?: string;
    error?: string;
    profileSaved?: string;
  }>;
}) {
  const user = await requireSalesRepOrAdmin();
  const params = await searchParams;
  const companyId = params.companyId?.trim();
  const profileError = params.error ? decodeURIComponent(params.error) : null;
  const profileSaved = params.profileSaved === "1";
  let step: Step = "website";
  if (params.step === "business" && companyId) step = "business";
  else if (params.step === "package" && companyId) step = "package";
  else if (params.step === "checkout" && companyId) step = "checkout";
  // Legacy add-ons step removed — AI video/photo live under Content → AI Visuals.
  else if (params.step === "addons" && companyId) {
    redirect(wizardPath("checkout", companyId));
  } else if (params.step === "provision" && companyId) step = "provision";
  else if (params.step === "done" && companyId) step = "done";
  else if (params.step === "website") step = "website";

  const company = companyId ? await getCompany(companyId) : null;
  if (companyId && !company) redirect("/sales/new-client");
  if (company && company.tenantId !== user.tenantId) redirect("/sales/new-client");

  // Stripe return: verify Checkout Session server-side, then continue.
  if (
    step === "checkout" &&
    company &&
    params.checkout === "success"
  ) {
    await confirmPackageCheckoutSuccessAction(
      company.id,
      params.session_id,
    );
  }

  const tenant = await getTenant(user.tenantId);
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

  const packageId = (company?.profile.managedService?.marketingPackageId ??
    "growth") as MarketingPackageId;
  const selectedPkg = resolvePackageById(tenant, packageId);
  const mockCheckout = mockPackageCheckoutEnabled();

  return (
    <div>
      <PageHeader
        title="New client"
        description="Website scrape → profile → marketing package → checkout → client portal login."
      />
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6">
            <Stepper step={step} />

            {step === "website" && (
              <>
                {profileError && (
                  <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {profileError}
                  </p>
                )}
                <NewClientWebsiteStep
                  companyId={company?.id}
                  initialName={company?.name}
                  initialAbn={company?.profile.abn}
                  initialPostcode={company?.profile.structuredAddress?.postcode}
                  initialWebsite={company?.profile.website}
                  consentDefault={!!company?.profile.autoOnboarding?.consentRecordedAt}
                />
              </>
            )}

            {step === "business" && company && (
              <form
                id="new-client-business-form"
                action={saveBusinessStepAction}
                className="space-y-4"
              >
                <input type="hidden" name="companyId" value={company.id} />
                {profileError && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {profileError}
                  </p>
                )}
                {params.scraped === "1" && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Pre-filled from the website and AI enrichment — review below,
                    then continue.
                  </p>
                )}
                {params.scraped === "0" && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    Scrape found little or failed — fill the profile manually, or go
                    back to correct the website.
                  </p>
                )}
                <NewClientProfileFields
                  formId="new-client-business-form"
                  initialName={company.name}
                  profile={company.profile}
                />
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <BackLink
                    href={wizardPath("website", company.id)}
                    label="Back to website"
                  />
                  <Button type="submit">Continue to package</Button>
                </div>
              </form>
            )}

            {step === "package" && company && (
              <div className="space-y-4">
                {profileSaved && (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    Profile saved — choose a marketing package next.
                  </p>
                )}
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground space-y-1.5">
                  <p>
                    <span className="font-medium text-foreground">Marketing package</span>{" "}
                    (Basic / Pro / Blast / Custom) is what we deliver for this{" "}
                    <span className="font-medium text-foreground">client company</span>.
                    Your agency <span className="font-medium text-foreground">Workspace plan</span>{" "}
                    (how many clients you can manage) is separate — Agency Settings → Billing.
                  </p>
                  <p>
                    Next step collects package payment
                    {stripeConfigured() && !mockPackageCheckoutEnabled()
                      ? " via Stripe Checkout when package prices are configured"
                      : " with a full demo checkout experience"}
                    . Extra video/photo capacity is managed later under{" "}
                    <span className="font-medium text-foreground">AI Visuals</span>.
                  </p>
                </div>
                <OnboardingPackagePicker
                  packages={packages}
                  initialPackageId={packageId}
                  initialCustomModules={company.profile.managedService?.customModules}
                  action={savePackageStepAction}
                  description="Select the marketing package for this client. Ad spend is always extra and prepaid."
                  hiddenFields={{ companyId: company.id }}
                />
                <div className="flex flex-wrap items-center gap-4">
                  <BackLink
                    href={wizardPath("business", company.id)}
                    label="Back to profile"
                  />
                  <form action={skipPackageAction}>
                    <input type="hidden" name="companyId" value={company.id} />
                    <Button type="submit" variant="secondary">
                      Skip for now
                    </Button>
                  </form>
                </div>
              </div>
            )}

            {step === "checkout" && company && (
              <div className="space-y-4">
                <NewClientCheckoutStep
                  companyId={company.id}
                  companyName={company.name}
                  packageName={selectedPkg.name}
                  priceAudMonthly={selectedPkg.priceAudMonthly}
                  mockMode={mockCheckout}
                  cancelled={params.checkout === "cancelled"}
                  action={startPackageCheckoutAction}
                  skipAction={skipCheckoutAction}
                />
                <BackLink
                  href={wizardPath("package", company.id)}
                  label="Back to package"
                />
              </div>
            )}

            {step === "provision" && company && (
              <form
                id="new-client-provision-form"
                action={provisionClientAction}
                className="space-y-4"
              >
                <input type="hidden" name="companyId" value={company.id} />
                {params.paid && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Package checkout recorded
                    {params.paid === "demo" ? " (demo payment)" : ""}. Create the
                    client portal login next.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Creates the client&apos;s portal login. They sign in with a magic link —
                  no password.
                </p>
                <FormSeedButton
                  formId="new-client-provision-form"
                  hint={
                    <>
                      Seeds empty contact fields from this client — replace with the real
                      portal user before creating the login.
                    </>
                  }
                  values={{
                    name:
                      company.profile.approvalContact?.split("@")[0]
                        ?.replace(/[._]/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase()) ||
                      `${company.name} Owner`,
                    email:
                      company.profile.email?.trim() ||
                      company.profile.approvalContact?.trim() ||
                      `owner@${(company.profile.website ?? "example.com")
                        .replace(/^https?:\/\//, "")
                        .replace(/\/.*$/, "")
                        .replace(/^www\./, "") || "example.com"}`,
                  }}
                />
                <Field
                  label="Client contact name"
                  htmlFor="name"
                  hint="The person who will sign into the portal"
                >
                  <Input id="name" name="name" required placeholder="e.g. Sam Chen" />
                </Field>
                <Field
                  label="Client email"
                  htmlFor="email"
                  hint="Where the magic-link invite is sent (or used at /login in demo)."
                >
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="e.g. sam@example.com.au"
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-4">
                  <BackLink
                    href={wizardPath("checkout", company.id)}
                    label="Back to checkout"
                  />
                  <Button type="submit">Create login</Button>
                </div>
              </form>
            )}

            {step === "done" && company && (
              <div className="space-y-4 text-center">
                <h2 className="text-lg font-semibold">{company.name} is ready</h2>
                {params.clientEmail && (
                  <p className="text-sm text-muted-foreground">
                    {params.clientEmail} — magic link at /login.
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href={`/companies/${company.id}`}>
                    <Button variant="secondary">View company</Button>
                  </Link>
                  <Link href="/sales/new-client">
                    <Button>Add another</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
