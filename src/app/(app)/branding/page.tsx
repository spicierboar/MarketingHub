import Link from "next/link";
import { requireTenantOwner } from "@/lib/auth/rbac";
import { getTenant } from "@/lib/db";
import { planIncludesWhiteLabel } from "@/lib/billing";
import { planFor } from "@/lib/plans";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { saveBrandingAction } from "./actions";

export default async function BrandingPage() {
  const user = await requireTenantOwner();
  const [tenant, available] = await Promise.all([
    getTenant(user.tenantId),
    planIncludesWhiteLabel(user.tenantId),
  ]);
  const b = tenant?.branding ?? {};
  const accent = b.accentColor || "#4f46e5";

  return (
    <div>
      <PageHeader
        title="White-label Branding"
        description="Make the workspace, client approval pages and emails your own. Applies across the app and to the no-login links your clients see."
      >
        <Badge tone={available ? "primary" : "neutral"}>
          {available ? "White-label enabled" : "Not in plan"}
        </Badge>
      </PageHeader>

      <div className="space-y-6 p-6">
        {!available && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            White-label branding isn&apos;t included in your{" "}
            {planFor(tenant?.plan).name} plan.{" "}
            <Link href="/billing" className="font-medium underline">
              Upgrade on the Billing page
            </Link>{" "}
            to brand the app, client approval pages and emails.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <form action={saveBrandingAction} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Accent colour (hex)" htmlFor="accentColor" hint="e.g. #0f766e — used across buttons, highlights and client pages.">
                    <Input id="accentColor" name="accentColor" defaultValue={b.accentColor ?? ""} placeholder="#4f46e5" disabled={!available} />
                  </Field>
                  <Field label="Email sender name" htmlFor="emailFromName" hint="Display name on approval + digest emails.">
                    <Input id="emailFromName" name="emailFromName" defaultValue={b.emailFromName ?? ""} placeholder="Your Agency" disabled={!available} />
                  </Field>
                </div>
                <Field label="Logo URL" htmlFor="logoUrl" hint="Link to a hosted logo image (shown in the sidebar and on client pages).">
                  <Input id="logoUrl" name="logoUrl" defaultValue={b.logoUrl ?? ""} placeholder="https://…/logo.png" disabled={!available} />
                </Field>
                <Field label="Client approval message" htmlFor="approvalMessage" hint="Optional note shown to clients above the content they're approving.">
                  <Input id="approvalMessage" name="approvalMessage" defaultValue={b.approvalMessage ?? ""} placeholder="Please review and approve this month's posts." disabled={!available} />
                </Field>
                <Button type="submit" disabled={!available}>Save branding</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Preview</h2>
              <div className="rounded-lg border border-border p-4" style={{ ["--primary" as string]: accent }}>
                <div className="mb-3 flex items-center gap-2.5">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                      {(b.emailFromName || tenant?.name || "MC").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-semibold">{tenant?.name}</span>
                </div>
                <div className="mb-2 h-2 w-3/4 rounded bg-primary" />
                <div className="mb-3 h-2 w-1/2 rounded bg-muted" />
                <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  Approve
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Clients see this branding on the no-login approval links you send them.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
