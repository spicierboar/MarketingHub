"use client";

import { useMemo, useState, useTransition } from "react";
import { FormModal } from "@/components/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  CUSTOM_CHANNEL_OPTIONS,
  CUSTOM_FLOOR_AUD,
  customChannelLabel,
  mergeCustomModuleRates,
  monthlyToQuarterlyCount,
  quarterlyToMonthlyRate,
  quoteCustomPackagePrice,
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
  customModuleRates?: Record<string, number>;
};

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function moneyShort(n: number) {
  return `A$${n}`;
}

function defaultMods(
  customModules?: MarketingPackageCustomModules,
): MarketingPackageCustomModules {
  return (
    customModules ?? {
      channels: [],
      postsPerMonth: 8,
      campaignsPerMonth: quarterlyToMonthlyRate(1),
      promosIncludedPerMonth: quarterlyToMonthlyRate(1),
      adsManagementIncluded: false,
      serviceLevel: "managed_exceptions" as ManagedServiceLevel,
      addonIds: [],
    }
  );
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
  const [mods, setMods] = useState<MarketingPackageCustomModules>(() =>
    defaultMods(customModules),
  );
  const [pending, startTransition] = useTransition();

  const current = options.find((o) => o.id === packageId) ?? options[0];
  const customOpt = options.find((o) => o.id === "custom");
  const rates = useMemo(
    () => mergeCustomModuleRates(customOpt?.customModuleRates),
    [customOpt?.customModuleRates],
  );
  const displayMods = customModules ?? mods;
  const assignedCustomQuote = useMemo(() => {
    if (packageId !== "custom") return null;
    return quoteCustomPackagePrice(
      defaultMods(customModules),
      customOpt?.customModuleRates,
      customOpt?.priceAudMonthly ?? CUSTOM_FLOOR_AUD,
    );
  }, [
    packageId,
    customModules,
    customOpt?.customModuleRates,
    customOpt?.priceAudMonthly,
  ]);
  const customQuote = useMemo(
    () =>
      quoteCustomPackagePrice(
        mods,
        customOpt?.customModuleRates,
        customOpt?.priceAudMonthly ?? CUSTOM_FLOOR_AUD,
      ),
    [mods, customOpt?.customModuleRates, customOpt?.priceAudMonthly],
  );

  const displayPrice =
    packageId === "custom" && assignedCustomQuote
      ? assignedCustomQuote.priceAudMonthly
      : current?.priceAudMonthly;

  const campaignsPerQuarter = monthlyToQuarterlyCount(mods.campaignsPerMonth);
  const promosPerQuarter = monthlyToQuarterlyCount(mods.promosIncludedPerMonth);

  function toggleChannel(ch: string, checked: boolean) {
    setMods((prev) => {
      const set = new Set(prev.channels.map((c) => c.toLowerCase()));
      if (checked) set.add(ch);
      else set.delete(ch);
      return { ...prev, channels: [...set] };
    });
  }

  function openEditor() {
    setSelected(packageId);
    setMods(defaultMods(customModules));
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {current?.name ?? "Basic"}
              {displayPrice != null ? (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {money(displayPrice)}/mo
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ads media always extra.
              {packageId === "custom" && displayMods.channels.length
                ? ` · ${displayMods.channels.join(", ")}`
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
          <Button type="button" size="sm" variant="outline" onClick={openEditor}>
            {assigned ? "Change" : "Assign"}
          </Button>
        </div>
      </div>

      {open ? (
        <FormModal
          title="Assign marketing package"
          description="Basic / Pro / Blast are fixed SKUs. Custom is priced per module at published unit rates. Ads media always extra."
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
                    {o.name} — A$
                    {o.id === "custom"
                      ? customQuote.priceAudMonthly
                      : o.priceAudMonthly}
                    /mo
                    {!o.active ? " (inactive)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {selected === "custom" ? (
              <div className="space-y-3 rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Line-item pricing — total is the sum of modules
                  {customQuote.floorAud > 0
                    ? ` (minimum ${moneyShort(customQuote.floorAud)}/mo)`
                    : ""}
                  . Ads media always extra.
                </p>
                <Field
                  label="Channels"
                  hint={`${moneyShort(rates.channel ?? 0)} each / mo`}
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
                          checked={mods.channels
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
                    hint={`${moneyShort(rates.postsPerMonth ?? 0)} each`}
                  >
                    <Input
                      id="customPosts"
                      name="customPostsPerMonth"
                      type="number"
                      min={0}
                      step={1}
                      value={mods.postsPerMonth}
                      onChange={(e) =>
                        setMods((prev) => ({
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
                    hint={`${moneyShort(rates.campaignsPerQuarter ?? 0)} each`}
                  >
                    <Input
                      id="customCampaigns"
                      name="customCampaignsPerQuarter"
                      type="number"
                      min={0}
                      step={1}
                      value={campaignsPerQuarter}
                      onChange={(e) =>
                        setMods((prev) => ({
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
                    hint={`${moneyShort(rates.promosPerQuarter ?? 0)} each`}
                  >
                    <Input
                      id="customPromos"
                      name="customPromosPerQuarter"
                      type="number"
                      min={0}
                      step={1}
                      value={promosPerQuarter}
                      onChange={(e) =>
                        setMods((prev) => ({
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
                      ? `Fully managed +${moneyShort(rates.fullyManaged ?? 0)}/mo`
                      : undefined
                  }
                >
                  <Select
                    id="customServiceLevel"
                    name="customServiceLevel"
                    value={mods.serviceLevel}
                    onChange={(e) =>
                      setMods((prev) => ({
                        ...prev,
                        serviceLevel: e.target.value as ManagedServiceLevel,
                      }))
                    }
                  >
                    <option value="approval">Approval</option>
                    <option value="managed_exceptions">Managed exceptions</option>
                    <option value="fully_managed">
                      Fully managed (+{moneyShort(rates.fullyManaged ?? 0)}/mo)
                    </option>
                  </Select>
                </Field>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="customAdsManagementIncluded"
                    value="on"
                    checked={mods.adsManagementIncluded}
                    onChange={(e) =>
                      setMods((prev) => ({
                        ...prev,
                        adsManagementIncluded: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  Ads management (+{moneyShort(rates.adsManagement ?? 0)}/mo)
                </label>

                {customQuote.lines.length > 0 ? (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs font-medium">Monthly breakdown</p>
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
                              ? ` · ${line.quantity} × ${moneyShort(line.unitAud)}`
                              : ` · ${moneyShort(line.unitAud)}`}
                          </span>
                          <span className="shrink-0 font-medium text-foreground">
                            {moneyShort(line.totalAud)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
                      <span>Total / mo</span>
                      <span>{moneyShort(customQuote.priceAudMonthly)}</span>
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
