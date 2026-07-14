import Link from "next/link";
import {
  isPlatformAdmin,
  isTenantOwner,
  requireAdmin,
} from "@/lib/auth/rbac";
import { getTenant, listTermsVersions } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { legalDocLabel } from "@/lib/terms";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import type { LegalDocKind, TermsVersion } from "@/lib/types";
import {
  publishLegalDocAction,
  resendLegalDocNotificationAction,
} from "./actions";

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
  const current = versions.find((v) => v.active);
  const defaultTitle = kind === "privacy" ? "Privacy Policy" : "Terms of Service";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-semibold">{label}</h2>
          {current && <Badge tone="success">current: v{current.version}</Badge>}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Publishing a new version forces every user to re-accept before they can keep using the
          app, and emails all active clients that the document changed.
          {!emailConfigured() && (
            <span className="text-amber-600">
              {" "}
              (Email isn&apos;t configured — RESEND_API_KEY unset — so notices are recorded but not
              sent.)
            </span>
          )}
        </p>
        <div className="mb-5 space-y-2">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
            >
              <div>
                <span className="font-medium">
                  v{v.version} — {v.title}
                </span>
                <p className="text-xs text-muted-foreground">
                  effective {formatDate(v.effectiveDate)} · published {formatDate(v.publishedAt)}
                  {v.notifiedAt
                    ? ` · emailed ${v.notifiedCount ?? 0} client(s)`
                    : " · not yet emailed"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={v.active ? "success" : "neutral"}>
                  {v.active ? "active" : "superseded"}
                </Badge>
                {v.active && canPublish && (
                  <form action={resendLegalDocNotificationAction}>
                    <input type="hidden" name="kind" value={kind} />
                    <button type="submit" className="text-xs text-primary hover:underline">
                      {v.notifiedAt ? "Resend email" : "Send email"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
          {versions.length === 0 && (
            <p className="text-sm text-muted-foreground">No {label.toLowerCase()} published yet.</p>
          )}
        </div>
        {canPublish ? (
          <details className="rounded-md border border-dashed border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Publish a new version</summary>
            <form action={publishLegalDocAction} className="mt-3 space-y-3">
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
              <Field label={`Full ${label.toLowerCase()} text`} htmlFor={`${kind}-body`}>
                <textarea
                  id={`${kind}-body`}
                  name="body"
                  required
                  rows={6}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                  placeholder={`Paste the full ${label.toLowerCase()} text…`}
                />
              </Field>
              <Button type="submit" size="sm">
                Publish new version
              </Button>
            </form>
          </details>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the agency owner (or a platform admin) can publish new versions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SettingsLegalPage() {
  const user = await requireAdmin();
  const tenant = await getTenant(user.tenantId);
  const owner = isTenantOwner(user);
  const platform = isPlatformAdmin(user);
  const canPublish = platform || (owner && tenant?.kind === "agency");

  const [termsVersions, privacyVersions] = await Promise.all([
    listTermsVersions("terms"),
    listTermsVersions("privacy"),
  ]);

  return (
    <div>
      <PageHeader
        title="Legal documents"
        description="Versioned Terms & Conditions and Privacy Policy. Publishing a new version emails clients and requires acceptance at next login."
      />
      <div className="space-y-2 px-6 pt-2 text-sm text-muted-foreground">
        <Link href="/settings" className="text-primary hover:underline">
          ← Settings
        </Link>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <LegalDocPanel kind="terms" versions={termsVersions} canPublish={canPublish} />
        <LegalDocPanel kind="privacy" versions={privacyVersions} canPublish={canPublish} />
      </div>
    </div>
  );
}
