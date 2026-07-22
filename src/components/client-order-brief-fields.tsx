import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  resolveOrderBriefSchema,
  type OrderBriefFieldConfig,
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

function SelectField({
  config,
  name,
}: {
  config: OrderBriefFieldConfig;
  name: string;
}) {
  const options = config.options ?? [];
  return (
    <Field label={config.label} htmlFor={name} hint={config.hint}>
      <Select
        id={name}
        name={name}
        required={config.required}
        defaultValue=""
      >
        <option value="" disabled={config.required}>
          {config.required ? "Select…" : "Optional — skip if not needed"}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function RadioField({
  config,
  name,
}: {
  config: OrderBriefFieldConfig;
  name: string;
}) {
  const options = config.options ?? [];
  return (
    <OptionGroup legend={config.label} hint={config.hint}>
      <div className="flex flex-col gap-2 text-sm">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={o.value}
              required={config.required}
              defaultChecked={name === "timing" && o.value === "flexible"}
              className="h-4 w-4"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </OptionGroup>
  );
}

function CheckboxField({
  config,
  name,
}: {
  config: OrderBriefFieldConfig;
  name: string;
}) {
  const options = config.options ?? [];
  return (
    <OptionGroup legend={config.label} hint={config.hint}>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </OptionGroup>
  );
}

function TextField({
  config,
  name,
  multiline,
}: {
  config: OrderBriefFieldConfig;
  name: string;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <Field label={config.label} htmlFor={name} hint={config.hint}>
        <Textarea
          id={name}
          name={name}
          required={config.required}
          rows={name === "mustIncludeFacts" ? 4 : 3}
          placeholder={config.placeholder}
        />
      </Field>
    );
  }
  return (
    <Field label={config.label} htmlFor={name} hint={config.hint}>
      <Input
        id={name}
        name={name}
        required={config.required}
        placeholder={config.placeholder}
      />
    </Field>
  );
}

const MULTI_TEXT = new Set([
  "mustIncludeFacts",
  "targetQuestions",
  "keyOutcomes",
  "keywords",
  "guestOrFocus",
  "announcementDetails",
  "otherNotes",
]);

const RADIO_IDS = new Set(["tone", "timing", "learningLevel", "durationScope"]);

const SELECT_IDS = new Set([
  "audience",
  "cta",
  "printFormat",
  "printDistribution",
  "videoRuntime",
  "partCount",
]);

export function ClientOrderBriefFields({
  skuId,
  categoryId,
  dishTitle,
}: {
  skuId: string;
  categoryId: ClientMenuCategoryId;
  dishTitle: string;
}) {
  const schema = resolveOrderBriefSchema({
    id: skuId,
    title: dishTitle,
    categoryId,
  });

  return (
    <div className="space-y-5">
      <ClientOrderDetailsHelp categoryId={categoryId} dishTitle={dishTitle} />

      {schema.fields.map((config) => {
        if (config.id === "factTypes") {
          return (
            <CheckboxField key={config.id} config={config} name="factType" />
          );
        }
        if (config.id === "avoid") {
          return (
            <CheckboxField key={config.id} config={config} name="avoid" />
          );
        }
        if (RADIO_IDS.has(config.id) && config.options?.length) {
          return (
            <RadioField key={config.id} config={config} name={config.id} />
          );
        }
        if (SELECT_IDS.has(config.id) && config.options?.length) {
          return (
            <SelectField key={config.id} config={config} name={config.id} />
          );
        }
        return (
          <TextField
            key={config.id}
            config={config}
            name={config.id}
            multiline={MULTI_TEXT.has(config.id)}
          />
        );
      })}
    </div>
  );
}
