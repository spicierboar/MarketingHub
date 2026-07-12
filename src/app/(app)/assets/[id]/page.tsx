import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessCompany, isAdmin } from "@/lib/auth/rbac";
import { getAsset, getCompany, listContent } from "@/lib/db";
import {
  assetChannelBlockReason,
  assetUsableReason,
  licenceLabel,
} from "@/lib/assets";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate, now, titleCase } from "@/lib/utils";
import {
  approveAssetAction,
  archiveAssetAction,
  rejectAssetAction,
  submitAssetAction,
  updateAssetAction,
  uploadAssetMediaAction,
} from "../actions";
import { storageConfigured } from "@/lib/storage";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";

const LICENCES: [string, string][] = [
  ["owned", "Owned outright"],
  ["licensed", "Licensed / stock"],
  ["royalty_free", "Royalty-free"],
  ["user_generated", "User-generated (UGC)"],
  ["unknown", "Unknown"],
];
const ASSET_CHANNEL_OPTIONS = [
  ...CONTENT_PLATFORM_OPTIONS,
  { value: "Website", label: "Website" },
  { value: "In-store", label: "In-store" },
];
const CHECK_CHANNELS = ASSET_CHANNEL_OPTIONS.map((c) => c.value);

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const asset = await getAsset(id);
  if (!asset || !(await canAccessCompany(user, asset.companyId))) notFound();

  const company = (await getCompany(asset.companyId))!;
  const admin = isAdmin(user);
  const today = now().slice(0, 10);
  const r = asset.usageRights;
  const usableIssue = await assetUsableReason(asset, today);
  const editable = !["archived", "rejected"].includes(asset.status);
  const canSubmit = ["draft", "changes_required"].includes(asset.status);
  const awaitingApproval = asset.status === "pending_approval";

  const channelChecks = await Promise.all(
    CHECK_CHANNELS.map(async (ch) => ({
      ch,
      reason: await assetChannelBlockReason(asset, ch, today),
    })),
  );

  const referencing = (await listContent(user.tenantId)).filter((c) => c.assetIds?.includes(asset.id));

  return (
    <div>
      <PageHeader title={asset.name} description={`${company.name} · ${titleCase(asset.assetType)}`} hideExplainer>
        <Badge tone="info">{licenceLabel(r.licenceType)}</Badge>
        <StatusBadge status={asset.status} />
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {usableIssue && asset.status === "approved" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              ⚠ This approved asset is not currently usable: {usableIssue}. It will
              be blocked from every channel until resolved.
            </div>
          )}

          {/* Real-media DAM: the actual file */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Media</h2>
                {asset.storedFile && <Badge tone="success">File stored</Badge>}
              </div>
              {asset.storedFile && storageConfigured() ? (
                asset.storedFile.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${asset.id}`}
                    alt={asset.name}
                    className="max-h-80 w-auto rounded-md border border-border"
                  />
                ) : asset.storedFile.mimeType.startsWith("video/") ? (
                  <video
                    src={`/api/media/${asset.id}`}
                    controls
                    className="max-h-80 w-full rounded-md border border-border"
                  />
                ) : (
                  <a href={`/api/media/${asset.id}`} className="text-sm text-primary underline">
                    Download {asset.fileName ?? "file"}
                  </a>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  No file uploaded yet — this asset is metadata only.
                  {!storageConfigured() && " (Media storage isn't configured in this environment.)"}
                </p>
              )}
              {["draft", "changes_required", "pending_approval"].includes(asset.status) &&
                storageConfigured() && (
                  <form
                    action={uploadAssetMediaAction}
                    encType="multipart/form-data"
                    className="mt-4 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input
                      type="file"
                      name="file"
                      required
                      className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {asset.storedFile ? "Replace file" : "Upload file"}
                    </Button>
                  </form>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-6">
              {asset.description && <p className="text-sm">{asset.description}</p>}
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">{titleCase(asset.source)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Folder</dt>
                  <dd className="font-medium">{asset.folder ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">File</dt>
                  <dd className="font-medium">
                    {asset.fileName ?? "—"}
                    {asset.mimeType ? ` · ${asset.mimeType}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">External reference</dt>
                  <dd className="font-medium break-all">
                    {asset.externalRef ? (
                      asset.externalRef.startsWith("http") ? (
                        <a href={asset.externalRef} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          Open in {titleCase(asset.source)} →
                        </a>
                      ) : (
                        asset.externalRef
                      )
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {asset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {asset.tags.map((t) => (
                    <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage rights — the enforceable record */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Usage rights</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium">{r.owner || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Licence</dt>
                  <dd className="font-medium">
                    {licenceLabel(r.licenceType)}
                    {r.licenceRef ? ` · ${r.licenceRef}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Consent</dt>
                  <dd className="font-medium">
                    {r.consentObtained ? (
                      <span className="text-emerald-700">On file{r.consentRef ? ` (${r.consentRef})` : ""}</span>
                    ) : (
                      <span className="text-amber-700">Not obtained</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expiry</dt>
                  <dd className="font-medium">
                    {r.expiryDate ? (
                      <span className={r.expiryDate < today ? "text-red-700" : ""}>
                        {r.expiryDate}
                        {r.expiryDate < today ? " (expired)" : ""}
                      </span>
                    ) : (
                      "None"
                    )}
                  </dd>
                </div>
              </dl>
              {r.restrictions && (
                <p className="mt-3 text-sm">
                  <span className="text-muted-foreground">Restrictions: </span>
                  {r.restrictions}
                </p>
              )}
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Permitted channels
                </p>
                {r.allowedChannels.length === 0 ? (
                  <Badge tone="success">All channels</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {r.allowedChannels.map((c) => (
                      <Badge key={c} tone="warning">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {/* Live channel check — makes the server-side gate visible */}
              <div className="mt-4 rounded-md border border-dashed border-border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Channel eligibility (as of today)
                </p>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {channelChecks.map(({ ch, reason }) => (
                    <li key={ch} className="flex items-center gap-2">
                      {reason ? (
                        <span className="text-red-600">✗</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                      <span className={reason ? "text-muted-foreground" : ""}>{ch}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Edit metadata + rights */}
          {editable && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">
                  Edit{" "}
                  {asset.status === "approved" && (
                    <span className="text-xs font-normal text-muted-foreground">
                      (approved — saving returns it for re-approval)
                    </span>
                  )}
                </h2>
                <form action={updateAssetAction} className="space-y-4">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" hint="What the team will search for">
                      <Input
                        name="name"
                        defaultValue={asset.name}
                        placeholder="e.g. Family room — made up"
                      />
                    </Field>
                    <Field label="Folder" hint="Optional — e.g. Store photos, Brand">
                      <Input
                        name="folder"
                        defaultValue={asset.folder}
                        placeholder="e.g. Store photos"
                      />
                    </Field>
                  </div>
                  <Field label="Description" hint="Optional context for approvers">
                    <Textarea
                      name="description"
                      defaultValue={asset.description}
                      className="min-h-14"
                      placeholder="e.g. Hero shot for winter campaign"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="External reference" hint="Canva/Figma URL or stock id">
                      <Input
                        name="externalRef"
                        defaultValue={asset.externalRef}
                        placeholder="https://canva.com/design/…"
                      />
                    </Field>
                    <Field label="Tags" hint="Comma or newline separated">
                      <Input
                        name="tags"
                        defaultValue={asset.tags.join(", ")}
                        placeholder="winter, hero, butcher"
                      />
                    </Field>
                  </div>
                  <hr className="border-border" />
                  <p className="text-sm font-medium">Usage rights</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Owner" hint="Who owns or supplied it">
                      <Input
                        name="owner"
                        defaultValue={r.owner}
                        required
                        placeholder="e.g. Client / Photographer name"
                      />
                    </Field>
                    <Field label="Licence">
                      <Select name="licenceType" defaultValue={r.licenceType}>
                        {LICENCES.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Licence reference" hint="Contract or stock licence id">
                      <Input
                        name="licenceRef"
                        defaultValue={r.licenceRef}
                        placeholder="e.g. INV-2041 / Shutterstock #…"
                      />
                    </Field>
                    <Field
                      label="Consent reference"
                      hint="Consent Register id — must match a live record"
                    >
                      <Input
                        name="consentRef"
                        defaultValue={r.consentRef}
                        placeholder="e.g. cons_dave"
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="consentObtained"
                      defaultChecked={r.consentObtained}
                      className="h-4 w-4"
                    />
                    Consent obtained
                  </label>
                  <Field
                    label="Allowed channels"
                    hint="Leave all unchecked to permit every channel"
                  >
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {ASSET_CHANNEL_OPTIONS.map((ch) => (
                        <label
                          key={ch.value}
                          className="inline-flex items-center gap-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="allowedChannels"
                            value={ch.value}
                            defaultChecked={r.allowedChannels.includes(ch.value)}
                            className="h-4 w-4"
                          />
                          {ch.label}
                        </label>
                      ))}
                      {r.allowedChannels
                        .filter(
                          (c) => !ASSET_CHANNEL_OPTIONS.some((o) => o.value === c),
                        )
                        .map((c) => (
                          <label
                            key={c}
                            className="inline-flex items-center gap-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="allowedChannels"
                              value={c}
                              defaultChecked
                              className="h-4 w-4"
                            />
                            {c}
                          </label>
                        ))}
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Expiry date" hint="On/after this date the asset is blocked">
                      <Input
                        name="expiryDate"
                        type="date"
                        defaultValue={r.expiryDate}
                      />
                    </Field>
                    <Field label="Restrictions">
                      <Input
                        name="restrictions"
                        defaultValue={r.restrictions}
                        placeholder="e.g. Website only; no paid ads"
                      />
                    </Field>
                  </div>
                  <Button type="submit" variant="outline">
                    Save changes
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <form action={submitAssetAction}>
                <input type="hidden" name="assetId" value={asset.id} />
                <Button type="submit">Submit for approval</Button>
              </form>
            )}
            {editable && (
              <form action={archiveAssetAction}>
                <input type="hidden" name="assetId" value={asset.id} />
                <Button type="submit" variant="ghost">
                  Archive
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {admin && awaitingApproval && (
            <Card className="border-primary/40">
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Creative approval</h2>
                {usableIssue && (
                  <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                    Resolve before approving: {usableIssue}.
                  </p>
                )}
                <form action={approveAssetAction} className="mb-3">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <Button type="submit" className="w-full">
                    Approve for use
                  </Button>
                </form>
                <form action={rejectAssetAction} className="space-y-2">
                  <input type="hidden" name="assetId" value={asset.id} />
                  <Textarea name="note" placeholder="Reason / changes needed…" className="min-h-16" />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="changesOnly" className="h-4 w-4" />
                    Request changes (return to editor)
                  </label>
                  <Button type="submit" variant="destructive" className="w-full">
                    Reject
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Referenced by</h2>
              {referencing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No content references this asset yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {referencing.map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link href={`/content/${c.id}`} className="text-primary hover:underline">
                        {c.title}
                      </Link>{" "}
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Provenance</h2>
              <dl className="space-y-2 text-sm">
                {asset.aiModel && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">AI model</dt>
                    <dd className="text-right font-medium">{asset.aiModel}</dd>
                  </div>
                )}
                {asset.estCostUsd !== undefined && asset.estCostUsd > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Est. AI cost</dt>
                    <dd className="font-medium">${asset.estCostUsd.toFixed(4)}</dd>
                  </div>
                )}
                {asset.sourcesUsed && asset.sourcesUsed.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Sources</dt>
                    <dd className="mt-1 font-medium">{asset.sourcesUsed.join(" · ")}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDate(asset.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="font-medium">{formatDate(asset.updatedAt)}</dd>
                </div>
                {asset.approvedAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Approved</dt>
                    <dd className="font-medium">{formatDate(asset.approvedAt)}</dd>
                  </div>
                )}
              </dl>
              <Link href="/assets" className="mt-4 inline-block text-sm text-primary hover:underline">
                ← All assets
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
