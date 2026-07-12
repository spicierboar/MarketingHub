"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  ADS_MEDIA_ALWAYS_EXTRA,
  CUSTOM_CHANNEL_OPTIONS,
  CUSTOM_FLOOR_AUD,
  customChannelLabel,
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
  | "promosIncludedPerMonth"
  | "adsManagementIncluded"
  | "imageQuotaPerMonth"
  | "videoQuotaPerMonth"
  | "defaultServiceLevel"
  | "customModuleRates"
>;

function formatPromos(n: number): string {
  if (n > 0 && n < 1) return "1 / quarter";
  if (n === 1) return "1 / mo";
  return `${n} / mo`;
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
  const recommended = packages.find((p) => p.id === "pro")?.id ?? packages[0]?.id;
  const [selected, setSelected] = useState<MarketingPackageId>(
    initialPackageId ?? recommended ?? "basic",
  );
  const [customMods, setCustomMods] = useState<MarketingPackageCustomModules>(() =>
    defaultCustomModules(initialCustomModules),
  );

  const customCatalog = packages.find((p) => p.id === "custom");
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
          const isPro = p.id === "pro";
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
                A${price}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </span>
              {p.id === "custom" && customQuote.floorApplied ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Basic floor applies (modules A${customQuote.rawAud})
                </p>
              ) : null}
              {p.id !== "custom" ? (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <li>{p.channels.map(customChannelLabel).join(" · ") || "Channels TBD"}</li>
                  <li>
                    ~{p.postsPerMonth} posts/mo · {p.campaignsPerMonth} campaign
                    {p.campaignsPerMonth === 1 ? "" : "s"}
                  </li>
                  <li>Promos {formatPromos(p.promosIncludedPerMonth)}</li>
                  <li>
                    {p.imageQuotaPerMonth ?? 0} AI images · {p.videoQuotaPerMonth ?? 0}{" "}
                    short videos / mo
                  </li>
                  <li>
                    {p.adsManagementIncluded
                      ? "Ads management included"
                      : "Ads management not included"}
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
                Estimated A${customQuote.priceAudMonthly}
                <span className="font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Pick modules below. Campaigns &amp; promos are per quarter. Floor ≥
              Basic (A${CUSTOM_FLOOR_AUD}). Ad spend is always extra.
              {customQuote.floorApplied
                ? ` Module total A$${customQuote.rawAud} — Basic floor applies.`
                : null}
            </p>
            <Field label="Channels" hint="Where we should publish for your brand">
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
              <Field label="Posts / mo" htmlFor="customPosts" hint="Typical Basic ≈ 8">
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
                hint="Themed campaign slots per quarter"
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
                hint="Ready-made promos included per quarter"
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
              hint="How hands-on approvals should be"
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
                <option value="fully_managed">Fully managed</option>
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
              Ads management included
              <span className="text-xs text-muted-foreground">
                (media always extra)
              </span>
            </label>
          </div>
        ) : null}

        <Button type="submit">Continue →</Button>
      </form>
    </div>
  );
}
