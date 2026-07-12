"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import type {
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
} from "@/lib/types";

type PackageOption = {
  id: MarketingPackageId;
  name: string;
  priceAudMonthly: number;
  active: boolean;
};

export function CompanyMarketingPackageForm({
  companyId,
  packageId,
  customModules,
  options,
  action,
}: {
  companyId: string;
  packageId: MarketingPackageId;
  customModules?: MarketingPackageCustomModules;
  options: PackageOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [selected, setSelected] = useState<MarketingPackageId>(packageId);
  const mods = customModules ?? {
    channels: [],
    postsPerMonth: 8,
    campaignsPerMonth: 1,
    promosIncludedPerMonth: 0,
    adsManagementIncluded: false,
    serviceLevel: "managed_exceptions" as ManagedServiceLevel,
    addonIds: [],
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="companyId" value={companyId} />
      <Field label="Marketing package" htmlFor="marketingPackageId">
        <Select
          id="marketingPackageId"
          name="marketingPackageId"
          value={selected}
          onChange={(e) => setSelected(e.target.value as MarketingPackageId)}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — A${o.priceAudMonthly}/mo
              {!o.active ? " (inactive)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      {selected === "custom" ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Custom modules — ads media always extra.
          </p>
          <Field label="Channels" htmlFor="customChannels" hint="Comma-separated">
            <Input
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
          </label>
        </div>
      ) : null}

      <Button type="submit" variant="outline" size="sm" className="w-full">
        Save marketing package
      </Button>
    </form>
  );
}
