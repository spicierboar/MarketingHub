import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import {
  getCompany,
  getTenant,
  listContent,
  listIntegrations,
  listRecommendations,
  listScheduledPosts,
  getLocalProfile,
  usersForCompany,
} from "@/lib/db";
import { buildCompanyHealthScore } from "@/lib/health-scores";
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
import { PROFILE_FIELD_HELP, PROFILE_FIELD_PLACEHOLDERS } from "@/lib/profile-suggestions";
import { ProfileSuggestButton } from "@/components/profile-suggest-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import {
  addCompanyDocAction,
  saveManagedServiceLevelAction,
  saveMarketingPackageAction,
  saveOnboardingAction,
  setCompanyStatusAction,
} from "../actions";
import { CompanyMarketingPackageForm } from "@/components/company-marketing-package-form";
import { resolveMarketingPackages } from "@/lib/marketing-packages";
import { currentPackageId } from "@/lib/managed-service-billing";
import {
  markPromoOnCalendarAction,
  savePromoMarkupAction,
} from "./promo-actions";
import { DEFAULT_PROMO_MARKUP_PERCENT } from "@/lib/promo-catalog";
import { listOpenPromoSelections } from "@/lib/promo-requests";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney, now } from "@/lib/utils";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import { listOpenOpportunitiesForTenant } from "@/lib/ai-mos";
import { addDaysIso } from "@/lib/calendar-utils";
import { agencyCompanyActivityHubs } from "@/lib/client-activity-hubs";
import { ActivityHubsGrid } from "@/components/activity-hubs-grid";
import { ensureAndKickManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { localDemoEnabled } from "@/lib/env";

export default async function CompanyOnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ scraped?: string; package?: string; saved?: string; error?: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  let company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  // One-time ensure: Assigned package (or default Basic) with no delivery run → enqueue.
  // Demo also advances generation so Overview strategy card is not stuck idle.
  try {
    await ensureAndKickManagedDeliveryForCompany({
      actor: user,
      tenantId: user.tenantId,
      companyId: company.id,
      reason: "manual",
      process: localDemoEnabled(),
      demoForceGenerate: false,
    });
    company = (await getCompany(id)) ?? company;
  } catch {
    /* soft */
  }

  const tenant = await getTenant(user.tenantId);
  const marketingPackages = resolveMarketingPackages(tenant);

  const { score, missing } = onboardingScore(company);
  const p = company.profile;
  const openPromos = listOpenPromoSelections(company);
  const markupPct = Math.round(
    (p.managedService?.promoMarkupPercent ?? DEFAULT_PROMO_MARKUP_PERCENT) * 100,
  );
  const businessType = resolveBusinessType(company);
  const ph =
    PROFILE_FIELD_PLACEHOLDERS[businessType] ?? PROFILE_FIELD_PLACEHOLDERS.other;
  const defaultSocial = Object.fromEntries(
    (p.socialLinks ?? []).map((l) => [l.platform, l.url]),
  );
  const campaignGoals = recommendedCampaignGoals(company);
  const templates = contentTemplatesFor(company);
  const users = await usersForCompany(company.id);

  const setupFocus =
    company.status === "draft_onboarding" || company.status === "pending_review";

  const [integrations, allContent, activeAddons, recommendations, health, localProfile, scheduledPosts, openAiMos] =
    await Promise.all([
      listIntegrations(user.tenantId, company.id),
      listContent(user.tenantId),
      activeAddonsForCompany(user.tenantId, company.id),
      listRecommendations(user.tenantId, [company.id], "open"),
      buildCompanyHealthScore(user.tenantId, company),
      getLocalProfile(company.id),
      listScheduledPosts(user.tenantId),
      listOpenOpportunitiesForTenant(user.tenantId, [company.id], 5),
    ]);
  const companyContent = allContent.filter((c) => c.companyId === company.id);
  const today = now().slice(0, 10);
  const weekEnd = addDaysIso(today, 7);
  const nextPosts = scheduledPosts
    .filter(
      (p) =>
        p.companyId === company.id &&
        (p.status === "scheduled" || p.status === "publishing") &&
        p.scheduledDate >= today &&
        p.scheduledDate <= weekEnd,
    )
    .sort((a, b) =>
      a.scheduledDate === b.scheduledDate
        ? (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? "")
        : a.scheduledDate.localeCompare(b.scheduledDate),
    )
    .slice(0, 5);
  const qualityHolds = companyContent.filter(
    (c) =>
      c.qualityRouting?.decision === "hold_agency" &&
      ["pending_approval", "ai_draft", "user_edited"].includes(c.status) &&
      c.clientReview?.status !== "pending",
  );
  const pendingApprovals = companyContent.filter((c) => c.status === "pending_approval");
  const failedPosts = scheduledPosts.filter(
    (p) => p.companyId === company.id && p.status === "failed",
  );
  const serviceLevelSet = !!p.managedService?.serviceLevel;
  const hasCampaign = companyContent.some((c) => !!c.campaignId);
  const steps: { label: string; done: boolean; href: string; cta: string }[] = [
    {
      label: "Finish company profile",
      done: score === 100,
      href: `/companies/${company.id}#setup-enrichment`,
      cta: "Open setup",
    },
    {
      label: "Set service level",
      done: serviceLevelSet,
      href: `/companies/${company.id}#package-service`,
      cta: "Choose level",
    },
    {
      label: "Add social profile URLs",
      done: (p.socialLinks?.length ?? 0) > 0,
      href: `/companies/${company.id}#social-profiles`,
      cta: "Edit socials",
    },
    {
      label: "Connect publishing (OAuth)",
      done: integrations.some((i) => i.status === "connected"),
      href: `/publishing?company=${company.id}`,
      cta: "Connect or send client link",
    },
    {
      label: "Mark AI-ready",
      done: company.status === "ai_ready" || company.status === "approved",
      href: `/companies/${company.id}#package-service`,
      cta: "Update status",
    },
    {
      label: "Plan first campaign",
      done: hasCampaign,
      href: `/campaigns/new?company=${company.id}`,
      cta: "Build from goal",
    },
    {
      label: "Get first content approved",
      done: companyContent.some((c) =>
        ["approved", "scheduled", "published"].includes(c.status),
      ),
      href: `/studio?company=${company.id}`,
      cta: "Open Studio",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const incompleteSteps = steps.filter((s) => !s.done);

  // Ops exceptions first, then setup/delivery gaps — max 3 for the desk.
  const nextActions: { label: string; href: string; cta: string; tone?: "warn" | "danger" }[] =
    [];
  if (failedPosts.length > 0) {
    nextActions.push({
      label: `Fix ${failedPosts.length} failed publish${failedPosts.length === 1 ? "" : "es"}`,
      href: `/publishing?company=${company.id}`,
      cta: "Publishing",
      tone: "danger",
    });
  }
  if (qualityHolds.length > 0) {
    nextActions.push({
      label: `Review ${qualityHolds.length} item${qualityHolds.length === 1 ? "" : "s"} on hold`,
      href: `/content/${qualityHolds[0].id}`,
      cta: "Open",
      tone: "warn",
    });
  }
  if (pendingApprovals.length > 0) {
    nextActions.push({
      label: `Clear ${pendingApprovals.length} pending approval${pendingApprovals.length === 1 ? "" : "s"}`,
      href: `/approvals?company=${company.id}`,
      cta: "Approvals",
      tone: "warn",
    });
  }
  for (const step of incompleteSteps) {
    if (nextActions.length >= 3) break;
    if (nextActions.some((a) => a.href === step.href && a.label === step.label)) continue;
    nextActions.push({ label: step.label, href: step.href, cta: step.cta });
  }

  const profileMostlyComplete = score >= 80;
  const setupCollapsedByDefault =
    profileMostlyComplete ||
    !!p.autoOnboarding?.lastAppliedAt ||
    company.status === "ai_ready" ||
    company.status === "approved";

  const scrapedBanner = sp.scraped;
  const packageUpdated = sp.package === "updated";
  const profileSaved = sp.saved === "1";
  const profileError = sp.error ? decodeURIComponent(sp.error) : null;
  const packageId = currentPackageId(p.managedService?.marketingPackageId);
  const packageExplicitlyAssigned = Boolean(p.managedService?.marketingPackageId);
  const serviceLevel = p.managedService?.serviceLevel ?? defaultServiceLevel();
  const serviceLevelLabel =
    serviceLevel === "fully_managed"
      ? "Fully managed"
      : serviceLevel === "managed_exceptions"
        ? "Managed exceptions"
        : "Approval";

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
          {profileSaved && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Profile saved.
            </p>
          )}
          {profileError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {profileError}
            </p>
          )}
          {packageUpdated && (
            <p className="text-sm text-emerald-800">
              Package updated — billing adjustment pending / recorded. Strategy refresh
              queued (eligible immediately; due within 12h).
            </p>
          )}
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

          <section id="package-service" className="space-y-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Marketing package
              </h2>
              <p className="text-sm text-muted-foreground">
                {serviceLevelLabel} · ads media always extra. Assign before strategy
                can run.
              </p>
            </div>
            <CompanyMarketingPackageForm
              companyId={company.id}
              packageId={packageId}
              assigned={packageExplicitlyAssigned}
              customModules={p.managedService?.customModules}
              serviceOptions={p.managedService?.serviceOptions}
              options={marketingPackages.map((pkg) => ({
                id: pkg.id,
                name: pkg.name,
                priceAudMonthly: pkg.priceAudMonthly,
                active: pkg.active,
                customModuleRates: pkg.customModuleRates,
              }))}
              action={saveMarketingPackageAction}
            />
            <form action={saveManagedServiceLevelAction} className="space-y-2">
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Service level" htmlFor="serviceLevel">
                <Select
                  id="serviceLevel"
                  name="serviceLevel"
                  defaultValue={serviceLevel}
                >
                  <option value="approval">Approval</option>
                  <option value="managed_exceptions">Managed exceptions</option>
                  <option value="fully_managed">Fully managed</option>
                </Select>
              </Field>
              <Button type="submit" variant="outline" size="sm">
                Save service level
              </Button>
            </form>
          </section>

          <ActivityHubsGrid
            hubs={agencyCompanyActivityHubs(company.id)}
            title="Client account hubs"
            subtitle="Same hubs as a live client — Marketing package is above."
          />

          <AutoOnboardingPanel
            companyId={company.id}
            companyName={company.name}
            defaultWebsite={p.website}
            defaultSocial={defaultSocial}
            compact
            socialsEditHref="#social-profiles"
            lastScrape={{
              at: p.autoOnboarding?.lastScrapeAt,
              mode: p.autoOnboarding?.lastScrapeMode,
              appliedAt: p.autoOnboarding?.lastAppliedAt,
            }}
          />

          <form id="company-profile-form" action={saveOnboardingAction} className="space-y-6">
            <input type="hidden" name="companyId" value={company.id} />

            <section className="space-y-5">
              <h2 className="text-base font-semibold tracking-tight">Profile</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Business name"
                  htmlFor="name"
                  hint="Trading name clients recognise — identity key with ABN"
                >
                  <Input
                    id="name"
                    name="name"
                    defaultValue={company.name}
                    placeholder="e.g. Harbourview Café"
                  />
                </Field>
                <Field
                  label="ABN"
                  htmlFor="abn"
                  hint="With business name, identifies this account. Same ABN + different name = separate client."
                >
                  <Input
                    id="abn"
                    name="abn"
                    defaultValue={p.abn}
                    inputMode="numeric"
                    placeholder="e.g. 51 824 753 556"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Industry"
                  htmlFor="industry"
                  hint="Free-text label for copy — business type is set separately below"
                >
                  <Input
                    id="industry"
                    name="industry"
                    defaultValue={p.industry}
                    placeholder="e.g. Café · Bondi"
                  />
                </Field>
                <Field label="Website" htmlFor="website">
                  <Input
                    id="website"
                    name="website"
                    defaultValue={p.website}
                    placeholder="https://www.harbourviewcafe.com.au"
                  />
                </Field>
                <Field
                  label="Approval contact"
                  htmlFor="approvalContact"
                  hint="Who signs off drafts for this client"
                >
                  <Input
                    id="approvalContact"
                    name="approvalContact"
                    defaultValue={p.approvalContact}
                    placeholder="owner@harbourviewcafe.com.au"
                  />
                </Field>
                <Field label="Address" htmlFor="businessAddress">
                  <Input
                    id="businessAddress"
                    name="businessAddress"
                    defaultValue={p.businessAddress}
                    placeholder="12 Campbell Pde, Bondi Beach NSW 2026"
                  />
                </Field>
                <Field label="Phone" htmlFor="phone">
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={p.phone}
                    placeholder="02 9000 0000"
                  />
                </Field>
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={p.email}
                    placeholder="hello@harbourviewcafe.com.au"
                  />
                </Field>
              </div>

              <BusinessTypeSection
                initialType={businessType}
                retail={p.retail}
                hotel={p.hotel}
                restaurant={p.restaurant}
              />

              <ProfileSuggestButton
                formId="company-profile-form"
                companyName={company.name}
                industry={p.industry}
              />

              <Field label="Nature of business" htmlFor="natureOfBusiness">
                <Textarea
                  id="natureOfBusiness"
                  name="natureOfBusiness"
                  defaultValue={p.natureOfBusiness}
                  rows={3}
                  placeholder="What they do, for whom, and where."
                />
              </Field>

              <Field
                label="Local market notes"
                htmlFor="localMarketNotes"
                hint="Suburbs, seasons, competitors — optional if service areas are filled"
              >
                <Textarea
                  id="localMarketNotes"
                  name="localMarketNotes"
                  defaultValue={p.localMarketNotes}
                  rows={2}
                  placeholder="e.g. Strong weekday office trade; quiet Sundays; compete with beach kiosks"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Service areas" htmlFor="serviceAreas" hint="One per line">
                  <Textarea
                    id="serviceAreas"
                    name="serviceAreas"
                    defaultValue={p.serviceAreas.join("\n")}
                    rows={3}
                    placeholder={"Bondi\nNorth Bondi\nTamarama"}
                  />
                </Field>
                <Field label="Services" htmlFor="services" hint="One per line">
                  <Textarea
                    id="services"
                    name="services"
                    defaultValue={p.services.join("\n")}
                    rows={3}
                    placeholder={"Breakfast\nLunch\nTakeaway coffee"}
                  />
                </Field>
              </div>

              <Field label="Target customers" htmlFor="targetCustomers">
                <Textarea
                  id="targetCustomers"
                  name="targetCustomers"
                  defaultValue={p.targetCustomers}
                  rows={2}
                  placeholder="e.g. Local families and weekday office workers within 10 minutes"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand voice" htmlFor="brandVoice">
                  <Textarea
                    id="brandVoice"
                    name="brandVoice"
                    defaultValue={p.brandVoice}
                    rows={2}
                    placeholder="e.g. Warm and neighbourly — never pushy or full of jargon"
                  />
                </Field>
                <Field label="Calls to action" htmlFor="callsToAction" hint="One per line">
                  <Textarea
                    id="callsToAction"
                    name="callsToAction"
                    defaultValue={p.callsToAction.join("\n")}
                    rows={2}
                    placeholder={"Book a table\nOrder online"}
                  />
                </Field>
              </div>
            </section>

            <details className="group rounded-lg border border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  More details
                  <span className="text-xs font-normal group-open:hidden">
                    Legal, socials, compliance
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

                <Field label="Current offers" htmlFor="currentOffers">
                  <Textarea
                    id="currentOffers"
                    name="currentOffers"
                    defaultValue={p.currentOffers}
                    rows={2}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Approved claims"
                    htmlFor="approvedClaims"
                    hint={PROFILE_FIELD_HELP.approvedClaims}
                  >
                    <Textarea
                      id="approvedClaims"
                      name="approvedClaims"
                      defaultValue={p.approvedClaims.join("\n")}
                      rows={3}
                      placeholder={ph.approvedClaims}
                    />
                  </Field>
                  <Field
                    label="Prohibited claims"
                    htmlFor="prohibitedClaims"
                    hint={PROFILE_FIELD_HELP.prohibitedClaims}
                  >
                    <Textarea
                      id="prohibitedClaims"
                      name="prohibitedClaims"
                      defaultValue={p.prohibitedClaims.join("\n")}
                      rows={3}
                      placeholder={ph.prohibitedClaims}
                    />
                  </Field>
                </div>
                <Field
                  label="Required disclaimers"
                  htmlFor="requiredDisclaimers"
                  hint={PROFILE_FIELD_HELP.requiredDisclaimers}
                >
                  <Textarea
                    id="requiredDisclaimers"
                    name="requiredDisclaimers"
                    defaultValue={p.requiredDisclaimers.join("\n")}
                    rows={3}
                    placeholder={ph.requiredDisclaimers}
                  />
                </Field>

                <div id="social-profiles">
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
        explainer="Next for this client — exceptions, posts, and health. Setup stays collapsed once ready."
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {profileSaved && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Profile saved.
            </p>
          )}
          {profileError && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {profileError}
            </p>
          )}
          {packageUpdated && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Package updated — billing adjustment pending / recorded. Strategy refresh
              queued (eligible immediately; due within 12h).
            </p>
          )}

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">Marketing strategy</p>
                <p className="text-xs text-muted-foreground">
                  {p.managedService?.detailedStrategy || p.managedService?.strategySummary
                    ? "Full strategy ready — objectives, personas, channels, and roadmap."
                    : p.managedService?.strategyEligibleAt ||
                        p.managedService?.lastDeliveryRunId
                      ? "Delivery run queued — opens under Strategy when eligible (demo: open Strategy to generate now)."
                      : packageExplicitlyAssigned
                        ? "Package assigned — preparing strategy delivery. Open Strategy to generate if needed."
                        : "Waiting for package — assign one below, or open Strategy to default Basic and enqueue."}
                </p>
              </div>
              <Link
                href={`/companies/${company.id}/strategy`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open strategy →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <ActivityHubsGrid
                hubs={agencyCompanyActivityHubs(company.id)}
                title="Client account hubs"
                subtitle="Everything for this client — same surfaces as the chip row, listed here so work stays under the account."
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Ops board</h2>
                  <p className="text-xs text-muted-foreground">
                    Exceptions and delivery for the next 7 days.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    tone={
                      health.score < 60 ? "danger" : health.score < 80 ? "warning" : "success"
                    }
                  >
                    Health {Math.round(health.score)}
                  </Badge>
                  {qualityHolds.length > 0 && (
                    <Badge tone="warning">Needs attention {qualityHolds.length}</Badge>
                  )}
                  {pendingApprovals.length > 0 && (
                    <Badge tone="info">Approvals {pendingApprovals.length}</Badge>
                  )}
                  {failedPosts.length > 0 && (
                    <Badge tone="danger">Failed publish {failedPosts.length}</Badge>
                  )}
                  {openAiMos.length > 0 && (
                    <Badge tone="info">AI signals {openAiMos.length}</Badge>
                  )}
                </div>
              </div>

              {(qualityHolds.length > 0 ||
                pendingApprovals.length > 0 ||
                failedPosts.length > 0 ||
                openAiMos.length > 0) && (
                <ul className="space-y-1.5 text-sm">
                  {qualityHolds.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/content/${c.id}`}
                        className="flex justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
                      >
                        <span className="truncate font-medium">{c.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          Needs attention
                        </span>
                      </Link>
                    </li>
                  ))}
                  {pendingApprovals
                    .filter((c) => !qualityHolds.some((h) => h.id === c.id))
                    .slice(0, 3)
                    .map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/approvals?company=${company.id}`}
                          className="flex justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
                        >
                          <span className="truncate font-medium">{c.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Pending approval
                          </span>
                        </Link>
                      </li>
                    ))}
                  {failedPosts.slice(0, 2).map((post) => (
                    <li key={post.id}>
                      <Link
                        href={`/publishing?company=${company.id}`}
                        className="flex justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
                      >
                        <span className="truncate font-medium">
                          {post.platform} · {formatDate(post.scheduledDate)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          Failed publish
                        </span>
                      </Link>
                    </li>
                  ))}
                  {openAiMos.slice(0, 2).map((opp) => (
                    <li key={opp.id}>
                      <Link
                        href={`/companies/${company.id}`}
                        className="flex justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-muted"
                      >
                        <span className="truncate font-medium">{opp.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          AI signal
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Next 7 days
                  </p>
                  <Link
                    href={`/calendar?company=${company.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Calendar
                  </Link>
                </div>
                {nextPosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing scheduled this week.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {nextPosts.map((post) => (
                      <li
                        key={post.id}
                        className="flex justify-between gap-2 border-b border-border py-1.5 last:border-0"
                      >
                        <span className="truncate">{post.platform}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(post.scheduledDate)}
                          {post.scheduledTime ? ` · ${post.scheduledTime}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Next for this client</h3>
                  <span className="text-xs text-muted-foreground">
                    {doneCount}/{steps.length} delivery steps
                  </span>
                </div>
                {nextActions.length === 0 ? (
                  <p className="text-sm text-emerald-700">Nothing blocking — keep the calendar fed.</p>
                ) : (
                  <ol className="space-y-2">
                    {nextActions.slice(0, 3).map((action, i) => (
                      <li key={`${action.href}-${action.label}`}>
                        <Link
                          href={action.href}
                          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                        >
                          <span className="min-w-0">
                            <span className="mr-2 tabular-nums text-muted-foreground">
                              {i + 1}.
                            </span>
                            <span className="font-medium">{action.label}</span>
                          </span>
                          <span className="shrink-0 text-xs text-primary">{action.cta} →</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </CardContent>
          </Card>

          <details
            id="setup-enrichment"
            className="group rounded-lg border border-border bg-card"
            open={!setupCollapsedByDefault || profileSaved || !!profileError}
          >
            <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">Setup &amp; enrichment</p>
                  <p className="text-xs text-muted-foreground">
                    Scrape, profile fields, local intel — secondary once the client is live.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground group-open:hidden">
                  Profile {score}% · expand
                </span>
              </div>
            </summary>

            <div className="space-y-6 border-t border-border px-5 py-5">
              <div className="flex flex-wrap gap-3 text-sm">
                <Link
                  href={`/companies/${company.id}/brand-brain`}
                  className="text-primary hover:underline"
                >
                  Brand Brain →
                </Link>
                <a href="#social-profiles" className="text-primary hover:underline">
                  Edit social URLs →
                </a>
              </div>

              <AutoOnboardingPanel
                companyId={company.id}
                companyName={company.name}
                defaultWebsite={p.website}
                defaultSocial={defaultSocial}
                compact
                socialsEditHref="#social-profiles"
                lastScrape={{
                  at: p.autoOnboarding?.lastScrapeAt,
                  mode: p.autoOnboarding?.lastScrapeMode,
                  appliedAt: p.autoOnboarding?.lastAppliedAt,
                }}
              />

              <form id="company-profile-form" action={saveOnboardingAction} className="space-y-6">
                <input type="hidden" name="companyId" value={company.id} />

                <div className="space-y-5">
                  <h3 className="text-sm font-semibold">Client identity</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Business name"
                      htmlFor="name"
                      hint="Trading name clients recognise — identity key with ABN"
                    >
                      <Input
                        id="name"
                        name="name"
                        defaultValue={company.name}
                        placeholder="e.g. Harbourview Café"
                      />
                    </Field>
                    <Field
                      label="ABN"
                      htmlFor="abn"
                      hint="With business name, identifies this account. Same ABN + different name = separate client."
                    >
                      <Input
                        id="abn"
                        name="abn"
                        defaultValue={p.abn}
                        inputMode="numeric"
                        placeholder="e.g. 51 824 753 556"
                        autoComplete="off"
                      />
                    </Field>
                    <Field
                      label="Industry"
                      htmlFor="industry"
                      hint="Free-text label for copy — business type is set under More profile fields"
                    >
                      <Input
                        id="industry"
                        name="industry"
                        defaultValue={p.industry}
                        placeholder="e.g. Café · Bondi"
                      />
                    </Field>
                    <Field label="Website" htmlFor="website">
                      <Input
                        id="website"
                        name="website"
                        defaultValue={p.website}
                        placeholder="https://www.harbourviewcafe.com.au"
                      />
                    </Field>
                    <Field
                      label="Approval contact"
                      htmlFor="approvalContact"
                      hint="Who signs off drafts for this client"
                    >
                      <Input
                        id="approvalContact"
                        name="approvalContact"
                        defaultValue={p.approvalContact}
                        placeholder="owner@harbourviewcafe.com.au"
                      />
                    </Field>
                    <Field label="Address" htmlFor="businessAddress">
                      <Input
                        id="businessAddress"
                        name="businessAddress"
                        defaultValue={p.businessAddress}
                        placeholder="12 Campbell Pde, Bondi Beach NSW 2026"
                      />
                    </Field>
                    <Field label="Phone" htmlFor="phone">
                      <Input
                        id="phone"
                        name="phone"
                        defaultValue={p.phone}
                        placeholder="02 9000 0000"
                      />
                    </Field>
                    <Field label="Email" htmlFor="email">
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={p.email}
                        placeholder="hello@harbourviewcafe.com.au"
                      />
                    </Field>
                  </div>
                </div>

                <details className="rounded-md border border-border">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                    More profile fields
                  </summary>
                  <div className="space-y-5 border-t border-border px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Legal name" htmlFor="legalName">
                        <Input
                          id="legalName"
                          name="legalName"
                          defaultValue={p.legalName}
                          placeholder="e.g. Harbourview Hospitality Pty Ltd"
                        />
                      </Field>
                      <Field label="Trading names" htmlFor="tradingNames">
                        <Input
                          id="tradingNames"
                          name="tradingNames"
                          defaultValue={p.tradingNames}
                          placeholder="e.g. Harbourview Café, HV Bondi"
                        />
                      </Field>
                    </div>
                    <BusinessTypeSection
                      initialType={businessType}
                      retail={p.retail}
                      hotel={p.hotel}
                      restaurant={p.restaurant}
                    />
                    <ProfileSuggestButton
                      formId="company-profile-form"
                      companyName={company.name}
                      industry={p.industry}
                    />
                    <Field
                      label="Nature of business"
                      htmlFor="natureOfBusiness"
                      hint={PROFILE_FIELD_HELP.natureOfBusiness}
                    >
                      <Textarea
                        id="natureOfBusiness"
                        name="natureOfBusiness"
                        defaultValue={p.natureOfBusiness}
                        placeholder="A family café in Bondi serving breakfast and lunch."
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Service areas"
                        htmlFor="serviceAreas"
                        hint={PROFILE_FIELD_HELP.serviceAreas}
                      >
                        <Textarea
                          id="serviceAreas"
                          name="serviceAreas"
                          defaultValue={p.serviceAreas.join("\n")}
                          placeholder={"Bondi\nNorth Bondi\nTamarama"}
                        />
                      </Field>
                      <Field label="Services" htmlFor="services" hint="One per line">
                        <Textarea
                          id="services"
                          name="services"
                          defaultValue={p.services.join("\n")}
                          placeholder={"Breakfast\nLunch\nTakeaway coffee"}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Target customers"
                      htmlFor="targetCustomers"
                      hint={PROFILE_FIELD_HELP.targetCustomers}
                    >
                      <Textarea
                        id="targetCustomers"
                        name="targetCustomers"
                        defaultValue={p.targetCustomers}
                        placeholder="Local families and weekday office workers within 10 minutes."
                      />
                    </Field>
                    <Field
                      label="Local market notes"
                      htmlFor="localMarketNotes"
                      hint={PROFILE_FIELD_HELP.localMarketNotes}
                    >
                      <Textarea
                        id="localMarketNotes"
                        name="localMarketNotes"
                        defaultValue={p.localMarketNotes}
                        placeholder="e.g. Strong weekday office trade; quiet Sundays"
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
                        defaultValue={p.brandVoice}
                        placeholder="Warm and neighbourly — never pushy or full of jargon."
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Calls to action"
                        htmlFor="callsToAction"
                        hint={PROFILE_FIELD_HELP.callsToAction}
                      >
                        <Textarea
                          id="callsToAction"
                          name="callsToAction"
                          defaultValue={p.callsToAction.join("\n")}
                          placeholder={"Book a table\nOrder online"}
                        />
                      </Field>
                      <Field label="Current offers" htmlFor="currentOffers">
                        <Textarea
                          id="currentOffers"
                          name="currentOffers"
                          defaultValue={p.currentOffers}
                          placeholder="e.g. 10% off weekday lunch bowls — approved wording only"
                        />
                      </Field>
                      <Field
                        label="Approved claims"
                        htmlFor="approvedClaims"
                        hint={PROFILE_FIELD_HELP.approvedClaims}
                      >
                        <Textarea
                          id="approvedClaims"
                          name="approvedClaims"
                          defaultValue={p.approvedClaims.join("\n")}
                          rows={3}
                          placeholder={ph.approvedClaims}
                        />
                      </Field>
                      <Field
                        label="Prohibited claims"
                        htmlFor="prohibitedClaims"
                        hint={PROFILE_FIELD_HELP.prohibitedClaims}
                      >
                        <Textarea
                          id="prohibitedClaims"
                          name="prohibitedClaims"
                          defaultValue={p.prohibitedClaims.join("\n")}
                          rows={3}
                          placeholder={ph.prohibitedClaims}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Required disclaimers"
                      htmlFor="requiredDisclaimers"
                      hint={PROFILE_FIELD_HELP.requiredDisclaimers}
                    >
                      <Textarea
                        id="requiredDisclaimers"
                        name="requiredDisclaimers"
                        defaultValue={p.requiredDisclaimers.join("\n")}
                        rows={3}
                        placeholder={ph.requiredDisclaimers}
                      />
                    </Field>
                  </div>
                </details>

                <div id="social-profiles" className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold">Social profiles</h3>
                    <p className="text-xs text-muted-foreground">
                      One place to edit URLs — scrape imports these automatically.
                    </p>
                  </div>
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

                <div className="flex justify-end">
                  <Button type="submit">Save profile</Button>
                </div>
              </form>

              <LocalIntelPanel companyId={company.id} local={localProfile} />
            </div>
          </details>
        </div>

        <div className="space-y-6">
          <Card id="package-service">
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="font-semibold">Marketing package</h2>
                <p className="text-xs text-muted-foreground">
                  {serviceLevelLabel} · ads media always extra
                </p>
              </div>
              <CompanyMarketingPackageForm
                companyId={company.id}
                packageId={packageId}
                assigned={packageExplicitlyAssigned}
                customModules={p.managedService?.customModules}
                serviceOptions={p.managedService?.serviceOptions}
                options={marketingPackages.map((pkg) => ({
                  id: pkg.id,
                  name: pkg.name,
                  priceAudMonthly: pkg.priceAudMonthly,
                  active: pkg.active,
                  customModuleRates: pkg.customModuleRates,
                }))}
                action={saveMarketingPackageAction}
              />
              <form action={saveManagedServiceLevelAction} className="space-y-2">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Service level" htmlFor="serviceLevel">
                  <Select
                    id="serviceLevel"
                    name="serviceLevel"
                    defaultValue={serviceLevel}
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
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Marketing health</p>
                  <p className="text-xs text-muted-foreground">
                    {health.needsAttention ? "Needs attention" : "On track"}
                  </p>
                </div>
                <Badge
                  tone={
                    health.score < 60 ? "danger" : health.score < 80 ? "warning" : "success"
                  }
                >
                  {Math.round(health.score)}
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Client readiness</p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {doneCount}/{steps.length}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      doneCount === steps.length ? "bg-emerald-500" : "bg-primary"
                    }`}
                    style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
                  />
                </div>
                {score < 100 ? (
                  <p className="text-xs text-muted-foreground">
                    Profile {score}%
                    {missing.length > 0
                      ? ` — still needed: ${missing.slice(0, 3).join(", ")}`
                      : ""}
                    {missing.length > 3 ? ` +${missing.length - 3}` : ""}
                  </p>
                ) : incompleteSteps.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Profile complete · next: {incompleteSteps[0].label}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700">Profile and delivery steps complete.</p>
                )}
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Status</p>
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
              </div>
            </CardContent>
          </Card>

          <details
            id="extra-work"
            className="rounded-lg border border-border bg-card"
          >
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold marker:content-none hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
              Account extras
              <span className="ml-2 font-normal text-muted-foreground">
                Promo · goals · docs · users
              </span>
            </summary>
            <div className="space-y-6 border-t border-border px-5 py-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-medium">Promo catalog</h3>
                  <Link href="/promo-catalog" className="text-xs text-primary hover:underline">
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
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              tone={
                                s.billingClass === "included" ? "success" : "warning"
                              }
                            >
                              {s.billingClass === "included" ? "Included" : "Extra"}
                            </Badge>
                            <Badge tone={s.status === "requested" ? "warning" : "success"}>
                              {s.status === "requested"
                                ? "Not on calendar"
                                : s.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(s.startDate)} → {formatDate(s.endDate)} ·{" "}
                          {s.billingClass === "included"
                            ? "Package included"
                            : `${formatMoney(s.budgetUsd)} + ${formatMoney(s.feeUsd)} fee`}
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
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">Campaign goals</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {campaignGoals.map((g) => (
                    <li key={g}>• {g}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">Content templates</h3>
                <ul className="space-y-2 text-sm">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-muted-foreground">
                        {t.channel} — {t.brief}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">Add-ons</h3>
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
              </div>

              {(company.status === "ai_ready" || company.status === "approved") &&
                recommendations.length > 0 && (
                  <RecommendationStrip recs={recommendations} companyId={company.id} />
                )}

              <div>
                <h3 className="mb-2 text-sm font-medium">Source documents</h3>
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
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">Assigned users</h3>
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
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
