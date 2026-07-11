import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createAssetAction } from "../actions";

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

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const companies = await visibleCompanies(user);
  const { company: preCompany } = await searchParams;

  return (
    <div>
      <PageHeader
        title="Register asset"
        description="Record an asset's metadata and usage rights. Bytes aren't stored — link the file via Canva/Figma or a stored reference."
      >
        <Link href="/assets" className="text-sm text-primary hover:underline">
          ← Back to assets
        </Link>
      </PageHeader>

      {companies.length === 0 ? (
        <div className="p-6">
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You have no companies to add assets to.
            </CardContent>
          </Card>
        </div>
      ) : (
        <form action={createAssetAction} className="mx-auto max-w-3xl space-y-6 p-6">
          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="font-semibold">Asset details</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Client" htmlFor="companyId">
                  <Select id="companyId" name="companyId" required defaultValue={preCompany}>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Folder" htmlFor="folder" hint="e.g. Store photos, Brand, Video">
                  <Input id="folder" name="folder" placeholder="Optional folder" />
                </Field>
              </div>
              <Field label="Asset name" htmlFor="name">
                <Input id="name" name="name" required placeholder="e.g. Family room — made up" />
              </Field>
              <Field label="Description" htmlFor="description">
                <Textarea id="description" name="description" className="min-h-16" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Type" htmlFor="assetType">
                  <Select id="assetType" name="assetType" defaultValue="image">
                    {ASSET_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Source" htmlFor="source">
                  <Select id="source" name="source" defaultValue="upload">
                    {SOURCES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="File name" htmlFor="fileName" hint="Reference only — bytes not stored">
                  <Input id="fileName" name="fileName" placeholder="hero.jpg" />
                </Field>
                <Field label="External reference" htmlFor="externalRef" hint="Canva/Figma edit URL or stock id">
                  <Input id="externalRef" name="externalRef" placeholder="https://canva.com/design/…" />
                </Field>
              </div>
              <Field label="Tags" htmlFor="tags" hint="Comma or newline separated">
                <Input id="tags" name="tags" placeholder="winter, hero, butcher" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-6">
              <div>
                <h2 className="font-semibold">Usage rights</h2>
                <p className="text-sm text-muted-foreground">
                  Required for compliance — an asset can&apos;t be used in a channel its
                  rights don&apos;t allow.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Owner" htmlFor="owner">
                  <Input id="owner" name="owner" required placeholder="Who owns / supplied it" />
                </Field>
                <Field label="Licence" htmlFor="licenceType">
                  <Select id="licenceType" name="licenceType" defaultValue="owned">
                    {LICENCES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Licence reference" htmlFor="licenceRef">
                  <Input id="licenceRef" name="licenceRef" placeholder="Licence / contract / stock id" />
                </Field>
                <Field label="Consent reference" htmlFor="consentRef" hint="Consent Register id — must match a live record (leave blank if none)">
                  <Input id="consentRef" name="consentRef" placeholder="e.g. cons_dave" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="consentObtained" className="h-4 w-4" />
                Consent obtained (required for anyone/anything recognisable, and for UGC)
              </label>
              <Field
                label="Allowed channels"
                htmlFor="allowedChannels"
                hint="One per line. Leave blank to permit all channels."
              >
                <Textarea
                  id="allowedChannels"
                  name="allowedChannels"
                  className="min-h-16"
                  placeholder={"Facebook\nInstagram\nWebsite"}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Expiry date" htmlFor="expiryDate" hint="On/after this date the asset is blocked">
                  <Input id="expiryDate" name="expiryDate" type="date" />
                </Field>
                <Field label="Restrictions" htmlFor="restrictions">
                  <Input id="restrictions" name="restrictions" placeholder="e.g. Website only; no paid ads" />
                </Field>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Register asset</Button>
          </div>
        </form>
      )}
    </div>
  );
}
