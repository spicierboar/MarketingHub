import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClientRequestAction } from "../../../actions";

const REQUEST_TYPES = [
  ["social_post", "Social media post"], ["campaign", "Campaign"], ["blog_article", "Blog article"],
  ["email_newsletter", "Email newsletter"], ["ad_copy", "Ad copy"], ["landing_page", "Landing page"],
  ["website_copy", "Website update / page copy"], ["faq", "FAQ update"], ["brochure_copy", "Brochure or flyer copy"],
  ["video_script", "Video script"], ["creative_request", "Creative request"],
] as const;

const CONSENT_FIELDS = [
  ["customerNamed", "A customer is named"], ["customerInPhotos", "A customer appears in photos/videos"],
  ["consentObtained", "Consent has been obtained"], ["mentionsPricing", "Pricing is mentioned"],
  ["mentionsOffer", "A discount or offer is mentioned"], ["performanceClaims", "Performance claims are being made"],
] as const;

export default async function ClientNewRequestPage() {
  const { user, companyId } = await requirePortalUser();
  const company = await getCompany(companyId);

  return (
    <div>
      <PageHeader
        title="New marketing request"
        description={`For ${company?.name ?? "your business"}. We'll already have your company details — just tell us what you need.`}
      />
      <div className="mx-auto max-w-3xl p-6">
        <form action={createClientRequestAction}>
          <Card>
            <CardContent className="space-y-5 p-6">
              <Field label="Request type" htmlFor="requestType">
                <Select id="requestType" name="requestType" required defaultValue="social_post">
                  {REQUEST_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Topic / key message" htmlFor="topic">
                <Input id="topic" name="topic" required placeholder="e.g. Winter offer" />
              </Field>
              <Field label="Marketing objective" htmlFor="objective">
                <Textarea id="objective" name="objective" required placeholder="What should this achieve?" />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Target audience" htmlFor="targetAudience"><Input id="targetAudience" name="targetAudience" /></Field>
                <Field label="Platform" htmlFor="platform"><Input id="platform" name="platform" placeholder="Facebook, Instagram…" /></Field>
                <Field label="Offer" htmlFor="offer"><Input id="offer" name="offer" /></Field>
                <Field label="Call to action" htmlFor="callToAction"><Input id="callToAction" name="callToAction" /></Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Preferred date" htmlFor="preferredDate"><Input id="preferredDate" name="preferredDate" type="date" /></Field>
                <Field label="Preferred time" htmlFor="preferredTime"><Input id="preferredTime" name="preferredTime" type="time" /></Field>
                <Field label="Urgency" htmlFor="urgency">
                  <Select id="urgency" name="urgency" defaultValue="normal">
                    <option value="low">Low</option><option value="normal">Normal</option>
                    <option value="high">High</option><option value="urgent">Urgent</option>
                  </Select>
                </Field>
              </div>
              <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" /></Field>
              <Field label="Supporting files" htmlFor="files"><Input id="files" name="files" type="file" multiple /></Field>
              <fieldset className="rounded-md border border-border p-4">
                <legend className="px-1 text-sm font-medium">Consent &amp; compliance</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CONSENT_FIELDS.map(([name, label]) => (
                    <label key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" name={name} className="h-4 w-4 rounded border-input" />{label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </CardContent>
          </Card>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Link href="/client/requests" className="text-sm text-muted-foreground hover:text-foreground">Cancel</Link>
            <Button type="submit">Submit request</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
