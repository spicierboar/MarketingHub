import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { SOCIAL_PLATFORMS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { saveClientProfileAction } from "./actions";

function listValue(items: string[] | undefined): string {
  return (items ?? []).join("\n");
}

function socialUrl(
  links: { platform: string; url: string }[] | undefined,
  platform: string,
): string {
  return links?.find((l) => l.platform === platform)?.url ?? "";
}

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
        title="Business profile"
        description="Update details that change over time. Legal identity (ABN, legal name) is locked — ask your agency if those need correcting. One ABN can cover several businesses; each location/brand is its own record."
      />

      <div className="space-y-8 p-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Locked identity</h2>
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  ABN
                </p>
                <p className="mt-1 text-sm font-medium">
                  {p.abn?.trim() || "Not on file"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shared legal entity — not unique to this business
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
              {p.businessType ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Business type
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {p.businessType.replace(/_/g, " ")}
                  </p>
                  <Badge tone="neutral" className="mt-2">
                    Agency-managed
                  </Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Need an ABN or legal-name correction? Use Ask us — your agency will update
            the record.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Details you can update</h2>
          <Card>
            <CardContent className="p-6">
              <form action={saveClientProfileAction} className="space-y-5">
                <input type="hidden" name="companyId" value={companyId} />

                <Field label="Display name" htmlFor="displayName">
                  <Input
                    id="displayName"
                    name="displayName"
                    defaultValue={company.name}
                    required
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Trading name(s)" htmlFor="tradingNames">
                    <Input
                      id="tradingNames"
                      name="tradingNames"
                      defaultValue={p.tradingNames ?? ""}
                    />
                  </Field>
                  <Field label="Industry" htmlFor="industry">
                    <Input
                      id="industry"
                      name="industry"
                      defaultValue={p.industry ?? ""}
                    />
                  </Field>
                  <Field label="Website" htmlFor="website">
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      defaultValue={p.website ?? ""}
                      placeholder="https://"
                    />
                  </Field>
                  <Field label="Approval / billing contact" htmlFor="approvalContact">
                    <Input
                      id="approvalContact"
                      name="approvalContact"
                      defaultValue={p.approvalContact ?? ""}
                      placeholder="email or phone"
                    />
                  </Field>
                </div>

                <Field label="Nature of business" htmlFor="natureOfBusiness">
                  <Textarea
                    id="natureOfBusiness"
                    name="natureOfBusiness"
                    rows={3}
                    defaultValue={p.natureOfBusiness ?? ""}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Service areas (one per line)"
                    htmlFor="serviceAreas"
                  >
                    <Textarea
                      id="serviceAreas"
                      name="serviceAreas"
                      rows={4}
                      defaultValue={listValue(p.serviceAreas)}
                    />
                  </Field>
                  <Field label="Services (one per line)" htmlFor="services">
                    <Textarea
                      id="services"
                      name="services"
                      rows={4}
                      defaultValue={listValue(p.services)}
                    />
                  </Field>
                </div>

                <Field label="Target customers" htmlFor="targetCustomers">
                  <Textarea
                    id="targetCustomers"
                    name="targetCustomers"
                    rows={2}
                    defaultValue={p.targetCustomers ?? ""}
                  />
                </Field>

                <Field label="Brand voice" htmlFor="brandVoice">
                  <Textarea
                    id="brandVoice"
                    name="brandVoice"
                    rows={2}
                    defaultValue={p.brandVoice ?? ""}
                  />
                </Field>

                <Field
                  label="Calls to action (one per line)"
                  htmlFor="callsToAction"
                >
                  <Textarea
                    id="callsToAction"
                    name="callsToAction"
                    rows={3}
                    defaultValue={listValue(p.callsToAction)}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Current offers" htmlFor="currentOffers">
                    <Textarea
                      id="currentOffers"
                      name="currentOffers"
                      rows={3}
                      defaultValue={p.currentOffers ?? ""}
                    />
                  </Field>
                  <Field label="Trading hours" htmlFor="tradingHours">
                    <Textarea
                      id="tradingHours"
                      name="tradingHours"
                      rows={3}
                      defaultValue={p.tradingHours ?? ""}
                      placeholder="Mon–Fri 9–5, Sat 10–2"
                    />
                  </Field>
                </div>

                <Field label="Local market notes" htmlFor="localMarketNotes">
                  <Textarea
                    id="localMarketNotes"
                    name="localMarketNotes"
                    rows={2}
                    defaultValue={p.localMarketNotes ?? ""}
                  />
                </Field>

                <div>
                  <p className="mb-3 text-sm font-medium">Social profiles</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
                      <Field key={key} label={label} htmlFor={`social_${key}`}>
                        <Input
                          id={`social_${key}`}
                          name={`social_${key}`}
                          type="url"
                          placeholder={placeholder}
                          defaultValue={socialUrl(p.socialLinks, key)}
                        />
                      </Field>
                    ))}
                  </div>
                </div>

                <Button type="submit">Save changes</Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
