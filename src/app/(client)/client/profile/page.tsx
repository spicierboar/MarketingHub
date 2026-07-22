import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, listMembers, usersForCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/utils";
import {
  BusinessInfoDetailsForm,
  businessInfoInitialFromProfile,
} from "@/components/business-info-details-form";
import { saveClientProfileAction } from "./actions";

/**
 * Precise Business info — country/postcode/suburb address, dial-code phone,
 * Google-style hours, optional Places match, plus People & access.
 */
export default async function ClientProfilePage() {
  const { user, companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Company not found.</div>
    );
  }

  const p = company.profile;
  const [portalUsers, members] = await Promise.all([
    usersForCompany(companyId),
    listMembers(user.tenantId),
  ]);
  const roleByUserId = new Map(
    members.map((m) => [m.userId, m.roleTitle ?? m.role] as const),
  );
  const people = portalUsers.map((u) => ({
    ...u,
    displayRole: roleByUserId.get(u.id) ?? u.roleTitle ?? "approver",
  }));

  const leaveTopic = "Transfer portal access";
  const leaveNotes = encodeURIComponent(
    `Someone is leaving our business and should no longer access the portal.\n\n` +
      `Remove access for: [name / email]\n` +
      `Add / invite as replacement: [name / email]\n` +
      `They should be able to approve content and handle billing contact.`,
  );
  const leaveHref = `/client/requests/new?topic=${encodeURIComponent(leaveTopic)}&notes=${leaveNotes}`;

  return (
    <div>
      <PageHeader
        title="Business info"
        explainerId="client-profile"
        explainer="Fill address, phone, and hours like Google Business Profile — structured fields reduce mistakes and help AI target the right local campaigns."
        parent={{ href: "/client/account", label: "Overview" }}
      />

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
              <form action={saveClientProfileAction} className="space-y-8">
                <input type="hidden" name="companyId" value={companyId} />

                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Business name
                  </h3>
                  <Field
                    label="Business name"
                    htmlFor="displayName"
                    hint="How your business appears in the portal and on listings"
                  >
                    <Input
                      id="displayName"
                      name="displayName"
                      defaultValue={company.name}
                      required
                      placeholder="e.g. Acme Studio"
                    />
                  </Field>
                </div>

                <BusinessInfoDetailsForm
                  initial={businessInfoInitialFromProfile({
                    businessName: company.name,
                    website: p.website,
                    serviceAreas: p.serviceAreas,
                    googlePlaceId: p.googlePlaceId,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    placeCategory: p.placeCategory,
                    structuredAddress: p.structuredAddress,
                    structuredPhone: p.structuredPhone,
                    structuredHours: p.structuredHours,
                    businessAddress: p.businessAddress,
                    phone: p.phone,
                    tradingHours: p.tradingHours,
                  })}
                />

                <div className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Public email
                  </h3>
                  <Field
                    label="Public email"
                    htmlFor="email"
                    hint="Optional — customer enquiries, not portal login"
                  >
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      defaultValue={p.email ?? ""}
                      placeholder="hello@example.com.au"
                    />
                  </Field>
                </div>

                <div className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Approvals &amp; billing contact
                  </h3>
                  <Field
                    label="Primary contact"
                    htmlFor="approvalContact"
                    hint="Who we email for content approvals and billing — update when someone leaves"
                  >
                    <Input
                      id="approvalContact"
                      name="approvalContact"
                      defaultValue={p.approvalContact ?? ""}
                      placeholder="Name · email@example.com.au"
                    />
                  </Field>
                </div>

                <Button type="submit">Save changes</Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">People &amp; access</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Like Google Business Profile owners and managers — these people can
                sign in to this portal. Login seats are agency-managed so access
                stays secure when someone leaves.
              </p>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No portal users on file yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {people.map((person) => {
                    const isYou = person.id === user.id;
                    return (
                      <li
                        key={person.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {person.name}
                            {isYou ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (you)
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{person.email}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{titleCase(String(person.displayRole))}</Badge>
                          {person.active ? (
                            <Badge tone="success">Active</Badge>
                          ) : (
                            <Badge tone="danger">Deactivated</Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
                <p className="font-medium">If someone leaves (e.g. Priya)</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
                  <li>Update Primary contact above and save.</li>
                  <li>
                    Ask us to remove their login and invite the replacement —
                    we handle the seat change.
                  </li>
                </ol>
                <Link
                  href={leaveHref}
                  className={`${buttonClasses("outline", "sm")} mt-3 inline-flex`}
                >
                  Ask us to transfer access
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
