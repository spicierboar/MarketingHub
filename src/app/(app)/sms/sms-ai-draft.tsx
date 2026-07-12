"use client";

import { useActionState } from "react";
import {
  createSmsCampaignAction,
  draftSmsCampaignCopyAction,
  type SmsAiDraftState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const DEFAULT_BODY = "Hi {{name}} — offer at {{company}}. Reply STOP to opt out.";

export function SmsCampaignAiDraft({ companyId }: { companyId: string }) {
  const [state, draftAction, pending] = useActionState(
    draftSmsCampaignCopyAction,
    null as SmsAiDraftState,
  );

  return (
    <div className="space-y-4">
      <form action={draftAction} className="grid gap-3 md:grid-cols-2">
        <input type="hidden" name="companyId" value={companyId} />
        <p className="md:col-span-2 text-xs text-muted-foreground">
          Brand Brain–grounded SMS. Prefills the campaign form — nothing is sent.
        </p>
        <Field label="Topic">
          <Input name="topic" required placeholder="Weekend special" />
        </Field>
        <Field label="Objective">
          <Input name="objective" required placeholder="Drive bookings this weekend" />
        </Field>
        <Field label="Kind (for AI tone)">
          <Select name="kind" defaultValue="promotional">
            <option value="promotional">Promotional</option>
            <option value="transactional">Transactional</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Drafting…" : "Draft with AI"}
          </Button>
        </div>
        {state?.model && (
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Drafted via {state.model} · ~{state.segments} segment(s)
            {state.complianceWarning ? ` · ${state.complianceWarning}` : ""}
          </p>
        )}
      </form>

      <form
        action={createSmsCampaignAction}
        className="grid gap-3 md:grid-cols-2"
        key={state ? `ai-${state.body.slice(0, 40)}` : "manual"}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <Field label="Name" hint="Internal campaign label">
          <Input
            name="name"
            required
            defaultValue={state?.name ?? ""}
            placeholder="e.g. Weekend special blast"
          />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue="promotional">
            <option value="promotional">Promotional</option>
            <option value="transactional">Transactional</option>
          </Select>
        </Field>
        <Field label="Segment tag" hint="Only subscribers with this tag — blank = all opted-in">
          <Input name="segmentTag" placeholder="loyalty" />
        </Field>
        <Field label="UTM campaign" hint="Optional analytics tag">
          <Input name="utmCampaign" placeholder="weekend-special-jul" />
        </Field>
        <Field label="Short link" className="md:col-span-2" hint="Optional tracking URL in the message">
          <Input name="shortLink" type="url" placeholder="https://go.example.com/weekend" />
        </Field>
        <Field
          label="Message"
          className="md:col-span-2"
          hint="Include STOP for promotional. Merge {{name}} / {{company}}"
        >
          <Textarea
            name="body"
            rows={4}
            required
            defaultValue={state?.body ?? DEFAULT_BODY}
            placeholder={DEFAULT_BODY}
          />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit">Save draft</Button>
        </div>
      </form>
    </div>
  );
}
