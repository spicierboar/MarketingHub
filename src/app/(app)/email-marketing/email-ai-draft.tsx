"use client";

import { useActionState } from "react";
import {
  createEmailCampaignAction,
  draftEmailCampaignCopyAction,
  type EmailAiDraftState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";

export function EmailCampaignAiDraft({
  companyId,
  fallbackTemplateId,
}: {
  companyId: string;
  fallbackTemplateId?: string;
}) {
  const [state, draftAction, pending] = useActionState(
    draftEmailCampaignCopyAction,
    null as EmailAiDraftState,
  );

  return (
    <div className="space-y-4 border-t pt-4">
      <form action={draftAction} className="space-y-3">
        <input type="hidden" name="companyId" value={companyId} />
        <p className="text-xs text-muted-foreground">
          Brand Brain–grounded draft. Fills the form below — nothing is sent.
        </p>
        <Field label="Topic" htmlFor="email-ai-topic">
          <Input id="email-ai-topic" name="topic" required placeholder="Spring newsletter" />
        </Field>
        <Field label="Objective" htmlFor="email-ai-objective">
          <Input
            id="email-ai-objective"
            name="objective"
            required
            placeholder="Re-engage local customers"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Drafting…" : "Draft with AI"}
        </Button>
        {state?.model && (
          <p className="text-xs text-muted-foreground">
            Drafted via {state.model}
            {state.complianceWarning ? ` · ${state.complianceWarning}` : ""}
          </p>
        )}
      </form>

      <form
        action={createEmailCampaignAction}
        className="space-y-3"
        key={state ? `ai-${state.subject}` : "manual"}
      >
        <input type="hidden" name="companyId" value={companyId} />
        {fallbackTemplateId && !state?.htmlBody && (
          <input type="hidden" name="templateId" value={fallbackTemplateId} />
        )}
        <Field label="Name" htmlFor="cmp-name">
          <Input id="cmp-name" name="name" required defaultValue={state?.name ?? ""} />
        </Field>
        <Field label="Subject" htmlFor="cmp-subject">
          <Input id="cmp-subject" name="subject" required defaultValue={state?.subject ?? ""} />
        </Field>
        <Field label="HTML body" htmlFor="cmp-body" hint="Leave blank to use the first saved template">
          <Textarea
            id="cmp-body"
            name="htmlBody"
            rows={5}
            defaultValue={state?.htmlBody ?? ""}
            placeholder="<p>Hi {{name}}</p>"
            required={!!state?.htmlBody || !fallbackTemplateId}
          />
        </Field>
        <Field label="Segment tag" htmlFor="cmp-seg">
          <Input id="cmp-seg" name="segmentTag" placeholder="newsletter" />
        </Field>
        <Button type="submit">Create draft</Button>
      </form>
    </div>
  );
}
