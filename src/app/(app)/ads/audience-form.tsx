"use client";

// Audience-targeting editor (Module 6/7). A small client component so the
// operator can add/remove geo rows dynamically; everything else is plain form
// fields. Locations are serialised to a single hidden `locationsJson` field
// (the server action parses + normalises it). Works for both create (no
// segmentId) and edit (segmentId + prefilled values).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { saveAudienceSegmentAction } from "./actions";
import type { AdTargeting, GeoTarget, GeoTargetKind } from "@/lib/types";

const GEO_KINDS: { value: GeoTargetKind; label: string }[] = [
  { value: "radius", label: "Radius around" },
  { value: "city", label: "City" },
  { value: "region", label: "State / region" },
  { value: "country", label: "Country" },
  { value: "postcode", label: "Postcode" },
];

const joinList = (xs: string[] | undefined) => (xs ?? []).join(", ");

export function AudienceForm({
  companyId,
  segmentId,
  name,
  platform,
  targeting,
  onCancelHref,
}: {
  companyId: string;
  segmentId?: string;
  name?: string;
  platform?: string;
  targeting?: AdTargeting;
  onCancelHref?: string;
}) {
  const [locations, setLocations] = useState<GeoTarget[]>(
    targeting?.locations?.length ? targeting.locations : [{ kind: "radius", value: "", radiusKm: 10 }],
  );

  const setRow = (i: number, patch: Partial<GeoTarget>) =>
    setLocations((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setLocations((rows) => [...rows, { kind: "city", value: "" }]);
  const removeRow = (i: number) => setLocations((rows) => rows.filter((_, idx) => idx !== i));

  // Only send locations that have a value; keep radiusKm/exclude tidy.
  const cleanLocations = locations
    .filter((l) => l.value.trim() !== "")
    .map((l) => ({
      kind: l.kind,
      value: l.value.trim(),
      ...(l.kind === "radius" ? { radiusKm: Number(l.radiusKm) || 10 } : {}),
      ...(l.exclude ? { exclude: true } : {}),
    }));

  return (
    <form action={saveAudienceSegmentAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {segmentId && <input type="hidden" name="segmentId" value={segmentId} />}
      <input type="hidden" name="locationsJson" value={JSON.stringify(cleanLocations)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience name" htmlFor="af-name">
          <Input id="af-name" name="name" required defaultValue={name} placeholder="e.g. Local shoppers 8km" />
        </Field>
        <Field label="Applies to platform" htmlFor="af-platform">
          <Select id="af-platform" name="platform" defaultValue={platform ?? "all"}>
            <option value="all">All platforms</option>
            <option value="meta_ads">Meta Ads only</option>
            <option value="google_ads">Google Ads only</option>
          </Select>
        </Field>
      </div>

      {/* Geography */}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Locations</p>
        <div className="space-y-2">
          {locations.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <select
                value={l.kind}
                onChange={(e) => setRow(i, { kind: e.target.value as GeoTargetKind })}
                className="h-8 rounded-md border border-input bg-card px-2 text-sm"
              >
                {GEO_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
              <input
                value={l.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
                placeholder={l.kind === "radius" ? "e.g. Bondi Beach NSW" : l.kind === "postcode" ? "e.g. 2026" : "e.g. Sydney"}
                className="h-8 flex-1 min-w-[8rem] rounded-md border border-input bg-card px-2 text-sm"
              />
              {l.kind === "radius" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={l.radiusKm ?? 10}
                    onChange={(e) => setRow(i, { radiusKm: Number(e.target.value) })}
                    className="h-8 w-16 rounded-md border border-input bg-card px-2 text-sm"
                  />
                  km
                </span>
              )}
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!l.exclude}
                  onChange={(e) => setRow(i, { exclude: e.target.checked })}
                />
                exclude
              </label>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-muted-foreground hover:text-red-600"
                aria-label="Remove location"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow} className="mt-2 text-xs font-medium text-primary hover:underline">
          + Add location
        </button>
      </div>

      {/* Demographics */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Age min" htmlFor="af-agemin" hint="Platform floor is usually 13">
          <Input
            id="af-agemin"
            name="ageMin"
            type="number"
            min={13}
            max={65}
            defaultValue={targeting?.ageMin ?? 18}
            placeholder="18"
          />
        </Field>
        <Field label="Age max" htmlFor="af-agemax">
          <Input
            id="af-agemax"
            name="ageMax"
            type="number"
            min={13}
            max={65}
            defaultValue={targeting?.ageMax ?? 65}
            placeholder="65"
          />
        </Field>
        <Field label="Gender" htmlFor="af-gender">
          <Select id="af-gender" name="gender" defaultValue={targeting?.gender ?? "all"}>
            <option value="all">All</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Devices" htmlFor="af-devices">
          <Select id="af-devices" name="devices" defaultValue={targeting?.devices ?? "all"}>
            <option value="all">All devices</option>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="tablet">Tablet</option>
          </Select>
        </Field>
      </div>

      {/* Interests / audiences (comma or newline separated) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Interests" htmlFor="af-interests" hint="Comma-separated. Meta detailed targeting / Google affinity & in-market.">
          <Input id="af-interests" name="interests" defaultValue={joinList(targeting?.interests)} placeholder="coffee, brunch, local deals" />
        </Field>
        <Field label="Languages" htmlFor="af-languages" hint="Comma-separated.">
          <Input id="af-languages" name="languages" defaultValue={joinList(targeting?.languages)} placeholder="English" />
        </Field>
        <Field label="Custom / lookalike audiences" htmlFor="af-custom" hint="By name/id — the client's own audiences at the platform. No customer lists stored here.">
          <Input id="af-custom" name="customAudiences" defaultValue={joinList(targeting?.customAudiences)} placeholder="Website visitors 30d, Lookalike 1%" />
        </Field>
        <Field label="Exclusions" htmlFor="af-excl" hint="Comma-separated interests/audiences to exclude.">
          <Input id="af-excl" name="exclusions" defaultValue={joinList(targeting?.exclusions)} placeholder="Existing customers" />
        </Field>
        <Field label="Placements" htmlFor="af-place" hint="Optional. Blank = automatic. e.g. feed, stories, reels, search, display, youtube.">
          <Input id="af-place" name="placements" defaultValue={joinList(targeting?.placements)} placeholder="feed, stories, reels" />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">{segmentId ? "Save audience" : "Create audience"}</Button>
        {onCancelHref && (
          <a href={onCancelHref} className="text-xs text-muted-foreground hover:underline">Cancel</a>
        )}
      </div>
    </form>
  );
}
