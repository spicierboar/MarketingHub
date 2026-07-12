"use client";

import { useState, useTransition } from "react";
import { FormModal } from "@/components/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  CUSTOM_CHANNEL_OPTIONS,
  customChannelLabel,
  monthlyToQuarterlyCount,
  quarterlyToMonthlyRate,
} from "@/lib/marketing-packages";
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

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

export function CompanyMarketingPackageForm({
  companyId,
  packageId,
  assigned = true,
  customModules,
  options,
  action,
}: {
  companyId: string;
  packageId: MarketingPackageId;
  /** False when Overview only shows Basic as a display fallback (not saved). */
  assigned?: boolean;
  customModules?: MarketingPackageCustomModules;
  options: PackageOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MarketingPackageId>(packageId);
  const [pending, startTransition] = useTransition();

  const current = options.find((o) => o.id === packageId) ?? options[0];
  const mods = customModules ?? {
    channels: [],
    postsPerMonth: 8,
    campaignsPerMonth: quarterlyToMonthlyRate(1),
    promosIncludedPerMonth: quarterlyToMonthlyRate(1),
    adsManagementIncluded: false,
    serviceLevel: "managed_exceptions" as ManagedServiceLevel,
    addonIds: [],
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {current?.name ?? "Basic"}
              {current ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {money(current.priceAudMonthly)}/mo
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ads media always extra.
              {packageId === "custom" && mods.channels.length
                ? ` · ${mods.channels.join(", ")}`
                : null}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {!assigned ? (
                <Badge tone="warning">Not saved yet</Badge>
              ) : current && !current.active ? (
                <Badge tone="warning">Inactive in catalog</Badge>
              ) : (
                <Badge tone="success">Assigned</Badge>
              )}
              {packageId === "custom" ? (
                <Badge tone="info">Custom modules</Badge>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(packageId);
              setOpen(true);
            }}
          >
            {assigned ? "Change" : "Assign"}
          </Button>
        </div>
      </div>

      {open ? (
        <FormModal
          title="Assign marketing package"
          description="Basic / Pro / Blast set service level from the package default. Custom lets you pick modules. Ads media always extra."
          onClose={() => setOpen(false)}
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                await action(fd);
                setOpen(false);
              });
            }}
          >
            <input type="hidden" name="companyId" value={companyId} />
            <Field label="Marketing package" htmlFor="marketingPackageId">
              <Select
                id="marketingPackageId"
                name="marketingPackageId"
                value={selected}
                onChange={(e) =>
                  setSelected(e.target.value as MarketingPackageId)
                }
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
                <Field
                  label="Channels"
                  hint="Select where this client’s package delivers"
                >
                  <div className="flex flex-wrap gap-3">
                    {CUSTOM_CHANNEL_OPTIONS.map((ch) => (
                      <label
                        key={ch}
                        className="inline-flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="customChannels"
                          value={ch}
                          defaultChecked={mods.channels.includes(ch)}
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
                    hint="Typical Basic ≈ 8"
                  >
                    <Input
                      id="customPosts"
                      name="customPostsPerMonth"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={mods.postsPerMonth}
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
                      defaultValue={monthlyToQuarterlyCount(mods.campaignsPerMonth)}
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
                      defaultValue={monthlyToQuarterlyCount(
                        mods.promosIncludedPerMonth,
                      )}
                      placeholder="1"
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

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save package"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </FormModal>
      ) : null}
    </div>
  );
}
