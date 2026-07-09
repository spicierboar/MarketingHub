import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createRequestAction } from "../actions";

const REQUEST_TYPES = [
  ["social_post", "Social media post"],
  ["campaign", "Campaign"],
  ["blog_article", "Blog article"],
  ["email_newsletter", "Email newsletter"],
  ["ad_copy", "Ad copy"],
  ["landing_page", "Landing page"],
  ["website_copy", "Website update / page copy"],
  ["faq", "FAQ update"],
  ["brochure_copy", "Brochure or flyer copy"],
  ["video_script", "Video script"],
  ["creative_request", "Creative request"],
] as const;

const CONSENT_FIELDS = [
  ["customerNamed", "A customer is named"],
  ["customerInPhotos", "A customer appears in photos/videos"],
  ["consentObtained", "Consent has been obtained"],
  ["mentionsPricing", "Pricing is mentioned"],
  ["mentionsOffer", "A discount or offer is mentioned"],
  ["performanceClaims", "Performance claims are being made"],
] as const;

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter(
    (c) => c.status !== "archived",
  );
  // Prefill from a recommendation (§44) or any deep link.
  const pf = await searchParams;
  const accessible = new Set(companies.map((c) => c.id));
  const pfCompany = pf.company && accessible.has(pf.company) ? pf.company : undefined;
  const pfType = REQUEST_TYPES.some(([v]) => v === pf.type) ? pf.type : undefined;
  const pfAudience = pf.audience;
  const pfPlatform = pf.platform;

  return (
    <div>
      <PageHeader
        title="New marketing support request"
        description="Tell us what you need — the AI drafts it, an approver reviews it."
      />
      <div className="mx-auto max-w-3xl p-6">
        {companies.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You have no companies assigned yet. Ask an admin to assign you.
            </CardContent>
          </Card>
        ) : (
          <form action={createRequestAction}>
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Company" htmlFor="companyId">
                    <Select id="companyId" name="companyId" required defaultValue={pfCompany}>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Request type" htmlFor="requestType">
                    <Select id="requestType" name="requestType" required defaultValue={pfType}>
                      {REQUEST_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Topic / key message" htmlFor="topic">
                  <Input
                    id="topic"
                    name="topic"
                    required
                    defaultValue={pf.topic}
                    placeholder="e.g. Winter blocked-drain check-up offer"
                  />
                </Field>

                <Field label="Marketing objective" htmlFor="objective">
                  <Textarea
                    id="objective"
                    name="objective"
                    required
                    defaultValue={pf.objective}
                    placeholder="What should this achieve?"
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Target audience" htmlFor="targetAudience">
                    <Input
                      id="targetAudience"
                      name="targetAudience"
                      defaultValue={pfAudience}
                    />
                  </Field>
                  <Field label="Platform" htmlFor="platform">
                    <Input
                      id="platform"
                      name="platform"
                      placeholder="Facebook, Instagram, Email…"
                      defaultValue={pfPlatform}
                    />
                  </Field>
                  <Field label="Offer / promotion" htmlFor="offer">
                    <Input id="offer" name="offer" />
                  </Field>
                  <Field label="Call to action" htmlFor="callToAction">
                    <Input id="callToAction" name="callToAction" />
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Preferred date" htmlFor="preferredDate">
                    <Input id="preferredDate" name="preferredDate" type="date" />
                  </Field>
                  <Field label="Preferred time" htmlFor="preferredTime">
                    <Input id="preferredTime" name="preferredTime" type="time" />
                  </Field>
                  <Field label="Urgency" htmlFor="urgency">
                    <Select id="urgency" name="urgency" defaultValue="normal">
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Notes for the marketing team" htmlFor="notes">
                  <Textarea id="notes" name="notes" />
                </Field>

                <Field
                  label="Supporting files"
                  htmlFor="files"
                  hint="Photos, brochures, documents. Uploads are never auto-approved."
                >
                  <Input id="files" name="files" type="file" multiple />
                </Field>

                <fieldset className="rounded-md border border-border p-4">
                  <legend className="px-1 text-sm font-medium">
                    Consent &amp; compliance
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CONSENT_FIELDS.map(([name, label]) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          name={name}
                          className="h-4 w-4 rounded border-input"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </CardContent>
            </Card>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Link
                href="/requests"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Link>
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
