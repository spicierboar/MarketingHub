import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createClientRequestAction } from "../../../actions";

/**
 * Wave A — plain-language message + optional files.
 * Heavy brief / offer / CTA / consent stay as hidden defaults for backend compatibility.
 */
export default async function ClientNewRequestPage() {
  await requirePortalUser();

  return (
    <div>
      <PageHeader
        title="Ask us"
        explainerId="client-request-new"
        explainer="Tell us what you need in plain language. We'll already have your company details."
      />
      <ClientAccountLinks />
      <div className="mx-auto max-w-xl p-6">
        <form action={createClientRequestAction}>
          <Card>
            <CardContent className="space-y-5 p-6">
              {/* Backend defaults — demoted from primary UI */}
              <input type="hidden" name="requestType" value="creative_request" />
              <input type="hidden" name="urgency" value="normal" />
              <input type="hidden" name="objective" value="" />

              <Field label="Message" htmlFor="notes">
                <Textarea
                  id="notes"
                  name="notes"
                  required
                  rows={6}
                  placeholder="What do you need? Timing, photos, a correction — anything."
                />
              </Field>
              <Field
                label="Short subject (optional)"
                htmlFor="topic"
                hint="Leave blank and we’ll use the start of your message"
              >
                <Input id="topic" name="topic" placeholder="e.g. New opening hours" />
              </Field>
              <Field label="Attach files (optional)" htmlFor="files">
                <Input id="files" name="files" type="file" multiple />
              </Field>
            </CardContent>
          </Card>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Link
              href="/client/requests"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Link>
            <Button type="submit">Send</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
