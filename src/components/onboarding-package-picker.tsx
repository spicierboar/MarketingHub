"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  ADS_MEDIA_ALWAYS_EXTRA,
  CUSTOM_CHANNEL_OPTIONS,
  CUSTOM_FLOOR_AUD,
  customChannelLabel,
  mergeCustomModuleRates,
  monthlyToQuarterlyCount,
  quarterlyToMonthlyRate,
  quoteCustomPackagePrice,
  type MarketingPackageDef,
} from "@/lib/marketing-packages";
import type {
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
} from "@/lib/types";

type PackageCard = Pick<
  MarketingPackageDef,
  | "id"
  | "name"
  | "priceAudMonthly"
  | "blurb"
  | "channels"
  | "postsPerMonth"
  | "campaignsPerMonth"
  | "campaignConceptsPerMonth"
  | "searchVisibilityIncluded"
  | "promosIncludedPerMonth"
  | "adsManagementIncluded"
  | "imageQuotaPerMonth"
  | "videoQuotaPerMonth"
  | "defaultServiceLevel"
  | "customModuleRates"
>;

function money(n: number) {
  return `A$${n}`;
}

function defaultCustomModules(
  initial?: MarketingPackageCustomModules,
): MarketingPackageCustomModules {
  return (
    initial ?? {
      channels: ["instagram", "facebook"],
      postsPerMonth: 8,
      // 1 campaign/quarter + 1 promo/quarter (stored as monthly averages)
      campaignsPerMonth: quarterlyToMonthlyRate(1),
      promosIncludedPerMonth: quarterlyToMonthlyRate(1),
      adsManagementIncluded: false,
      serviceLevel: "managed_exceptions" as ManagedServiceLevel,
      addonIds: [],
    }
  );
}

export function OnboardingPackagePicker({
  packages,
  initialPackageId,
  initialCustomModules,
  action,
  description,
  hiddenFields,
}: {
  packages: PackageCard[];
  initialPackageId?: MarketingPackageId;
  initialCustomModules?: MarketingPackageCustomModules;
  action: (formData: FormData) => Promise<void>;
  /** Override intro copy (e.g. agency New Client voice). */
  description?: string;
  /** Extra hidden inputs (e.g. companyId for sales wizard). */
  hiddenFields?: Record<string, string>;
}) {
  const recommended = packages.find((p) => p.id === "growth")?.id ?? packages[0]?.id;
  const [selected, setSelected] = useState<MarketingPackageId>(
    initialPackageId ?? recommended ?? "starter",
  );
  const [customMods, setCustomMods] = useState<MarketingPackageCustomModules>(() =>
    defaultCustomModules(initialCustomModules),
  );

  const customCatalog = packages.find((p) => p.id === "custom");
  const rates = useMemo(
    () => mergeCustomModuleRates(customCatalog?.customModuleRates),
    [customCatalog?.customModuleRates],
  );
  const customQuote = useMemo(
    () =>
      quoteCustomPackagePrice(
        customMods,
        customCatalog?.customModuleRates,
        customCatalog?.priceAudMonthly ?? CUSTOM_FLOOR_AUD,
      ),
    [customMods, customCatalog?.customModuleRates, customCatalog?.priceAudMonthly],
  );

  function toggleChannel(ch: string, checked: boolean) {
    setCustomMods((prev) => {
      const set = new Set(prev.channels.map((c) => c.toLowerCase()));
      if (checked) set.add(ch);
      else set.delete(ch);
      return { ...prev, channels: [...set] };
    });
  }

  function displayPrice(p: PackageCard): number {
    if (p.id === "custom") return customQuote.priceAudMonthly;
    return p.priceAudMonthly;
  }

  const campaignsPerQuarter = monthlyToQuarterlyCount(customMods.campaignsPerMonth);
  const promosPerQuarter = monthlyToQuarterlyCount(customMods.promosIncludedPerMonth);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {description ??
          "Choose the marketing package for your business. This is what we deliver for your brand — separate from any workspace billing plan."}
        {ADS_MEDIA_ALWAYS_EXTRA ? " Ad spend is always extra." : null}
      </p>

      <div className="flex flex-col gap-2">
        {packages.map((p) => {
          const isSelected = selected === p.id;
          const isPro = p.id === "growth";
          const price = displayPrice(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={
                "flex w-full flex-col rounded-lg border px-3 py-3 text-left transition-colors " +
                (isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border hover:border-primary hover:bg-primary/5")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                {isPro ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Recommended
                  </span>
                ) : null}
              </div>
              <span className="mt-1 text-2xl font-bold">
                {money(price)}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo excl GST
                </span>
              </span>
              {p.id === "custom" ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Sum of line items
                  {customQuote.floorApplied
                    ? ` · minimum ${money(customQuote.floorAud)}`
                    : null}
                </p>
              ) : null}
              {p.id !== "custom" ? (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <li>{p.channels.map(customChannelLabel).join(" · ") || "Channels TBD"}</li>
                  <li>
                    {p.campaignConceptsPerMonth} campaign concepts / month
                  </li>
                  <li>
                    {p.searchVisibilityIncluded
                      ? "Search Visibility included"
                      : p.id === "growth"
                        ? "Search Visibility optional (+A$249/mo)"
                        : "No SEO / AEO / GEO"}
                  </li>
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{p.blurb}</p>
              )}
              {p.id !== "custom" && p.blurb ? (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{p.blurb}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="marketingPackageId" value={selected} />
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Website and advertising services</p>
          <p className="text-xs text-muted-foreground">
            Website Connection Setup is always A$299 once-off. Ad-platform
            charges go directly to your card and are separate from service fees.
          </p>
          {selected === "growth" ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="searchVisibility" className="mt-0.5 h-4 w-4" />
              <span>Search Visibility — A$249/month (one substantial article or landing update)</span>
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="websitePublishing" className="mt-0.5 h-4 w-4" />
            <span>Website Publishing — A$99/month</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="hostedLandingPage" className="mt-0.5 h-4 w-4" />
            <span>Hosted Landing Page — A$79/month + A$299 setup</span>
          </label>
          <Field
            label="Monthly ad cap (A$)"
            htmlFor="monthlyAdCapAud"
            hint="Maximum client-authorised media spend; 0 means no managed ad spend."
          >
            <Input
              id="monthlyAdCapAud"
              name="monthlyAdCapAud"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="directPlatformChargeAccepted"
              required
              className="mt-0.5 h-4 w-4"
            />
            <span>
              I understand advertising platforms charge my card directly. Those
              charges are separate from service fees and cannot exceed the monthly
              cap entered above without a new approval.
            </span>
          </label>
        </div>

        {hiddenFields
          ? Object.entries(hiddenFields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))
          : null}

        {selected === "custom" ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Build your Custom package</p>
              <p className="text-sm font-semibold">
                Estimated {money(customQuote.priceAudMonthly)}
                <span className="font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Each module is priced individually at the rates below. Monthly total is
              the sum of line items
              {customQuote.floorAud > 0
                ? ` (minimum commitment ${money(customQuote.floorAud)}/mo when the sum is lower)`
                : ""}
              . Named Basic / Pro / Blast stay fixed bundle prices. Ad spend is always
              extra.
            </p>
            <Field
              label="Channels"
              hint={`${money(rates.channel ?? 0)} each / mo`}
            >
              <div className="flex flex-wrap gap-3">
                {CUSTOM_CHANNEL_OPTIONS.map((ch) => (
                  <label key={ch} className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="customChannels"
                      value={ch}
                      checked={customMods.channels
                        .map((c) => c.toLowerCase())
                        .includes(ch)}
                      onChange={(e) => toggleChannel(ch, e.target.checked)}
                      className="h-4 w-4"
                    />
                    {customChannelLabel(ch)}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Posts / mo"
                htmlFor="customPosts"
                hint={`${money(rates.postsPerMonth ?? 0)} each · Basic ≈ 8`}
              >
                <Input
                  id="customPosts"
                  name="customPostsPerMonth"
                  type="number"
                  min={0}
                  step={1}
                  value={customMods.postsPerMonth}
                  onChange={(e) =>
                    setCustomMods((prev) => ({
                      ...prev,
                      postsPerMonth: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                  placeholder="8"
                />
              </Field>
              <Field
                label="Campaigns / quarter"
                htmlFor="customCampaigns"
                hint={`${money(rates.campaignsPerQuarter ?? 0)} each / quarter`}
              >
                <Input
                  id="customCampaigns"
                  name="customCampaignsPerQuarter"
                  type="number"
                  min={0}
                  step={1}
                  value={campaignsPerQuarter}
                  onChange={(e) =>
                    setCustomMods((prev) => ({
                      ...prev,
                      campaignsPerMonth: quarterlyToMonthlyRate(
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    }))
                  }
                  placeholder="1"
                />
              </Field>
              <Field
                label="Promos / quarter"
                htmlFor="customPromos"
                hint={`${money(rates.promosPerQuarter ?? 0)} each / quarter`}
              >
                <Input
                  id="customPromos"
                  name="customPromosPerQuarter"
                  type="number"
                  min={0}
                  step={1}
                  value={promosPerQuarter}
                  onChange={(e) =>
                    setCustomMods((prev) => ({
                      ...prev,
                      promosIncludedPerMonth: quarterlyToMonthlyRate(
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    }))
                  }
                  placeholder="1"
                />
              </Field>
            </div>
            <Field
              label="Service level"
              htmlFor="customServiceLevel"
              hint={
                (rates.fullyManaged ?? 0) > 0
                  ? `Fully managed +${money(rates.fullyManaged ?? 0)}/mo`
                  : "How hands-on approvals should be"
              }
            >
              <Select
                id="customServiceLevel"
                name="customServiceLevel"
                value={customMods.serviceLevel}
                onChange={(e) =>
                  setCustomMods((prev) => ({
                    ...prev,
                    serviceLevel: e.target.value as ManagedServiceLevel,
                  }))
                }
              >
                <option value="approval">Approval</option>
                <option value="managed_exceptions">Managed exceptions</option>
                <option value="fully_managed">
                  Fully managed (+{money(rates.fullyManaged ?? 0)}/mo)
                </option>
              </Select>
            </Field>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="customAdsManagementIncluded"
                value="on"
                checked={customMods.adsManagementIncluded}
                onChange={(e) =>
                  setCustomMods((prev) => ({
                    ...prev,
                    adsManagementIncluded: e.target.checked,
                  }))
                }
                className="h-4 w-4"
              />
              Ads management (+{money(rates.adsManagement ?? 0)}/mo)
              <span className="text-xs text-muted-foreground">
                (media always extra)
              </span>
            </label>

            {customQuote.lines.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs font-medium text-foreground">Monthly breakdown</p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  {customQuote.lines.map((line) => (
                    <li
                      key={line.key}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span>
                        {line.label}
                        {line.quantity > 1 ||
                        line.key === "channel" ||
                        line.key === "postsPerMonth" ||
                        line.key === "campaignsPerQuarter" ||
                        line.key === "promosPerQuarter"
                          ? ` · ${line.quantity} × ${money(line.unitAud)}`
                          : ` · ${money(line.unitAud)}`}
                      </span>
                      <span className="shrink-0 font-medium text-foreground">
                        {money(line.totalAud)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex items-baseline justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                  <span>Total / mo</span>
                  <span>{money(customQuote.priceAudMonthly)}</span>
                </p>
              </div>
            ) : null}

            {customQuote.undercutWarning ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {customQuote.undercutWarning}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button type="submit">Continue →</Button>
      </form>
    </div>
  );
}
