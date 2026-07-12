import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { saveClientProfileAction } from "./actions";

/**
 * Wave A — contact / hours only. Brand Brain strategy fields are agency-only.
 * Route kept for deep links from Account; not in primary nav.
 */
export default async function ClientProfilePage() {
  const { companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Company not found.</div>
    );
  }

  const p = company.profile;

  return (
    <div>
      <PageHeader
        title="Contact & hours"
        explainerId="client-profile"
        explainer="Rare corrections only. Brand voice, audience, and social strategy stay with your agency — Ask us if those need updating."
      />
      <ClientAccountLinks />

      <div className="space-y-6 p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Locked identity</h2>
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  ABN
                </p>
                <p className="mt-1 text-sm font-medium">
                  {p.abn?.trim() || "Not on file"}
                </p>
                <Badge tone="neutral" className="mt-2">
                  Cannot change here
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Legal name
                </p>
                <p className="mt-1 text-sm font-medium">
                  {p.legalName?.trim() || "Not on file"}
                </p>
                <Badge tone="neutral" className="mt-2">
                  Cannot change here
                </Badge>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Need an ABN or legal-name correction?{" "}
            <Link href="/client/requests/new" className="text-primary hover:underline">
              Ask us
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Details you can update</h2>
          <Card>
            <CardContent className="p-6">
              <form action={saveClientProfileAction} className="space-y-5">
                <input type="hidden" name="companyId" value={companyId} />

                <Field
                  label="Display name"
                  htmlFor="displayName"
                  hint="How your business appears in the portal"
                >
                  <Input
                    id="displayName"
                    name="displayName"
                    defaultValue={company.name}
                    required
                    placeholder="e.g. Harbourview Café"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website" htmlFor="website" hint="Your public site URL">
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      defaultValue={p.website ?? ""}
                      placeholder="https://www.harbourviewcafe.com.au"
                    />
                  </Field>
                  <Field
                    label="Approval / billing contact"
                    htmlFor="approvalContact"
                    hint="Who we email for approvals and billing"
                  >
                    <Input
                      id="approvalContact"
                      name="approvalContact"
                      defaultValue={p.approvalContact ?? ""}
                      placeholder="owner@harbourviewcafe.com.au"
                    />
                  </Field>
                </div>

                <Field
                  label="Trading hours"
                  htmlFor="tradingHours"
                  hint="Plain text is fine — used in posts and local listings"
                >
                  <Textarea
                    id="tradingHours"
                    name="tradingHours"
                    rows={3}
                    defaultValue={p.tradingHours ?? ""}
                    placeholder="Mon–Fri 7am–3pm, Sat 8am–2pm, closed Sun"
                  />
                </Field>

                <Button type="submit">Save changes</Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
