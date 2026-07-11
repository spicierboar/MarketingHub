"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { createRequestAction } from "@/app/(app)/requests/actions";
import { MARKETING_FIELD_HELP } from "@/lib/profile-suggestions";
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
  label = "New request",
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
  const usable = companies.filter(Boolean);

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
          title="New marketing support request"
          description="Tell us what you need — the AI drafts it, an approver reviews it."
          onClose={() => setOpen(false)}
          wide
        >
          <form action={createRequestAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client" htmlFor="modal-req-company">
                <Select
                  id="modal-req-company"
                  name="companyId"
                  required
                  defaultValue={defaults?.companyId ?? usable[0]?.id}
                >
                  {usable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
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
              <Field label="Target audience" htmlFor="modal-req-audience">
                <Input
                  id="modal-req-audience"
                  name="targetAudience"
                  defaultValue={defaults?.audience}
                />
              </Field>
              <Field label="Platform" htmlFor="modal-req-platform">
                <Input
                  id="modal-req-platform"
                  name="platform"
                  defaultValue={defaults?.platform}
                  placeholder="Facebook, Instagram…"
                />
              </Field>
              <Field label="Offer / promotion" htmlFor="modal-req-offer">
                <Input id="modal-req-offer" name="offer" />
              </Field>
              <Field label="Call to action" htmlFor="modal-req-cta">
                <Input id="modal-req-cta" name="callToAction" />
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
            <Field label="Notes" htmlFor="modal-req-notes">
              <Textarea id="modal-req-notes" name="notes" />
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
              <Button type="submit">Submit request</Button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
