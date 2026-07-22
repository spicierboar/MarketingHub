import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  ORDER_AUDIENCE_OPTIONS,
  ORDER_AVOID_OPTIONS,
  ORDER_CTA_OPTIONS,
  ORDER_FACT_TYPE_OPTIONS,
  ORDER_TIMING_OPTIONS,
  ORDER_TONE_OPTIONS,
} from "@/lib/client-order-brief";
import { ClientOrderDetailsHelp } from "@/components/client-order-details-help";
import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

function OptionGroup({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      {hint ? (
        <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {children}
    </fieldset>
  );
}

export function ClientOrderBriefFields({
  categoryId,
  dishTitle,
}: {
  categoryId: ClientMenuCategoryId;
  dishTitle: string;
}) {
  const showDiscovery = categoryId === "discovery";

  return (
    <div className="space-y-5">
      <ClientOrderDetailsHelp categoryId={categoryId} dishTitle={dishTitle} />

      <Field label="Audience" htmlFor="audience" hint="Who should this speak to?">
        <Select id="audience" name="audience" required defaultValue="">
          <option value="" disabled>
            Select audience…
          </option>
          {ORDER_AUDIENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Audience notes (optional)"
        htmlFor="audienceNotes"
        hint="Suburb, segment, company size — anything that narrows it"
      >
        <Input
          id="audienceNotes"
          name="audienceNotes"
          placeholder="e.g. diners within 5 km · SME owners · parents of kids 5–12"
        />
      </Field>

      <OptionGroup legend="Tone" hint="Pick one voice for the draft">
        <div className="flex flex-col gap-2 text-sm">
          {ORDER_TONE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="tone"
                value={o.value}
                required
                className="h-4 w-4"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <Field label="Call to action" htmlFor="cta">
        <Select id="cta" name="cta" required defaultValue="">
          <option value="" disabled>
            Select CTA…
          </option>
          {ORDER_CTA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <OptionGroup
        legend="Must-include fact types"
        hint="Tick what the draft must cover — then spell them out below"
      >
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {ORDER_FACT_TYPE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-start gap-2">
              <input
                type="checkbox"
                name="factType"
                value={o.value}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <Field
        label="Must-include facts"
        htmlFor="mustIncludeFacts"
        hint="Write the exact prices, dates, places, offers, or claims we must use"
      >
        <Textarea
          id="mustIncludeFacts"
          name="mustIncludeFacts"
          required
          rows={4}
          placeholder="e.g. Private dining for 12 · vegetarian + gluten-free · book online · Fri–Sun only · no ‘best in Sydney’ claims"
        />
      </Field>

      {showDiscovery ? (
        <Field
          label="Target questions / search phrases"
          htmlFor="targetQuestions"
          hint="What people ask — helps AEO, GEO, and LLMO packs"
        >
          <Textarea
            id="targetQuestions"
            name="targetQuestions"
            rows={3}
            placeholder="e.g. best Indian restaurant near [suburb] for a group booking"
          />
        </Field>
      ) : null}

      <OptionGroup legend="Avoid" hint="Optional guardrails">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {ORDER_AVOID_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-start gap-2">
              <input
                type="checkbox"
                name="avoid"
                value={o.value}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <OptionGroup legend="Timing preference">
        <div className="flex flex-col gap-2 text-sm">
          {ORDER_TIMING_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="radio"
                name="timing"
                value={o.value}
                required
                defaultChecked={o.value === "flexible"}
                className="h-4 w-4"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </OptionGroup>

      <Field
        label="Anything else (optional)"
        htmlFor="otherNotes"
        hint="Links, references, or constraints that don’t fit above"
      >
        <Textarea
          id="otherNotes"
          name="otherNotes"
          rows={3}
          placeholder="Optional extras for the agency"
        />
      </Field>
    </div>
  );
}
