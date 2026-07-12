"use client";

import { useState, useTransition } from "react";
import { FormModal } from "@/components/form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import type { MarketingPackageDef } from "@/lib/marketing-packages";
import {
  CUSTOM_CHANNEL_OPTIONS,
  customChannelLabel,
} from "@/lib/marketing-packages";
import type { MarketingPackageId } from "@/lib/types";
import {
  resetMarketingPackageOverrideAction,
  saveMarketingPackageOverrideAction,
} from "@/app/(app)/marketing-packages/actions";

export type MarketingPackageRow = {
  pkg: MarketingPackageDef;
  hasOverride: boolean;
};

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function PackageEditModal({
  row,
  onClose,
}: {
  row: MarketingPackageRow;
  onClose: () => void;
}) {
  const { pkg, hasOverride } = row;
  const [pending, startTransition] = useTransition();

  function runAction(action: (fd: FormData) => Promise<void>, fd: FormData) {
    startTransition(async () => {
      await action(fd);
      onClose();
    });
  }

  return (
    <FormModal
      title={`Edit ${pkg.name}`}
      description="Changes apply only to this workspace. Ad media spend is always extra."
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone={pkg.active ? "success" : "neutral"}>
          {pkg.active ? "Active" : "Inactive"}
        </Badge>
        <Badge tone={hasOverride ? "warning" : "neutral"}>
          {hasOverride ? "Customised" : "Platform default"}
        </Badge>
      </div>

      <form
        key={pkg.id}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("packageId", pkg.id);
          runAction(saveMarketingPackageOverrideAction, fd);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor={`name-${pkg.id}`} hint="Shown at signup and on client Account">
            <Input
              id={`name-${pkg.id}`}
              name="name"
              defaultValue={pkg.name}
              required
              placeholder="e.g. Pro"
            />
          </Field>
          <Field
            label="Price (A$/mo)"
            htmlFor={`price-${pkg.id}`}
            hint={
              pkg.id === "custom"
                ? "Floor for custom builds (≥ Basic)."
                : "Monthly package price for this workspace"
            }
          >
            <Input
              id={`price-${pkg.id}`}
              name="priceAudMonthly"
              type="number"
              min={0}
              step={1}
              defaultValue={pkg.priceAudMonthly}
              placeholder="649"
              required
            />
          </Field>
        </div>
        <Field
          label="Blurb"
          htmlFor={`blurb-${pkg.id}`}
          hint="Short pitch for agency and signup cards"
        >
          <Textarea
            id={`blurb-${pkg.id}`}
            name="blurb"
            defaultValue={pkg.blurb}
            rows={3}
            placeholder="e.g. Multi-channel growth — IG + FB + GBP, ~16 posts/mo…"
          />
        </Field>
        <Field label="Channels" hint="Default channels for this package SKU">
          <div className="flex flex-wrap gap-3">
            {CUSTOM_CHANNEL_OPTIONS.map((ch) => (
              <label key={ch} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="channels"
                  value={ch}
                  defaultChecked={pkg.channels.includes(ch)}
                  className="h-4 w-4"
                />
                {customChannelLabel(ch)}
              </label>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Posts / mo" htmlFor={`posts-${pkg.id}`}>
            <Input
              id={`posts-${pkg.id}`}
              name="postsPerMonth"
              type="number"
              min={0}
              step={1}
              defaultValue={pkg.postsPerMonth}
              placeholder="16"
            />
          </Field>
          <Field label="Campaigns / mo" htmlFor={`campaigns-${pkg.id}`}>
            <Input
              id={`campaigns-${pkg.id}`}
              name="campaignsPerMonth"
              type="number"
              min={0}
              step={1}
              defaultValue={pkg.campaignsPerMonth}
              placeholder="2"
            />
          </Field>
          <Field
            label="Promos / mo"
            htmlFor={`promos-${pkg.id}`}
            hint="0.33 ≈ 1 / quarter"
          >
            <Input
              id={`promos-${pkg.id}`}
              name="promosIncludedPerMonth"
              type="number"
              min={0}
              step={0.01}
              defaultValue={
                Number.isInteger(pkg.promosIncludedPerMonth)
                  ? pkg.promosIncludedPerMonth
                  : Math.round(pkg.promosIncludedPerMonth * 100) / 100
              }
              placeholder="1"
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Free AI images / mo"
            htmlFor={`img-quota-${pkg.id}`}
            hint="Content creation free pool before AI video add-on"
          >
            <Input
              id={`img-quota-${pkg.id}`}
              name="imageQuotaPerMonth"
              type="number"
              min={0}
              step={1}
              defaultValue={pkg.imageQuotaPerMonth}
              placeholder="16"
            />
          </Field>
          <Field
            label="Free AI videos / mo"
            htmlFor={`vid-quota-${pkg.id}`}
            hint="Short-form free pool before AI video add-on"
          >
            <Input
              id={`vid-quota-${pkg.id}`}
              name="videoQuotaPerMonth"
              type="number"
              min={0}
              step={1}
              defaultValue={pkg.videoQuotaPerMonth}
              placeholder="4"
            />
          </Field>
        </div>
        <Field label="Default service level" htmlFor={`level-${pkg.id}`}>
          <Select
            id={`level-${pkg.id}`}
            name="defaultServiceLevel"
            defaultValue={pkg.defaultServiceLevel}
          >
            <option value="approval">Approval</option>
            <option value="managed_exceptions">Managed exceptions</option>
            <option value="fully_managed">Fully managed</option>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="adsManagementIncluded"
              defaultChecked={pkg.adsManagementIncluded}
              className="h-4 w-4"
            />
            Ads management included
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={pkg.active}
              className="h-4 w-4"
            />
            Active (shown at signup)
          </label>
        </div>
        <Field label="Included add-ons" hint="Optional package inclusions.">
          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ["video", "AI video"],
                ["photo", "Photo"],
                ["menus", "Menus"],
                ["order_button", "Order button"],
                ["bookings", "Bookings"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  name="includedAddonIds"
                  value={id}
                  defaultChecked={pkg.includedAddonIds.includes(id)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            ))}
          </div>
        </Field>
        {pkg.id === "custom" ? (
          <Field
            label="Custom module rates (JSON)"
            htmlFor={`rates-${pkg.id}`}
            hint='Overrides defaults (channel:40, postsPerMonth:25, campaignsPerQuarter:55, promosPerQuarter:80, adsManagement:150, fullyManaged:75). Campaigns/promos rates are per quarter. e.g. {"postsPerMonth":30,"adsManagement":200}'
          >
            <Textarea
              id={`rates-${pkg.id}`}
              name="customModuleRates"
              rows={2}
              defaultValue={
                pkg.customModuleRates &&
                Object.keys(pkg.customModuleRates).length > 0
                  ? JSON.stringify(pkg.customModuleRates)
                  : ""
              }
              placeholder='{"postsPerMonth":25}'
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save package"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>

      {hasOverride ? (
        <div className="mt-4 border-t border-border pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              runAction(resetMarketingPackageOverrideAction, fd);
            }}
          >
            <input type="hidden" name="packageId" value={pkg.id} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Reset to platform default
            </Button>
          </form>
        </div>
      ) : null}
    </FormModal>
  );
}

export function MarketingPackagesBrowser({
  rows,
}: {
  rows: MarketingPackageRow[];
}) {
  const [editingId, setEditingId] = useState<MarketingPackageId | null>(null);
  const editing = rows.find((r) => r.pkg.id === editingId) ?? null;

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Package</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Cadence</th>
              <th className="px-3 py-2 font-medium">Channels</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { pkg, hasOverride } = row;
              return (
                <tr
                  key={pkg.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{pkg.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {pkg.blurb}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {money(pkg.priceAudMonthly)}
                    <span className="text-muted-foreground">/mo</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {pkg.postsPerMonth} posts · {pkg.campaignsPerMonth} camps ·{" "}
                    {Number.isInteger(pkg.promosIncludedPerMonth)
                      ? pkg.promosIncludedPerMonth
                      : Math.round(pkg.promosIncludedPerMonth * 100) / 100}{" "}
                    promos · {pkg.imageQuotaPerMonth} img · {pkg.videoQuotaPerMonth}{" "}
                    vid
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground">
                    {pkg.channels.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={pkg.active ? "success" : "neutral"}>
                        {pkg.active ? "Active" : "Inactive"}
                      </Badge>
                      {hasOverride ? (
                        <Badge tone="warning">Customised</Badge>
                      ) : (
                        <Badge tone="neutral">Default</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(pkg.id)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <PackageEditModal
          row={editing}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );
}
