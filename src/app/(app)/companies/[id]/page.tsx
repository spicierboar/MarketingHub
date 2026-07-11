import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import {
  getCompany,
  listContent,
  listIntegrations,
  listRecommendations,
  getLocalProfile,
  usersForCompany,
} from "@/lib/db";
import { buildCompanyHealthScore } from "@/lib/health-scores";
import { HealthScoreCard } from "@/components/health-score-card";
import { activeAddonsForCompany } from "@/lib/entitlements";
import { ADDONS } from "@/lib/addons";
import { onboardingScore, SOCIAL_PLATFORMS } from "@/lib/types";
import {
  contentTemplatesFor,
  recommendedCampaignGoals,
  resolveBusinessType,
} from "@/lib/business-profiles";
import { BusinessTypeSection } from "../business-profile-fields";
import { LocalIntelPanel } from "../local-intel-panel";
import { RecommendationStrip } from "@/components/recommendation-cards";
import { AutoOnboardingPanel } from "@/components/auto-onboarding-panel";
import { PROFILE_FIELD_HELP } from "@/lib/profile-suggestions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import {
  addCompanyDocAction,
  saveManagedServiceLevelAction,
  saveOnboardingAction,
  setCompanyStatusAction,
} from "../actions";
import {
  markPromoOnCalendarAction,
  savePromoMarkupAction,
} from "./promo-actions";
import { DEFAULT_PROMO_MARKUP_PERCENT } from "@/lib/promo-catalog";
import { listOpenPromoSelections } from "@/lib/promo-requests";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";
import { defaultServiceLevel } from "@/lib/managed-service/authority";

export default async function CompanyOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ scraped?: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const { score, missing } = onboardingScore(company);
  const p = company.profile;
  const openPromos = listOpenPromoSelections(company);
  const markupPct = Math.round(
    (p.managedService?.promoMarkupPercent ?? DEFAULT_PROMO_MARKUP_PERCENT) * 100,
  );
  const businessType = resolveBusinessType(company);
  const defaultSocial = Object.fromEntries(
    (p.socialLinks ?? []).map((l) => [l.platform, l.url]),
  );
  const campaignGoals = recommendedCampaignGoals(company);
  const templates = contentTemplatesFor(company);
  const users = await usersForCompany(company.id);

  const setupFocus =
    company.status === "draft_onboarding" || company.status === "pending_review";

  const [integrations, allContent, activeAddons, recommendations, health, localProfile] =
    await Promise.all([
      listIntegrations(user.tenantId, company.id),
      listContent(user.tenantId),
      activeAddonsForCompany(user.tenantId, company.id),
      listRecommendations(user.tenantId, [company.id], "open"),
      buildCompanyHealthScore(user.tenantId, company),
      getLocalProfile(company.id),
    ]);
  const companyContent = allContent.filter((c) => c.companyId === company.id);
  const serviceLevelSet = !!p.managedService?.serviceLevel;
  const hasCampaign = companyContent.some((c) => !!c.campaignId);
  const steps: { label: string; done: boolean; href: string; cta: string }[] = [
    {
      label: "Complete the company profile",
      done: score === 100,
      href: `/companies/${company.id}`,
      cta: "Fill in the profile",
    },
    {
      label: "Set managed service level",
      done: serviceLevelSet,
      href: `/companies/${company.id}#service-level`,
      cta: "Choose level",
    },
    {
      label: "Add social profile links",
      done: (p.socialLinks?.length ?? 0) > 0,
      href: `/companies/${company.id}`,
      cta: "Add profiles",
    },
    {
      label: "Connect a social account (OAuth)",
      done: integrations.some((i) => i.status === "connected"),
      href: `/publishing?company=${company.id}`,
      cta: "Connect or send client link",
    },
    {
      label: "Mark the company AI-ready",
      done: company.status === "ai_ready" || company.status === "approved",
      href: `/companies/${company.id}`,
      cta: "Review status",
    },
    {
      label: "Plan the first campaign",
      done: hasCampaign,
      href: `/campaigns/new?company=${company.id}`,
      cta: "Build from goal",
    },
    {
      label: "Approve your first content",
      done: companyContent.some((c) =>
        ["approved", "scheduled", "published"].includes(c.status),
      ),
      href: `/studio?company=${company.id}`,
      cta: "Create content",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);
  const scrapedBanner = sp.scraped;

  // ── Setup: single calm column — scrape + essentials only ─────────────
  if (setupFocus) {
    return (
      <div>
        <PageHeader title={company.name} hideExplainer>
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-muted-foreground">{score}% ready</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${score === 100 ? "bg-emerald-500" : "bg-primary"}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        </PageHeader>

        <div className="mx-auto max-w-2xl space-y-8 p-6">
          {scrapedBanner === "1" && (
            <p className="text-sm text-emerald-800">
              Pre-filled from the website and AI enrichment — review below, then save.
            </p>
          )}
          {scrapedBanner === "0" && (
            <p className="text-sm text-amber-900">
              Couldn&apos;t extract enough from the site. Scrape again or fill manually.
            </p>
          )}

          {missing.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Still needed: {missing.slice(0, 4).join(", ")}
              {missing.length > 4 ? ` +${missing.length - 4} more` : ""}
            </p>
          )}

          <AutoOnboardingPanel
            companyId={company.id}
            companyName={company.name}
            defaultWebsite={p.website}
            defaultSocial={defaultSocial}
            compact
            lastScrape={{
              at: p.autoOnboarding?.lastScrapeAt,
              mode: p.autoOnboarding?.lastScrapeMode,
              appliedAt: p.autoOnboarding?.lastAppliedAt,
            }}
          />

          <form action={saveOnboardingAction} className="space-y-6">
            <input type="hidden" name="companyId" value={company.id} />

            <section className="space-y-5">
              <h2 className="text-base font-semibold tracking-tight">Profile</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Client name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={company.name} />
                </Field>
                <Field label="Industry" htmlFor="industry">
                  <Input
                    id="industry"
                    name="industry"
                    defaultValue={p.industry}
                    placeholder="e.g. Café"
                  />
                </Field>
                <Field label="Website" htmlFor="website">
                  <Input id="website" name="website" defaultValue={p.website} />
                </Field>
                <Field label="Approval contact" htmlFor="approvalContact">
                  <Input
                    id="approvalContact"
                    name="approvalContact"
                    defaultValue={p.approvalContact}
                    placeholder="Name or email"
                  />
                </Field>
                <Field label="Address" htmlFor="businessAddress">
                  <Input
                    id="businessAddress"
                    name="businessAddress"
                    defaultValue={p.businessAddress}
                    placeholder="Street, suburb"
                  />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <Input id="phone" name="phone" defaultValue={p.phone} />
                </Field>
                <Field label="Email" htmlFor="email">
                  <Input id="email" name="email" type="email" defaultValue={p.email} />
                </Field>
              </div>

              <Field label="Nature of business" htmlFor="natureOfBusiness">
                <Textarea
                  id="natureOfBusiness"
                  name="natureOfBusiness"
                  defaultValue={p.natureOfBusiness}
                  rows={3}
                  placeholder="What they do, for whom, and where."
                />
              </Field>

              <Field label="Local market notes" htmlFor="localMarketNotes">
                <Textarea
                  id="localMarketNotes"
                  name="localMarketNotes"
                  defaultValue={p.localMarketNotes}
                  rows={2}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Service areas" htmlFor="serviceAreas" hint="One per line">
                  <Textarea
                    id="serviceAreas"
                    name="serviceAreas"
                    defaultValue={p.serviceAreas.join("\n")}
                    rows={3}
                  />
                </Field>
                <Field label="Services" htmlFor="services" hint="One per line">
                  <Textarea
                    id="services"
                    name="services"
                    defaultValue={p.services.join("\n")}
                    rows={3}
                  />
                </Field>
              </div>

              <Field label="Target customers" htmlFor="targetCustomers">
                <Textarea
                  id="targetCustomers"
                  name="targetCustomers"
                  defaultValue={p.targetCustomers}
                  rows={2}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand voice" htmlFor="brandVoice">
                  <Textarea
                    id="brandVoice"
                    name="brandVoice"
                    defaultValue={p.brandVoice}
                    rows={2}
                  />
                </Field>
                <Field label="Calls to action" htmlFor="callsToAction" hint="One per line">
                  <Textarea
                    id="callsToAction"
                    name="callsToAction"
                    defaultValue={p.callsToAction.join("\n")}
                    rows={2}
                  />
                </Field>
              </div>
            </section>

            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  More details
                  <span className="text-xs font-normal group-open:hidden">
                    Legal, type, socials, compliance
                  </span>
                </span>
              </summary>
              <div className="space-y-5 border-t border-border px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Legal name" htmlFor="legalName">
                    <Input id="legalName" name="legalName" defaultValue={p.legalName} />
                  </Field>
                  <Field label="Trading names" htmlFor="tradingNames">
                    <Input
                      id="tradingNames"
                      name="tradingNames"
                      defaultValue={p.tradingNames}
                    />
                  </Field>
                </div>

                <BusinessTypeSection
                  initialType={businessType}
                  retail={p.retail}
                  hotel={p.hotel}
                  restaurant={p.restaurant}
                />

                <Field label="Current offers" htmlFor="currentOffers">
                  <Textarea
                    id="currentOffers"
                    name="currentOffers"
                    defaultValue={p.currentOffers}
                    rows={2}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Approved claims" htmlFor="approvedClaims">
                    <Textarea
                      id="approvedClaims"
                      name="approvedClaims"
                      defaultValue={p.approvedClaims.join("\n")}
                      rows={2}
                    />
                  </Field>
                  <Field label="Prohibited claims" htmlFor="prohibitedClaims">
                    <Textarea
                      id="prohibitedClaims"
                      name="prohibitedClaims"
                      defaultValue={p.prohibitedClaims.join("\n")}
                      rows={2}
                    />
                  </Field>
                </div>
                <Field label="Required disclaimers" htmlFor="requiredDisclaimers">
                  <Textarea
                    id="requiredDisclaimers"
                    name="requiredDisclaimers"
                    defaultValue={p.requiredDisclaimers.join("\n")}
                    rows={2}
                  />
                </Field>

                <div>
                  <p className="mb-3 text-sm font-medium">Social profiles</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {SOCIAL_PLATFORMS.map((s) => {
                      const current =
                        p.socialLinks?.find((l) => l.platform === s.key)?.url ?? "";
                      return (
                        <Field key={s.key} label={s.label} htmlFor={`social_${s.key}`}>
                          <Input
                            id={`social_${s.key}`}
                            name={`social_${s.key}`}
                            type="text"
                            inputMode="url"
                            placeholder={s.placeholder}
                            defaultValue={current}
                          />
                        </Field>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button type="submit">Save profile</Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            {company.status === "draft_onboarding" && (
              <form action={setCompanyStatusAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="status" value="pending_review" />
                <Button type="submit" variant="outline">
                  Submit for review
                </Button>
              </form>
            )}
            {score === 100 && (
              <form action={setCompanyStatusAction}>
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="status" value="ai_ready" />
                <Button type="submit">Mark AI-ready</Button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Full overview (approved / ai_ready / etc.) ───────────────────────
  return (
    <div>
      <PageHeader
        title={company.name}
        explainerId="client-overview"
        explainer="Onboarding, profile, and ops settings for this client."
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AutoOnboardingPanel
            companyId={company.id}
            companyName={company.name}
            defaultWebsite={p.website}
            defaultSocial={defaultSocial}
            lastScrape={{
              at: p.autoOnboarding?.lastScrapeAt,
              mode: p.autoOnboarding?.lastScrapeMode,
              appliedAt: p.autoOnboarding?.lastAppliedAt,
            }}
          />

          <form id="company-profile-form" action={saveOnboardingAction} className="space-y-6">
            <input type="hidden" name="companyId" value={company.id} />

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Client identity</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Client name" htmlFor="name">
                    <Input id="name" name="name" defaultValue={company.name} />
                  </Field>
                  <Field label="Legal name" htmlFor="legalName">
                    <Input id="legalName" name="legalName" defaultValue={p.legalName} />
                  </Field>
                  <Field label="Trading names" htmlFor="tradingNames">
                    <Input
                      id="tradingNames"
                      name="tradingNames"
                      defaultValue={p.tradingNames}
                    />
                  </Field>
                  <Field label="Industry" htmlFor="industry">
                    <Input id="industry" name="industry" defaultValue={p.industry} />
                  </Field>
                  <div className="sm:col-span-2">
                    <BusinessTypeSection
                      initialType={businessType}
                      retail={p.retail}
                      hotel={p.hotel}
                      restaurant={p.restaurant}
                    />
                  </div>
                  <Field label="Website" htmlFor="website">
                    <Input id="website" name="website" defaultValue={p.website} />
                  </Field>
                  <Field label="Approval contact" htmlFor="approvalContact">
                    <Input
                      id="approvalContact"
                      name="approvalContact"
                      defaultValue={p.approvalContact}
                    />
                  </Field>
                  <Field label="Address" htmlFor="businessAddress">
                    <Input
                      id="businessAddress"
                      name="businessAddress"
                      defaultValue={p.businessAddress}
                    />
                  </Field>
                  <Field label="Phone" htmlFor="phone">
                    <Input id="phone" name="phone" defaultValue={p.phone} />
                  </Field>
                  <Field label="Email" htmlFor="email">
                    <Input id="email" name="email" type="email" defaultValue={p.email} />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Business & market</h2>
                <Field
                  label="Nature of business"
                  htmlFor="natureOfBusiness"
                  hint={PROFILE_FIELD_HELP.natureOfBusiness}
                >
                  <Textarea
                    id="natureOfBusiness"
                    name="natureOfBusiness"
                    defaultValue={p.natureOfBusiness}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Service areas" htmlFor="serviceAreas">
                    <Textarea
                      id="serviceAreas"
                      name="serviceAreas"
                      defaultValue={p.serviceAreas.join("\n")}
                    />
                  </Field>
                  <Field label="Services" htmlFor="services">
                    <Textarea
                      id="services"
                      name="services"
                      defaultValue={p.services.join("\n")}
                    />
                  </Field>
                </div>
                <Field label="Target customers" htmlFor="targetCustomers">
                  <Textarea
                    id="targetCustomers"
                    name="targetCustomers"
                    defaultValue={p.targetCustomers}
                  />
                </Field>
                <Field label="Local market notes" htmlFor="localMarketNotes">
                  <Textarea
                    id="localMarketNotes"
                    name="localMarketNotes"
                    defaultValue={p.localMarketNotes}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Brand & compliance</h2>
                <Field label="Brand voice" htmlFor="brandVoice">
                  <Textarea id="brandVoice" name="brandVoice" defaultValue={p.brandVoice} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Calls to action" htmlFor="callsToAction">
                    <Textarea
                      id="callsToAction"
                      name="callsToAction"
                      defaultValue={p.callsToAction.join("\n")}
                    />
                  </Field>
                  <Field label="Current offers" htmlFor="currentOffers">
                    <Textarea
                      id="currentOffers"
                      name="currentOffers"
                      defaultValue={p.currentOffers}
                    />
                  </Field>
                  <Field label="Approved claims" htmlFor="approvedClaims">
                    <Textarea
                      id="approvedClaims"
                      name="approvedClaims"
                      defaultValue={p.approvedClaims.join("\n")}
                    />
                  </Field>
                  <Field label="Prohibited claims" htmlFor="prohibitedClaims">
                    <Textarea
                      id="prohibitedClaims"
                      name="prohibitedClaims"
                      defaultValue={p.prohibitedClaims.join("\n")}
                    />
                  </Field>
                </div>
                <Field label="Required disclaimers" htmlFor="requiredDisclaimers">
                  <Textarea
                    id="requiredDisclaimers"
                    name="requiredDisclaimers"
                    defaultValue={p.requiredDisclaimers.join("\n")}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Social profiles</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  {SOCIAL_PLATFORMS.map((s) => {
                    const current =
                      p.socialLinks?.find((l) => l.platform === s.key)?.url ?? "";
                    return (
                      <Field key={s.key} label={s.label} htmlFor={`social_${s.key}`}>
                        <Input
                          id={`social_${s.key}`}
                          name={`social_${s.key}`}
                          type="text"
                          inputMode="url"
                          placeholder={s.placeholder}
                          defaultValue={current}
                        />
                      </Field>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit">Save onboarding</Button>
            </div>
          </form>

          <LocalIntelPanel companyId={company.id} local={localProfile} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Onboarding</h2>
                <span className="text-lg font-bold">{score}%</span>
              </div>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${score === 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${score}%` }}
                />
              </div>
              {missing.length > 0 ? (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {missing.map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-emerald-700">Minimum fields complete.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Getting started</h2>
                <span className="text-sm text-muted-foreground">
                  {doneCount}/{steps.length}
                </span>
              </div>
              <ol className="space-y-2.5">
                {steps.map((s) => (
                  <li key={s.label} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        s.done
                          ? "bg-emerald-500 text-white"
                          : "border border-border text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className={s.done ? "text-muted-foreground line-through" : ""}>
                      {s.label}
                    </span>
                  </li>
                ))}
              </ol>
              {nextStep && (
                <Link
                  href={nextStep.href}
                  className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {nextStep.cta} →
                </Link>
              )}
            </CardContent>
          </Card>

          <Card id="service-level">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Managed service level</h2>
              <form action={saveManagedServiceLevelAction} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Service level" htmlFor="serviceLevel">
                  <Select
                    id="serviceLevel"
                    name="serviceLevel"
                    defaultValue={p.managedService?.serviceLevel ?? defaultServiceLevel()}
                  >
                    <option value="approval">Approval</option>
                    <option value="managed_exceptions">Managed exceptions</option>
                    <option value="fully_managed">Fully managed</option>
                  </Select>
                </Field>
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Save service level
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold">Promo catalog</h2>
                <Link href="/promo-catalog" className="text-sm text-primary hover:underline">
                  Manage →
                </Link>
              </div>
              <form action={savePromoMarkupAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Markup %" htmlFor="promoMarkupPercent">
                  <Input
                    id="promoMarkupPercent"
                    name="promoMarkupPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={markupPct}
                    className="w-24"
                  />
                </Field>
                <Button type="submit" variant="outline" size="sm">
                  Save
                </Button>
              </form>
              {openPromos.length > 0 && (
                <ul className="space-y-3">
                  {openPromos.map((s) => (
                    <li key={s.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{s.templateName}</span>
                        <Badge tone={s.status === "requested" ? "warning" : "success"}>
                          {s.status === "requested"
                            ? "Not on calendar"
                            : s.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(s.startDate)} → {formatDate(s.endDate)} ·{" "}
                        {formatMoney(s.budgetUsd)} + {formatMoney(s.feeUsd)} fee
                      </p>
                      {s.status === "requested" && (
                        <form action={markPromoOnCalendarAction} className="mt-2">
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="selectionId" value={s.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Mark on calendar
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Campaign goals</h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {campaignGoals.map((g) => (
                  <li key={g}>• {g}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Content templates</h2>
              <ul className="space-y-3 text-sm">
                {templates.map((t) => (
                  <li key={t.id}>
                    <p className="font-medium">{t.label}</p>
                    <p className="text-muted-foreground">
                      {t.channel} — {t.brief}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Add-ons</h2>
                <Link href="/billing" className="text-xs text-primary hover:underline">
                  Manage
                </Link>
              </div>
              {activeAddons.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {activeAddons.map((addonId) => (
                    <li key={addonId} className="flex items-center gap-2">
                      <span aria-hidden>{ADDONS[addonId].icon}</span>
                      <span>{ADDONS[addonId].name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No add-ons enabled.</p>
              )}
            </CardContent>
          </Card>

          <HealthScoreCard health={health} />

          {(company.status === "ai_ready" || company.status === "approved") &&
            recommendations.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <RecommendationStrip recs={recommendations} companyId={company.id} />
                </CardContent>
              </Card>
            )}

          <Card>
            <CardContent className="space-y-2 p-6">
              <h2 className="mb-1 font-semibold">Status</h2>
              {[
                ["pending_review", "Submit for review", "outline"],
                ["approved", "Approve profile", "outline"],
                ["ai_ready", "Mark AI-ready", "default"],
                ["archived", "Archive", "ghost"],
              ].map(([status, label, variant]) => (
                <form key={status} action={setCompanyStatusAction}>
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="status" value={status} />
                  <Button
                    type="submit"
                    variant={variant as "default" | "outline" | "ghost"}
                    size="sm"
                    className="w-full"
                    disabled={company.status === status}
                  >
                    {label}
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Source documents</h2>
              {company.documents.length > 0 ? (
                <ul className="mb-3 space-y-1 text-sm">
                  {company.documents.map((d) => (
                    <li key={d.id} className="truncate text-muted-foreground">
                      {d.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-sm text-muted-foreground">No documents yet.</p>
              )}
              <form action={addCompanyDocAction} className="space-y-2">
                <input type="hidden" name="companyId" value={company.id} />
                <Input name="files" type="file" multiple />
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Upload document
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Assigned users</h2>
                <Link href="/users" className="text-sm text-primary hover:underline">
                  Manage
                </Link>
              </div>
              {users.length > 0 ? (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {users.map((u) => (
                    <li key={u.id}>{u.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No users assigned.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
