import { requirePortalUser } from "@/lib/auth/rbac";
import { listAssetsForCompany } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import { createClientAssetAction } from "./actions";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
};

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

function statusTone(status: string): "neutral" | "primary" | "success" | "warning" | "danger" | "info" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending_approval") return "warning";
  return "neutral";
}

/** Deep-link / Account sub-route — demoted from primary nav. Simplified file drop. */
export default async function ClientAssetsPage() {
  const { user, companyId } = await requirePortalUser();
  const assets = await listAssetsForCompany(companyId);
  const canStore = storageConfigured();

  return (
    <div>
      <PageHeader
        title="Your photos & files"
        explainerId="client-files"
        explainer="Share a photo or logo for us to review. We handle how it gets used in your marketing."
        parent={{ href: "/client/account", label: "Overview" }}
      />

      <div className="space-y-8 p-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Your files</h2>
          {assets.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No files yet. Share a photo below — we&apos;ll review it before using it.
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
                      {a.fileName ? `${a.fileName} · ` : ""}
                      Uploaded {formatDate(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone(a.status)}>
                      {STATUS_LABEL[a.status] ?? titleCase(a.status)}
                    </Badge>
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

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Share a photo</h2>
          <Card>
            <CardContent className="p-6">
              {!canStore ? (
                <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  File storage isn&apos;t set up yet — you can still register a name for us.
                </p>
              ) : null}
              <form action={createClientAssetAction} className="space-y-5">
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="assetType" value="image" />
                <Field
                  label="Name"
                  htmlFor="name"
                  hint="A short label so we recognise it"
                >
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="e.g. Storefront or product photo"
                  />
                </Field>
                <Field
                  label="File"
                  htmlFor="file"
                  hint={
                    canStore
                      ? "Optional — attach the image or document"
                      : "Unavailable until storage is configured"
                  }
                >
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    disabled={!canStore}
                    accept="image/*,video/*,.pdf"
                  />
                </Field>
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <Field
                    label="Confirmation email"
                    htmlFor="confirmationEmail"
                    hint="We record this with the date and file details as permanent evidence."
                  >
                    <Input
                      id="confirmationEmail"
                      name="confirmationEmail"
                      type="email"
                      value={user.email}
                      readOnly
                    />
                  </Field>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="rightsConfirmed"
                      required
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>
                      I confirm I own this file or have permission to use it for this
                      business’s marketing.
                    </span>
                  </label>
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
                  Signed in as {user.name}. New uploads stay pending until we approve them. Or{" "}
                  <Link href="/client/requests/new" className="text-primary hover:underline">
                    Ask us
                  </Link>{" "}
                  with a note.
                </p>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
