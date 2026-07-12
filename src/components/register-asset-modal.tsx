"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { LockedCompanyField } from "@/components/locked-company-field";
import { createAssetAction } from "@/app/(app)/assets/actions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";

const ASSET_TYPES: [string, string][] = [
  ["image", "Image"],
  ["logo", "Logo"],
  ["video", "Video"],
  ["graphic", "Graphic"],
  ["document", "Document"],
  ["audio", "Audio"],
];
const SOURCES: [string, string][] = [
  ["upload", "Upload"],
  ["canva", "Canva"],
  ["figma", "Figma"],
  ["stock", "Stock library"],
  ["ai_generated", "AI-generated"],
];
const LICENCES: [string, string][] = [
  ["owned", "Owned outright"],
  ["licensed", "Licensed / stock"],
  ["royalty_free", "Royalty-free"],
  ["user_generated", "User-generated (UGC)"],
  ["unknown", "Unknown"],
];

/** Allowed-channel checkboxes — content platforms + common offline/web. */
const ASSET_CHANNEL_OPTIONS = [
  ...CONTENT_PLATFORM_OPTIONS,
  { value: "Website", label: "Website" },
  { value: "In-store", label: "In-store" },
];

export function RegisterAssetModalTrigger({
  companies,
  defaultCompanyId,
  label = "Register asset",
  size = "sm",
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);

  if (companies.length === 0) {
    return (
      <Button type="button" size={size} variant="outline" disabled>
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button type="button" size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <FormModal
          title="Register asset"
          description="Record metadata and usage rights. Bytes aren't stored — link via Canva/Figma or a reference."
          onClose={() => setOpen(false)}
          wide
        >
          <form action={createAssetAction} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <LockedCompanyField
                id="modal-asset-company"
                companies={companies}
                companyId={defaultCompanyId}
                locked={Boolean(defaultCompanyId)}
              />
              <Field
                label="Folder"
                htmlFor="modal-asset-folder"
                hint="Optional — e.g. Store photos, Brand, Video"
              >
                <Input
                  id="modal-asset-folder"
                  name="folder"
                  placeholder="e.g. Store photos"
                />
              </Field>
            </div>
            <Field
              label="Asset name"
              htmlFor="modal-asset-name"
              hint="What the team will search for in the library"
            >
              <Input
                id="modal-asset-name"
                name="name"
                required
                placeholder="e.g. Family room — made up"
              />
            </Field>
            <Field
              label="Description"
              htmlFor="modal-asset-desc"
              hint="Optional context for approvers"
            >
              <Textarea
                id="modal-asset-desc"
                name="description"
                className="min-h-16"
                placeholder="e.g. Hero shot for winter campaign — no people in frame"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="modal-asset-type">
                <Select id="modal-asset-type" name="assetType" defaultValue="image">
                  {ASSET_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source" htmlFor="modal-asset-source">
                <Select id="modal-asset-source" name="source" defaultValue="upload">
                  {SOURCES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="File name"
                htmlFor="modal-asset-file"
                hint="Reference only — bytes not stored here"
              >
                <Input id="modal-asset-file" name="fileName" placeholder="hero.jpg" />
              </Field>
              <Field
                label="External reference"
                htmlFor="modal-asset-ref"
                hint="Canva/Figma edit URL or stock id"
              >
                <Input
                  id="modal-asset-ref"
                  name="externalRef"
                  placeholder="https://canva.com/design/…"
                />
              </Field>
            </div>
            <Field
              label="Tags"
              htmlFor="modal-asset-tags"
              hint="Comma-separated — helps search"
            >
              <Input
                id="modal-asset-tags"
                name="tags"
                placeholder="winter, hero, butcher"
              />
            </Field>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">Usage rights</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Owner"
                  htmlFor="modal-asset-owner"
                  hint="Who owns or supplied it"
                >
                  <Input
                    id="modal-asset-owner"
                    name="owner"
                    required
                    placeholder="e.g. Client / Photographer name"
                  />
                </Field>
                <Field label="Licence" htmlFor="modal-asset-licence">
                  <Select id="modal-asset-licence" name="licenceType" defaultValue="owned">
                    {LICENCES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Licence reference"
                  htmlFor="modal-asset-licref"
                  hint="Contract, invoice, or stock licence id"
                >
                  <Input
                    id="modal-asset-licref"
                    name="licenceRef"
                    placeholder="e.g. INV-2041 / Shutterstock #…"
                  />
                </Field>
                <Field
                  label="Consent reference"
                  htmlFor="modal-asset-consent"
                  hint="Consent Register id — leave blank if none"
                >
                  <Input
                    id="modal-asset-consent"
                    name="consentRef"
                    placeholder="e.g. cons_dave"
                  />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="consentObtained" className="h-4 w-4" />
                Consent obtained (required for recognisable people / UGC)
              </label>
              <Field
                label="Allowed channels"
                htmlFor="modal-asset-channels"
                className="mt-3"
                hint="Leave all unchecked to permit every channel"
              >
                <div
                  id="modal-asset-channels"
                  className="flex flex-wrap gap-x-4 gap-y-2"
                >
                  {ASSET_CHANNEL_OPTIONS.map((ch) => (
                    <label
                      key={ch.value}
                      className="inline-flex items-center gap-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="allowedChannels"
                        value={ch.value}
                        className="h-4 w-4"
                      />
                      {ch.label}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Expiry date"
                  htmlFor="modal-asset-expiry"
                  hint="On/after this date the asset is blocked"
                >
                  <Input id="modal-asset-expiry" name="expiryDate" type="date" />
                </Field>
                <Field
                  label="Restrictions"
                  htmlFor="modal-asset-restrict"
                  hint="Anything rights don't cover"
                >
                  <Input
                    id="modal-asset-restrict"
                    name="restrictions"
                    placeholder="e.g. Website only; no paid ads"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Register asset</Button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
