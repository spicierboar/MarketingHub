import Link from "next/link";
import { isAdmin, requireUser } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { liveOffers, getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LockedCompanyField } from "@/components/locked-company-field";
import { createCampaignAction, createCampaignFromGoalAction } from "../actions";
import { planCampaignFromInstructionAction } from "../ai-layer-actions";
import { resolveBusinessType } from "@/lib/business-profiles";
import { CampaignObjectiveHints } from "../campaign-objective-hints";
import { CampaignBuilderPanel } from "@/components/campaign-builder-panel";
import { MARKETING_FIELD_HELP } from "@/lib/profile-suggestions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const companies = (await visibleCompanies(user)).filter(
    (c) => c.status === "ai_ready" || c.status === "approved",
  );
  // Prefill from a recommendation (§44) or deep link.
  const pf = await searchParams;
  const pfCompany =
    pf.company && companies.some((c) => c.id === pf.company) ? pf.company : undefined;
  const formCompanies = pfCompany
    ? companies.filter((c) => c.id === pfCompany)
    : companies;
  const companyLocked = Boolean(pfCompany);
  const scopedCompany = pfCompany ? await getCompany(pfCompany) : null;
  const cancelHref = pfCompany ? `/campaigns?company=${pfCompany}` : "/campaigns";
  const formCompanyOpts = formCompanies.map((c) => ({ id: c.id, name: c.name }));
  // Offers grouped per company; the action validates company/offer pairing.
  const offerOptions = (
    await Promise.all(
      formCompanies.map(async (c) =>
        (await liveOffers(c.id)).map((o) => ({
          id: o.id,
          label: `${c.name} — ${o.name}`,
        })),
      ),
    )
  ).flat();
  const defaultStart = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div>
      <PageHeader
        title={scopedCompany ? `New campaign · ${scopedCompany.name}` : "New campaign"}
        description="The AI plans the full calendar; every item is drafted and approved individually."
      />
      <div className="mx-auto max-w-3xl p-6">
        {formCompanies.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No AI-ready companies available to you.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <form action={createCampaignFromGoalAction}>
              <Card>
                <CardContent className="space-y-5 p-6">
                  <LockedCompanyField
                    id="builderCompanyId"
                    companies={formCompanyOpts}
                    companyId={pfCompany}
                    locked={companyLocked}
                  />

                  <Field
                    label="Your goal"
                    htmlFor="goal"
                    hint={MARKETING_FIELD_HELP.campaignGoal}
                  >
                    <Textarea
                      id="goal"
                      name="goal"
                      required
                      rows={3}
                      placeholder="I want more weekday customers…"
                    />
                  </Field>

                  <CampaignBuilderPanel
                    companies={formCompanies.map((c) => ({
                      id: c.id,
                      name: c.name,
                      businessType: resolveBusinessType(c),
                    }))}
                    defaultCompanyId={pfCompany}
                    defaultStart={defaultStart}
                  />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Duration" htmlFor="builderDurationDays">
                      <Select id="builderDurationDays" name="durationDays" defaultValue="30">
                        <option value="30">30-day plan</option>
                        <option value="90">90-day plan</option>
                      </Select>
                    </Field>
                    <Field label="Live offer (optional)" htmlFor="builderOfferId">
                      <Select id="builderOfferId" name="offerId" defaultValue="">
                        <option value="">— none —</option>
                        {offerOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </CardContent>
              </Card>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </Link>
                <Button type="submit">Build from goal</Button>
                {admin && (
                  <Button
                    type="submit"
                    variant="outline"
                    formAction={planCampaignFromInstructionAction}
                  >
                    Build with AI layer review
                  </Button>
                )}
              </div>
              {admin && (
                <p className="mt-2 text-right text-xs text-muted-foreground">
                  AI layer review stores a structured recommendation (facts / assumptions /
                  risks / approvals) and keeps the campaign in draft — no publish or spend.
                </p>
              )}
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or plan manually
                </span>
              </div>
            </div>

          <form action={createCampaignAction}>
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <LockedCompanyField
                    id="companyId"
                    companies={formCompanyOpts}
                    companyId={pfCompany}
                    locked={companyLocked}
                  />
                  <Field label="Campaign name" htmlFor="name" hint="Optional — auto-named from the objective">
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g. July weekday lunch push"
                    />
                  </Field>
                </div>

                <Field
                  label="Objective"
                  htmlFor="objective"
                  hint={MARKETING_FIELD_HELP.objective}
                >
                  <Textarea
                    id="objective"
                    name="objective"
                    required
                    defaultValue={pf.objective}
                    placeholder="e.g. Fill weekday lunch tables"
                  />
                </Field>

                <CampaignObjectiveHints
                  companies={formCompanies.map((c) => ({
                    id: c.id,
                    name: c.name,
                    businessType: resolveBusinessType(c),
                  }))}
                  defaultCompanyId={pfCompany}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Audience"
                    htmlFor="audience"
                    hint={MARKETING_FIELD_HELP.targetAudience}
                  >
                    <Input
                      id="audience"
                      name="audience"
                      defaultValue={pf.audience}
                      placeholder="Local families within 10 minutes"
                    />
                  </Field>
                  <Field
                    label="Service / product focus"
                    htmlFor="serviceFocus"
                    hint="A service from the catalogue works best"
                  >
                    <Input
                      id="serviceFocus"
                      name="serviceFocus"
                      defaultValue={pf.serviceFocus}
                      placeholder="e.g. Weekday lunch specials"
                    />
                  </Field>
                </div>

                <fieldset className="rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">Channels</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {CONTENT_PLATFORM_OPTIONS.map((c) => (
                      <label key={c.value} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          name="channels"
                          value={c.value}
                          defaultChecked={c.value !== "Paid ads" && c.value !== "Email" && c.value !== "TikTok"}
                          className="h-4 w-4"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Paid ads route to senior approval automatically.
                  </p>
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Duration" htmlFor="durationDays">
                    <Select id="durationDays" name="durationDays" defaultValue="30">
                      <option value="30">30-day plan</option>
                      <option value="90">90-day plan</option>
                    </Select>
                  </Field>
                  <Field label="Start date" htmlFor="startDate">
                    <Input id="startDate" name="startDate" type="date" defaultValue={defaultStart} />
                  </Field>
                  <Field label="Live offer to promote" htmlFor="offerId" hint="Must belong to the chosen company">
                    <Select id="offerId" name="offerId" defaultValue="">
                      <option value="">— none —</option>
                      {offerOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <fieldset className="rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">
                    Local event (optional)
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Event name" htmlFor="eventName">
                      <Input id="eventName" name="eventName" placeholder="e.g. Wattle Valley Food Festival" />
                    </Field>
                    <Field label="Event date" htmlFor="eventDate">
                      <Input id="eventDate" name="eventDate" type="date" />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    With an event set, the plan includes announcement → reminder →
                    last-chance → day-of → thank-you posts.
                  </p>
                </fieldset>
              </CardContent>
            </Card>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Link href={cancelHref} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </Link>
              <Button type="submit">Generate campaign plan</Button>
            </div>
          </form>
          </div>
        )}
      </div>
    </div>
  );
}
