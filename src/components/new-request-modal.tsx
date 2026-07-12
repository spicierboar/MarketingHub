"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { LockedCompanyField } from "@/components/locked-company-field";
import { createRequestAction } from "@/app/(app)/requests/actions";
import { MARKETING_FIELD_HELP } from "@/lib/profile-suggestions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";
import { cn } from "@/lib/utils";

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

export function NewRequestModalTrigger({
  companies,
  defaults,
  label = "Log for a client",
  linkStyle,
}: {
  companies: { id: string; name: string }[];
  defaults?: {
    companyId?: string;
    type?: string;
    topic?: string;
    objective?: string;
    audience?: string;
    platform?: string;
  };
  label?: string;
  linkStyle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const usable = (
    defaults?.companyId
      ? companies.filter((c) => c.id === defaults.companyId)
      : companies
  ).filter(Boolean);

  if (usable.length === 0) {
    return linkStyle ? (
      <span className="text-muted-foreground">{label}</span>
    ) : (
      <Button type="button" disabled>
        {label}
      </Button>
    );
  }

  return (
    <>
      {linkStyle ? (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}

      {open && (
        <FormModal
          title="Log a request for a client"
          description="You're filing this for the client — not asking the platform. Capture what they need; AI can draft from it, then an approver reviews."
          onClose={() => setOpen(false)}
          wide
        >
          <form action={createRequestAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <LockedCompanyField
                id="modal-req-company"
                companies={usable}
                companyId={defaults?.companyId}
                locked={Boolean(defaults?.companyId)}
                hint="Which client's ticket is this?"
              />
              <Field label="Request type" htmlFor="modal-req-type">
                <Select
                  id="modal-req-type"
                  name="requestType"
                  required
                  defaultValue={defaults?.type ?? "social_post"}
                >
                  {REQUEST_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Topic / key message" htmlFor="modal-req-topic" hint={MARKETING_FIELD_HELP.topic}>
              <Input
                id="modal-req-topic"
                name="topic"
                required
                defaultValue={defaults?.topic}
                placeholder="e.g. Winter lunch special for locals"
              />
            </Field>
            <Field
              label="Marketing objective"
              htmlFor="modal-req-objective"
              hint={MARKETING_FIELD_HELP.objective}
            >
              <Textarea
                id="modal-req-objective"
                name="objective"
                required
                defaultValue={defaults?.objective}
                placeholder="e.g. Fill weekday lunch tables"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Target audience"
                htmlFor="modal-req-audience"
                hint={MARKETING_FIELD_HELP.targetAudience}
              >
                <Input
                  id="modal-req-audience"
                  name="targetAudience"
                  defaultValue={defaults?.audience}
                  placeholder="e.g. Office workers within 10 minutes at lunch"
                />
              </Field>
              <Field
                label="Platform"
                htmlFor="modal-req-platform"
                hint={MARKETING_FIELD_HELP.platform}
              >
                <Select
                  id="modal-req-platform"
                  name="platform"
                  defaultValue={defaults?.platform ?? ""}
                >
                  <option value="">Not specified</option>
                  {CONTENT_PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Offer / promotion"
                htmlFor="modal-req-offer"
                hint={MARKETING_FIELD_HELP.offer}
              >
                <Input
                  id="modal-req-offer"
                  name="offer"
                  placeholder="e.g. 15% off weekday lunch with code LOCAL15"
                />
              </Field>
              <Field
                label="Call to action"
                htmlFor="modal-req-cta"
                hint={MARKETING_FIELD_HELP.callToAction}
              >
                <Input
                  id="modal-req-cta"
                  name="callToAction"
                  placeholder="e.g. Book a table"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Preferred date" htmlFor="modal-req-date">
                <Input id="modal-req-date" name="preferredDate" type="date" />
              </Field>
              <Field label="Preferred time" htmlFor="modal-req-time">
                <Input id="modal-req-time" name="preferredTime" type="time" />
              </Field>
              <Field label="Urgency" htmlFor="modal-req-urgency">
                <Select id="modal-req-urgency" name="urgency" defaultValue="normal">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </Field>
            </div>
            <Field
              label="Notes"
              htmlFor="modal-req-notes"
              hint="Anything the drafting team should know — assets, must-avoid wording, timing"
            >
              <Textarea
                id="modal-req-notes"
                name="notes"
                placeholder="e.g. Client wants no stock photos — use their Friday night shots from Drive"
              />
            </Field>
            <fieldset className={cn("rounded-md border border-border p-3")}>
              <legend className="px-1 text-sm font-medium">Consent &amp; compliance</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CONSENT_FIELDS.map(([name, label]) => (
                  <label key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name={name} className="h-4 w-4 rounded border-input" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Log request</Button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
