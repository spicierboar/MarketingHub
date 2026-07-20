import Link from "next/link";
import { isTenantOwner, requireAdmin } from "@/lib/auth/rbac";
import { getTenant, listTermsVersions } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import {
  formatLegalDate,
  publicLegalHref,
  publicLegalPath,
  splitCurrentAndArchive,
} from "@/lib/legal-display";
import { canPublishLegalDocs, legalDocLabel } from "@/lib/terms";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type { LegalDocKind, TermsVersion } from "@/lib/types";
import {
  publishLegalDocAction,
  resendLegalDocNotificationAction,
} from "./actions";
import { LegalBodyEditor } from "./legal-body-editor";

function PublishForm({
  kind,
  label,
  defaultTitle,
}: {
  kind: LegalDocKind;
  label: string;
  defaultTitle: string;
}) {
  return (
    <form action={publishLegalDocAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor={`${kind}-title`} hint="Shown on the re-acceptance screen">
          <Input
            id={`${kind}-title`}
            name="title"
            required
            defaultValue={defaultTitle}
            placeholder={defaultTitle}
          />
        </Field>
        <Field label="Effective date" htmlFor={`${kind}-eff`} hint="When the new version takes effect">
          <Input id={`${kind}-eff`} name="effectiveDate" type="date" required />
        </Field>
      </div>
      <Field
        label="What changed (summary)"
        htmlFor={`${kind}-sum`}
        hint="Shown to users on re-acceptance + used in the update email."
      >
        <Input
          id={`${kind}-sum`}
          name="summary"
          placeholder={
            kind === "privacy"
              ? "e.g. Clarified retention and marketing consent."
              : "e.g. Updated billing + data-processing terms."
          }
        />
      </Field>
      <LegalBodyEditor kind={kind} label={label} />
      <Button type="submit" size="sm">
        Publish new version
      </Button>
    </form>
  );
}

function VersionRow({
  kind,
  version,
  canPublish,
  tone,
}: {
  kind: LegalDocKind;
  version: TermsVersion;
  canPublish: boolean;
  tone: "current" | "archive";
}) {
  const label = legalDocLabel(kind);
  return (
    <details className="rounded-md border border-border open:bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <span className="font-medium">
            v{version.version} — {version.title || label}
          </span>
          <p className="text-xs text-muted-foreground">
            effective {formatLegalDate(version.effectiveDate)} · published{" "}
            {formatLegalDate(version.publishedAt)}
            {version.notifiedAt
              ? ` · emailed ${version.notifiedCount ?? 0} client(s)`
              : " · not yet emailed"}
          </p>
        </div>
        <Badge tone={tone === "current" ? "success" : "neutral"}>
          {tone === "current" ? "current" : "archived"}
        </Badge>
      </summary>
      <div className="space-y-2 border-t border-border px-2.5 py-3">
        {version.summary && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">What changed: </span>
            {version.summary}
          </p>
        )}
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          {version.body}
        </pre>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={publicLegalHref(kind, tone === "archive" ? version.version : undefined)}
            className="text-xs text-primary hover:underline"
            target="_blank"
          >
            Open public page →
          </Link>
          {tone === "current" && canPublish && (
            <form action={resendLegalDocNotificationAction}>
              <input type="hidden" name="kind" value={kind} />
              <button type="submit" className="text-xs text-primary hover:underline">
                {version.notifiedAt ? "Resend email" : "Send email"}
              </button>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}

function LegalDocPanel({
  kind,
  versions,
  canPublish,
}: {
  kind: LegalDocKind;
  versions: TermsVersion[];
  canPublish: boolean;
}) {
  const label = legalDocLabel(kind);
  const { current, archive } = splitCurrentAndArchive(versions);
  const defaultTitle = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
  const nothingPublished = versions.length === 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{label}</h2>
          {current && <Badge tone="success">current: v{current.version}</Badge>}
          <Link
            href={publicLegalPath(kind)}
            className="text-xs text-primary hover:underline"
            target="_blank"
          >
            Public page →
          </Link>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Publishing a new version archives the previous one (with its effective and published
          dates), emails clients when configured, and requires re-acceptance at next login.
          {!emailConfigured() && (
            <span className="text-muted-foreground">
              {" "}
              Email delivery is optional — without EMAIL_SEND_LIVE=true and a configured
              RESEND_API_KEY, publish still works; notices are simulated and recorded.
            </span>
          )}
        </p>

        {!nothingPublished && (
          <div className="mb-5 space-y-4">
            {current && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Current
                </h3>
                <VersionRow
                  kind={kind}
                  version={current}
                  canPublish={canPublish}
                  tone="current"
                />
              </div>
            )}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Archive
              </h3>
              {archive.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No archived versions yet. Publishing again will move the current version here
                  with its dates.
                </p>
              ) : (
                <div className="space-y-2">
                  {archive.map((v) => (
                    <VersionRow
                      key={v.id}
                      kind={kind}
                      version={v}
                      canPublish={canPublish}
                      tone="archive"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {nothingPublished && !canPublish && (
          <p className="mb-5 text-sm text-muted-foreground">No {label.toLowerCase()} published yet.</p>
        )}

        {canPublish ? (
          nothingPublished ? (
            <div className="rounded-md border border-primary/30 bg-muted/30 p-4">
              <h3 className="mb-1 text-sm font-semibold">Publish the first {label}</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Paste the full document, optionally format with AI, then publish. Users will be asked
                to accept it on next sign-in.
              </p>
              <PublishForm kind={kind} label={label} defaultTitle={defaultTitle} />
            </div>
          ) : (
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Publish a new version</summary>
              <div className="mt-3">
                <PublishForm kind={kind} label={label} defaultTitle={defaultTitle} />
              </div>
            </details>
          )
        ) : (
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">You can&apos;t publish from this workspace</p>
            <p className="mt-1 text-muted-foreground">
              Platform Terms &amp; Privacy are published from the <strong>agency</strong> ops seat
              (agency owner/admin) or by a <strong>platform admin</strong>. If the header shows a
              client / holding workspace, switch to the agency seat (e.g. Staging Agency) via the
              workspace switcher, or sign in again with staging <code className="text-xs">/dev</code>{" "}
              quick-login. Client workspace owners can view versions but cannot publish.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SettingsLegalPage() {
  const user = await requireAdmin();
  // Heal kind/name + staging owner membership before gating the editors.
  const canPublish = await canPublishLegalDocs(user);
  const tenant = await getTenant(user.tenantId);
  const owner = isTenantOwner(user);

  let termsVersions: TermsVersion[] = [];
  let privacyVersions: TermsVersion[] = [];
  let schemaError: string | null = null;
  try {
    [termsVersions, privacyVersions] = await Promise.all([
      listTermsVersions("terms"),
      listTermsVersions("privacy"),
    ]);
  } catch (err) {
    schemaError = err instanceof Error ? err.message : "Failed to load legal documents.";
  }

  return (
    <div>
      <PageHeader
        title="Legal documents"
        description="Versioned Terms & Conditions and Privacy Policy. Publishing archives the prior version with its dates, emails clients, and requires acceptance at next login."
      />
      <div className="space-y-2 px-6 pt-2 text-sm text-muted-foreground">
        <Link href="/settings" className="text-primary hover:underline">
          ← Settings
        </Link>
      </div>
      {schemaError && (
        <div className="mx-6 mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-foreground">Database migration required</p>
          <p className="mt-1 text-muted-foreground">{schemaError}</p>
          {canPublish && (
            <p className="mt-2 text-xs text-muted-foreground">
              Editors are shown below, but publish will fail until 0046 is applied in Supabase.
            </p>
          )}
        </div>
      )}
      {!canPublish && (
        <div className="mx-6 mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium text-foreground">Publishing is limited</p>
          <p className="mt-1 text-muted-foreground">
            You&apos;re signed in as{" "}
            {owner
              ? `owner of “${tenant?.name ?? "this workspace"}” (${tenant?.kind ?? "unknown"} seat)`
              : "an admin (not the tenant owner)"}
            . To publish Terms or Privacy, use the <strong>platform agency</strong> owner account or a
            user with platform admin.
          </p>
        </div>
      )}
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <LegalDocPanel kind="terms" versions={termsVersions} canPublish={canPublish} />
        <LegalDocPanel kind="privacy" versions={privacyVersions} canPublish={canPublish} />
      </div>
    </div>
  );
}
