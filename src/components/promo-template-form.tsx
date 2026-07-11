import {
  PROMO_CHANNEL_OPTIONS,
  PROMO_INDUSTRY_OPTIONS,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const POST_SLOTS = [0, 1, 2, 3, 4] as const;

export function PromoTemplateFormFields({
  defaults,
  submitLabel,
}: {
  defaults?: Partial<PromoTemplate> | null;
  submitLabel: string;
}) {
  const posts = defaults?.outlines ?? [];
  const checkedChannels = new Set(
    defaults?.availableChannels?.length
      ? defaults.availableChannels
      : ["instagram", "facebook"],
  );

  return (
    <div className="space-y-3">
      <Field label="Industry" htmlFor="industry">
        <Select
          id="industry"
          name="industry"
          required
          defaultValue={defaults?.industry ?? "restaurant_cafe"}
        >
          {PROMO_INDUSTRY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Campaign name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name ?? ""}
          placeholder="e.g. Mother's Day High Tea"
        />
      </Field>
      <Field label="Promotion / offer" htmlFor="promotion">
        <Input
          id="promotion"
          name="promotion"
          required
          defaultValue={defaults?.promotion ?? ""}
          placeholder="e.g. 15% off booking code MUM15"
        />
      </Field>
      <Field label="Short blurb (optional)" htmlFor="blurb">
        <Input
          id="blurb"
          name="blurb"
          defaultValue={defaults?.blurb ?? ""}
          placeholder="Shown under the name for clients"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (days)" htmlFor="defaultDurationDays">
          <Input
            id="defaultDurationDays"
            name="defaultDurationDays"
            type="number"
            min={1}
            max={90}
            defaultValue={defaults?.defaultDurationDays ?? 14}
            required
          />
        </Field>
        <Field label="Markup %" htmlFor="markupPercent">
          <Input
            id="markupPercent"
            name="markupPercent"
            type="number"
            min={0}
            max={90}
            step={1}
            defaultValue={Math.round((defaults?.markupPercent ?? 0.42) * 100)}
            required
          />
        </Field>
      </div>
      <Field label="Client package price (AUD)" htmlFor="suggestedClientPriceUsd">
        <Input
          id="suggestedClientPriceUsd"
          name="suggestedClientPriceUsd"
          type="number"
          min={50}
          step={10}
          defaultValue={defaults?.suggestedClientPriceUsd ?? 499}
          required
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ongoing" defaultChecked={Boolean(defaults?.ongoing)} />
        Ongoing (not a hard end date)
      </label>
      <div>
        <p className="mb-1.5 text-sm font-medium">Available channels</p>
        <div className="flex flex-wrap gap-3">
          {PROMO_CHANNEL_OPTIONS.map((ch) => (
            <label key={ch.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="channels"
                value={ch.id}
                defaultChecked={checkedChannels.has(ch.id)}
              />
              {ch.label}
            </label>
          ))}
        </div>
      </div>
      <Field label="Objective" htmlFor="objective">
        <Input
          id="objective"
          name="objective"
          defaultValue={defaults?.objective ?? ""}
          placeholder="e.g. Fill Mother's Day bookings"
        />
      </Field>
      <Field label="Key message" htmlFor="keyMessage">
        <Input
          id="keyMessage"
          name="keyMessage"
          defaultValue={defaults?.keyMessage ?? ""}
          placeholder="e.g. Book early with MUM15"
        />
      </Field>

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium">Posts (fill at least 3)</p>
        {POST_SLOTS.map((i) => {
          const post = posts[i];
          return (
            <div
              key={i}
              className="space-y-2 rounded-md border border-border bg-muted/20 p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">Post {i + 1}</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Day offset" htmlFor={`postDayOffset-${i}`}>
                  <Input
                    id={`postDayOffset-${i}`}
                    name="postDayOffset"
                    type="number"
                    min={1}
                    defaultValue={
                      post?.dayOffset ??
                      (i === 0 ? 1 : i === 1 ? 4 : i === 2 ? 8 : i === 3 ? 12 : 16)
                    }
                  />
                </Field>
                <Field label="Channel" htmlFor={`postChannel-${i}`}>
                  <Select
                    id={`postChannel-${i}`}
                    name="postChannel"
                    defaultValue={post?.channel ?? (i % 2 === 0 ? "instagram" : "facebook")}
                  >
                    {PROMO_CHANNEL_OPTIONS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Title" htmlFor={`postTitle-${i}`}>
                <Input
                  id={`postTitle-${i}`}
                  name="postTitle"
                  defaultValue={post?.title ?? ""}
                  placeholder={i < 3 ? "Required" : "Optional"}
                />
              </Field>
              <Field label="Caption" htmlFor={`postCaption-${i}`}>
                <Textarea
                  id={`postCaption-${i}`}
                  name="postCaption"
                  rows={3}
                  defaultValue={post?.caption ?? ""}
                  placeholder="Ready-to-publish caption"
                />
              </Field>
              <Field label="Hashtags" htmlFor={`postHashtags-${i}`}>
                <Input
                  id={`postHashtags-${i}`}
                  name="postHashtags"
                  defaultValue={post?.hashtags ?? ""}
                  placeholder="#Local #Offer"
                />
              </Field>
              <Field label="CTA" htmlFor={`postCta-${i}`}>
                <Input
                  id={`postCta-${i}`}
                  name="postCta"
                  defaultValue={post?.cta ?? ""}
                  placeholder="Book now / Shop the deal"
                />
              </Field>
            </div>
          );
        })}
      </div>

      <Button type="submit">{submitLabel}</Button>
    </div>
  );
}
