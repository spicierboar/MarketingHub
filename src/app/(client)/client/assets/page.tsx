import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, listAssetsForCompany } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClientAssetAction } from "./actions";

const ASSET_TYPES: [string, string][] = [
  ["image", "Image"],
  ["logo", "Logo"],
  ["video", "Video"],
  ["graphic", "Graphic"],
  ["document", "Document"],
  ["audio", "Audio"],
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export default async function ClientAssetsPage() {
  const { user, companyId } = await requirePortalUser();
  const [company, assets] = await Promise.all([
    getCompany(companyId),
    listAssetsForCompany(companyId),
  ]);
  const canStore = storageConfigured();

  return (
    <div>
      <PageHeader
        title="Assets"
        description={`Photos, logos and files for ${company?.name ?? "your business"}. Uploads go to your agency for review before use.`}
      />

      <div className="space-y-8 p-6">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Your assets</h2>
          {assets.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No assets yet. Upload a photo or logo below — your agency will review it before it
                appears in marketing.
              </CardContent>
            </Card>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {assets.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-muted-foreground">
                      {a.assetType}
                      {a.fileName ? ` · ${a.fileName}` : ""}
                      {" · "}
                      Uploaded {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.status} />
                    {a.storedFile ? (
                      <a
                        href={`/api/media/${a.id}`}
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.storedFile.mimeType.startsWith("image/") ? "View" : "Download"}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">No file</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Upload an asset</h2>
          <Card>
            <CardContent className="p-6">
              {!canStore ? (
                <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  File storage isn&apos;t configured yet — you can still register an asset name for
                  your agency, but the file itself can&apos;t be uploaded until storage is set up.
                </p>
              ) : null}
              <form action={createClientAssetAction} className="space-y-5">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" htmlFor="name">
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="e.g. Shopfront photo"
                    defaultValue=""
                  />
                </Field>
                <Field label="Description" htmlFor="description">
                  <Textarea
                    id="description"
                    name="description"
                    className="min-h-16"
                    placeholder="Optional notes for your agency"
                  />
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
                  <Field
                    label="File"
                    htmlFor="file"
                    hint={canStore ? "Optional — attach the image or document" : "Unavailable until storage is configured"}
                  >
                    <Input
                      id="file"
                      name="file"
                      type="file"
                      disabled={!canStore}
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    />
                  </Field>
                </div>
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    name="consentObtained"
                    className="mt-0.5 h-4 w-4 rounded border-input"
                  />
                  <span>
                    If people appear in this file, I confirm we have their consent to use it in
                    marketing.
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button type="submit">Submit for review</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Signed in as {user.name}. New uploads stay pending until your agency approves them.
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
