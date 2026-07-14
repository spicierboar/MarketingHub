import { requirePlatformAdmin } from "@/lib/auth/rbac";
import { listTermsVersions } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import {
  createClientWorkspaceAction,
  publishTermsVersionAction,
  resendTermsNotificationAction,
} from "./actions";

// Platform-operator surface (NOT tenant data) — curate terms + provision client
// workspaces. Gated to the platformAdmin flag.
export default async function PlatformAdminPage() {
  await requirePlatformAdmin();
  const versions = await listTermsVersions("terms");
  const current = versions.find((v) => v.active);

  return (
    <div>
      <PageHeader
        title="Platform admin"
        description="Publish Terms & Conditions and provision client workspaces. Platform-operator only — no tenant data is shown here. Privacy Policy and full legal editors live under Settings → Terms & Privacy Policy."
      />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Terms & Conditions */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">Terms &amp; Conditions</h2>
              {current && <Badge tone="success">current: v{current.version}</Badge>}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Publishing a new version forces <span className="font-medium">every user</span> to re-accept
              before they can keep using the app, and emails all active clients that the terms changed.
              {!emailConfigured() && <span className="text-amber-600"> (Email isn&apos;t configured — RESEND_API_KEY unset — so notices are recorded but not sent.)</span>}
            </p>
            <div className="mb-5 space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                  <div>
                    <span className="font-medium">v{v.version} — {v.title}</span>
                    <p className="text-xs text-muted-foreground">
                      effective {formatDate(v.effectiveDate)} · published {formatDate(v.publishedAt)}
                      {v.notifiedAt ? ` · emailed ${v.notifiedCount ?? 0} client(s)` : " · not yet emailed"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={v.active ? "success" : "neutral"}>{v.active ? "active" : "superseded"}</Badge>
                    {v.active && (
                      <form action={resendTermsNotificationAction}>
                        <button type="submit" className="text-xs text-primary hover:underline">{v.notifiedAt ? "Resend email" : "Send email"}</button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {versions.length === 0 && <p className="text-sm text-muted-foreground">No terms published yet.</p>}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Publish a new version</summary>
              <form action={publishTermsVersionAction} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" htmlFor="t-title" hint="Shown on the re-acceptance screen">
                    <Input
                      id="t-title"
                      name="title"
                      required
                      defaultValue="Terms of Service"
                      placeholder="e.g. Terms of Service"
                    />
                  </Field>
                  <Field label="Effective date" htmlFor="t-eff" hint="When the new terms take effect">
                    <Input id="t-eff" name="effectiveDate" type="date" required />
                  </Field>
                </div>
                <Field label="What changed (summary)" htmlFor="t-sum" hint="Shown to users on re-acceptance + used in the update email.">
                  <Input id="t-sum" name="summary" placeholder="e.g. Updated billing + data-processing terms." />
                </Field>
                <Field label="Full terms text" htmlFor="t-body">
                  <textarea
                    id="t-body"
                    name="body"
                    required
                    rows={6}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                    placeholder="Paste the full terms text…"
                  />
                </Field>
                <Button type="submit" size="sm">Publish new version</Button>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Provision a client workspace (agency-assisted onboarding) */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Provision a client workspace</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Set up a client on their behalf. They&apos;ll finish onboarding themselves —
              entering their own card (via Stripe) and accepting the terms — on first sign-in.
            </p>
            <form action={createClientWorkspaceAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Business name" htmlFor="c-name">
                  <Input id="c-name" name="companyName" required placeholder="e.g. Acme Café" />
                </Field>
                <Field label="Workspace type" htmlFor="c-kind">
                  <Select id="c-kind" name="kind" defaultValue="business_group">
                    <option value="business_group">Business group</option>
                    <option value="agency">Agency</option>
                  </Select>
                </Field>
                <Field label="Owner contact name" htmlFor="c-contact">
                  <Input id="c-contact" name="contactName" required placeholder="e.g. Jane Smith" />
                </Field>
                <Field label="Owner email" htmlFor="c-email">
                  <Input
                    id="c-email"
                    name="contactEmail"
                    type="email"
                    required
                    placeholder="e.g. jane@acme.example"
                  />
                </Field>
                <Field label="Plan" htmlFor="c-plan">
                  <Select id="c-plan" name="plan" defaultValue="starter">
                    {PLAN_ORDER.map((id) => (
                      <option key={id} value={id}>{PLANS[id].name} — ${PLANS[id].priceAudMonthly}/mo</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" size="sm">Create client workspace</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
