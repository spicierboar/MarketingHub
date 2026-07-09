import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany, listContent, listIntegrations, listRecommendations, usersForCompany } from "@/lib/db";
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
import { RecommendationStrip } from "@/components/recommendation-cards";
import { AutoOnboardingPanel } from "@/components/auto-onboarding-panel";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import {
  addCompanyDocAction,
  saveOnboardingAction,
  setCompanyStatusAction,
} from "../actions";

export default async function CompanyOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const { score, missing } = onboardingScore(company);
  const p = company.profile;
  const businessType = resolveBusinessType(company);
  const defaultSocial = Object.fromEntries(
    (p.socialLinks ?? []).map((l) => [l.platform, l.url]),
  );
  const campaignGoals = recommendedCampaignGoals(company);
  const templates = contentTemplatesFor(company);
  const users = await usersForCompany(company.id);

  // "Getting started" checklist — computed from real state so it walks a new
  // client from onboarding through connect-and-go.
  const [integrations, allContent, activeAddons, recommendations, health] = await Promise.all([
    listIntegrations(user.tenantId, company.id),
    listContent(user.tenantId),
    activeAddonsForCompany(user.tenantId, company.id),
    listRecommendations(user.tenantId, [company.id], "open"),
    buildCompanyHealthScore(user.tenantId, company),
  ]);
  const companyContent = allContent.filter((c) => c.companyId === company.id);
  const steps: { label: string; done: boolean; href: string; cta: string }[] = [
    { label: "Complete the company profile", done: score === 100, href: `/companies/${company.id}`, cta: "Fill in the profile" },
    { label: "Add social profile links", done: (p.socialLinks?.length ?? 0) > 0, href: `/companies/${company.id}`, cta: "Add profiles" },
    { label: "Connect a social account (OAuth)", done: integrations.some((i) => i.status === "connected"), href: "/publishing", cta: "Connect or send client link" },
    { label: "Approve your first content", done: companyContent.some((c) => ["approved", "scheduled", "published"].includes(c.status)), href: "/studio", cta: "Create content" },
    { label: "Mark the company AI-ready", done: company.status === "ai_ready", href: `/companies/${company.id}`, cta: "Review status" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <div>
      <PageHeader title={company.name} description="Company onboarding & profile">
        <Link
          href={`/companies/${company.id}/brand-brain`}
          className="text-sm text-primary hover:underline"
        >
          Brand Brain
        </Link>
        <Link
          href={`/companies/${company.id}/services`}
          className="text-sm text-primary hover:underline"
        >
          Services
        </Link>
        <Link
          href={`/companies/${company.id}/offers`}
          className="text-sm text-primary hover:underline"
        >
          Offers
        </Link>
        <Link
          href={`/companies/${company.id}/governance`}
          className="text-sm text-primary hover:underline"
        >
          Governance
        </Link>
        <Link
          href={`/companies/${company.id}/local-seo`}
          className="text-sm text-primary hover:underline"
        >
          Local SEO
        </Link>
        <StatusBadge status={company.status} />
      </PageHeader>

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

          <form action={saveOnboardingAction} className="space-y-6">
            <input type="hidden" name="companyId" value={company.id} />

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Company identity</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Company name" htmlFor="name">
                    <Input id="name" name="name" defaultValue={company.name} />
                  </Field>
                  <Field label="Legal name" htmlFor="legalName">
                    <Input id="legalName" name="legalName" defaultValue={p.legalName} />
                  </Field>
                  <Field label="Trading names" htmlFor="tradingNames">
                    <Input id="tradingNames" name="tradingNames" defaultValue={p.tradingNames} />
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
                    <Input id="approvalContact" name="approvalContact" defaultValue={p.approvalContact} />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <h2 className="font-semibold">Business & market</h2>
                <Field label="Nature of business" htmlFor="natureOfBusiness">
                  <Textarea id="natureOfBusiness" name="natureOfBusiness" defaultValue={p.natureOfBusiness} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Service areas" htmlFor="serviceAreas" hint="One per line">
                    <Textarea id="serviceAreas" name="serviceAreas" defaultValue={p.serviceAreas.join("\n")} />
                  </Field>
                  <Field label="Services" htmlFor="services" hint="One per line">
                    <Textarea id="services" name="services" defaultValue={p.services.join("\n")} />
                  </Field>
                </div>
                <Field label="Target customers" htmlFor="targetCustomers">
                  <Textarea id="targetCustomers" name="targetCustomers" defaultValue={p.targetCustomers} />
                </Field>
                <Field label="Local market notes" htmlFor="localMarketNotes">
                  <Textarea id="localMarketNotes" name="localMarketNotes" defaultValue={p.localMarketNotes} />
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
                  <Field label="Calls to action" htmlFor="callsToAction" hint="One per line">
                    <Textarea id="callsToAction" name="callsToAction" defaultValue={p.callsToAction.join("\n")} />
                  </Field>
                  <Field label="Current offers" htmlFor="currentOffers">
                    <Textarea id="currentOffers" name="currentOffers" defaultValue={p.currentOffers} />
                  </Field>
                  <Field label="Approved claims" htmlFor="approvedClaims" hint="One per line">
                    <Textarea id="approvedClaims" name="approvedClaims" defaultValue={p.approvedClaims.join("\n")} />
                  </Field>
                  <Field label="Prohibited claims" htmlFor="prohibitedClaims" hint="One per line — the AI will never use these">
                    <Textarea id="prohibitedClaims" name="prohibitedClaims" defaultValue={p.prohibitedClaims.join("\n")} />
                  </Field>
                </div>
                <Field label="Required disclaimers" htmlFor="requiredDisclaimers" hint="One per line">
                  <Textarea id="requiredDisclaimers" name="requiredDisclaimers" defaultValue={p.requiredDisclaimers.join("\n")} />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 p-6">
                <div>
                  <h2 className="font-semibold">Social profiles</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The client&apos;s public profile links, for reference. To actually
                    post, connect each account with one click in{" "}
                    <Link href="/publishing" className="underline">Publishing</Link>{" "}
                    — that uses secure OAuth, so you never handle their login or password.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {SOCIAL_PLATFORMS.map((s) => {
                    const current = p.socialLinks?.find((l) => l.platform === s.key)?.url ?? "";
                    return (
                      <Field key={s.key} label={s.label} htmlFor={`social_${s.key}`}>
                        <Input
                          id={`social_${s.key}`}
                          name={`social_${s.key}`}
                          type="url"
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
        </div>

        <div className="space-y-6">
          {/* Getting-started checklist — walk a new client from onboarding to live */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Getting started</h2>
                <span className="text-sm font-medium text-muted-foreground">
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
              {nextStep ? (
                <Link
                  href={nextStep.href}
                  className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {nextStep.cta} →
                </Link>
              ) : (
                <p className="mt-4 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
                  ✓ All set — this company is ready to go.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Campaign goals</h2>
              <p className="mb-2 text-xs text-muted-foreground">
                Recommended for {businessType.replace("_", " ")} businesses
              </p>
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

          {/* Module 3: active add-ons (read-only — managed on Billing by the owner) */}
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
                  {activeAddons.map((id) => (
                    <li key={id} className="flex items-center gap-2">
                      <span aria-hidden>{ADDONS[id].icon}</span>
                      <span>{ADDONS[id].name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No add-ons enabled. Video, photo, menus and Order-Now can be added
                  per company on the Billing page.
                </p>
              )}
            </CardContent>
          </Card>

          <HealthScoreCard health={health} />

          <Card>
            <CardContent className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Onboarding score</h2>
                <span className="text-lg font-bold">{score}%</span>
              </div>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${score === 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${score}%` }}
                />
              </div>
              {missing.length > 0 ? (
                <>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Still needed
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {missing.map((m) => (
                      <li key={m}>• {m}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-emerald-700">
                  All minimum fields complete — ready to mark AI-ready.
                </p>
              )}
            </CardContent>
          </Card>

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
                <p className="mb-3 text-sm text-muted-foreground">
                  No documents yet.
                </p>
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
