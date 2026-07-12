"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  ADS_MEDIA_ALWAYS_EXTRA,
  CUSTOM_CHANNEL_OPTIONS,
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
  | "defaultServiceLevel"
>;

function formatPromos(n: number): string {
  if (n > 0 && n < 1) return "1 / quarter";
  if (n === 1) return "1 / mo";
  return `${n} / mo`;
}

export function OnboardingPackagePicker({
  packages,
  initialPackageId,
  initialCustomModules,
  action,
}: {
  packages: PackageCard[];
  initialPackageId?: MarketingPackageId;
  initialCustomModules?: MarketingPackageCustomModules;
  action: (formData: FormData) => Promise<void>;
}) {
  const recommended = packages.find((p) => p.id === "pro")?.id ?? packages[0]?.id;
  const [selected, setSelected] = useState<MarketingPackageId>(
    initialPackageId ?? recommended ?? "basic",
  );
  const mods = initialCustomModules ?? {
    channels: ["instagram", "facebook"],
    postsPerMonth: 8,
    campaignsPerMonth: 1,
    promosIncludedPerMonth: 0,
    adsManagementIncluded: false,
    serviceLevel: "managed_exceptions" as ManagedServiceLevel,
    addonIds: [],
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose the marketing package for your business. This is what we deliver
        for your brand — separate from any workspace billing plan.
        {ADS_MEDIA_ALWAYS_EXTRA ? " Ad spend is always extra." : null}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {packages.map((p) => {
          const isSelected = selected === p.id;
          const isPro = p.id === "pro";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={
                "flex flex-col rounded-lg border p-4 text-left transition-colors " +
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
                A${p.priceAudMonthly}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </span>
              {p.id !== "custom" ? (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <li>{p.channels.map(titleCase).join(" · ") || "Channels TBD"}</li>
                  <li>
                    ~{p.postsPerMonth} posts/mo · {p.campaignsPerMonth} campaign
                    {p.campaignsPerMonth === 1 ? "" : "s"}
                  </li>
                  <li>Promos {formatPromos(p.promosIncludedPerMonth)}</li>
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

        {selected === "custom" ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">Build your Custom package</p>
            <p className="text-xs text-muted-foreground">
              Pick modules below. Floor ≥ Basic (A$349). Ad spend is always extra.
            </p>
            <Field label="Channels" htmlFor="customChannels">
              <div className="flex flex-wrap gap-3">
                {CUSTOM_CHANNEL_OPTIONS.map((ch) => (
                  <label key={ch} className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="customChannelOpt"
                      value={ch}
                      defaultChecked={mods.channels.includes(ch)}
                      className="h-4 w-4"
                      onChange={(e) => {
                        const box = e.currentTarget.form?.elements.namedItem(
                          "customChannels",
                        ) as HTMLInputElement | null;
                        if (!box) return;
                        const checked = Array.from(
                          e.currentTarget.form?.querySelectorAll<HTMLInputElement>(
                            'input[name="customChannelOpt"]:checked',
                          ) ?? [],
                        ).map((el) => el.value);
                        box.value = checked.join(", ");
                      }}
                    />
                    {titleCase(ch)}
                  </label>
                ))}
              </div>
              <input
                type="hidden"
                id="customChannels"
                name="customChannels"
                defaultValue={mods.channels.join(", ")}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Posts / mo" htmlFor="customPosts">
                <Input
                  id="customPosts"
                  name="customPostsPerMonth"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={mods.postsPerMonth}
                />
              </Field>
              <Field label="Campaigns / mo" htmlFor="customCampaigns">
                <Input
                  id="customCampaigns"
                  name="customCampaignsPerMonth"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={mods.campaignsPerMonth}
                />
              </Field>
              <Field label="Promos / mo" htmlFor="customPromos">
                <Input
                  id="customPromos"
                  name="customPromosIncludedPerMonth"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={mods.promosIncludedPerMonth}
                />
              </Field>
            </div>
            <Field label="Service level" htmlFor="customServiceLevel">
              <Select
                id="customServiceLevel"
                name="customServiceLevel"
                defaultValue={mods.serviceLevel}
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
                defaultChecked={mods.adsManagementIncluded}
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

function titleCase(s: string): string {
  if (s === "gbp") return "Google Business";
  if (s === "instagram") return "Instagram";
  if (s === "facebook") return "Facebook";
  if (s === "tiktok") return "TikTok";
  if (s === "email") return "Email";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
