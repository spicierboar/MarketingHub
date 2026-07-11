"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { createAssetAction } from "@/app/(app)/assets/actions";

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
              <Field label="Client" htmlFor="modal-asset-company">
                <Select
                  id="modal-asset-company"
                  name="companyId"
                  required
                  defaultValue={defaultCompanyId ?? companies[0]?.id}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Folder" htmlFor="modal-asset-folder">
                <Input id="modal-asset-folder" name="folder" placeholder="Optional folder" />
              </Field>
            </div>
            <Field label="Asset name" htmlFor="modal-asset-name">
              <Input
                id="modal-asset-name"
                name="name"
                required
                placeholder="e.g. Family room — made up"
              />
            </Field>
            <Field label="Description" htmlFor="modal-asset-desc">
              <Textarea id="modal-asset-desc" name="description" className="min-h-16" />
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
              <Field label="File name" htmlFor="modal-asset-file">
                <Input id="modal-asset-file" name="fileName" placeholder="hero.jpg" />
              </Field>
              <Field label="External reference" htmlFor="modal-asset-ref">
                <Input
                  id="modal-asset-ref"
                  name="externalRef"
                  placeholder="https://canva.com/design/…"
                />
              </Field>
            </div>
            <Field label="Tags" htmlFor="modal-asset-tags">
              <Input id="modal-asset-tags" name="tags" placeholder="winter, hero" />
            </Field>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">Usage rights</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owner" htmlFor="modal-asset-owner">
                  <Input id="modal-asset-owner" name="owner" required placeholder="Who owns it" />
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
                <Field label="Licence reference" htmlFor="modal-asset-licref">
                  <Input id="modal-asset-licref" name="licenceRef" />
                </Field>
                <Field label="Consent reference" htmlFor="modal-asset-consent">
                  <Input id="modal-asset-consent" name="consentRef" placeholder="e.g. cons_dave" />
                </Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="consentObtained" className="h-4 w-4" />
                Consent obtained
              </label>
              <Field label="Allowed channels" htmlFor="modal-asset-channels" className="mt-3">
                <Textarea
                  id="modal-asset-channels"
                  name="allowedChannels"
                  className="min-h-16"
                  placeholder={"Facebook\nInstagram"}
                />
              </Field>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Expiry date" htmlFor="modal-asset-expiry">
                  <Input id="modal-asset-expiry" name="expiryDate" type="date" />
                </Field>
                <Field label="Restrictions" htmlFor="modal-asset-restrict">
                  <Input id="modal-asset-restrict" name="restrictions" />
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
