import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  briefField,
  getOrderBriefSchema,
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
    <Field
      label={config.label}
      htmlFor={name}
      hint={config.hint}
    >
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

function RadioField({ config, name }: { config: OrderBriefFieldConfig; name: string }) {
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
              defaultChecked={
                name === "timing" && o.value === "flexible"
              }
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

export function ClientOrderBriefFields({
  categoryId,
  dishTitle,
}: {
  categoryId: ClientMenuCategoryId;
  dishTitle: string;
}) {
  const schema = getOrderBriefSchema(categoryId);

  return (
    <div className="space-y-5">
      <ClientOrderDetailsHelp categoryId={categoryId} dishTitle={dishTitle} />

      {schema.fields.map((config) => {
        switch (config.id) {
          case "audience":
            return (
              <SelectField key={config.id} config={config} name="audience" />
            );
          case "audienceNotes":
            return (
              <Field
                key={config.id}
                label={config.label}
                htmlFor="audienceNotes"
                hint={config.hint}
              >
                <Input
                  id="audienceNotes"
                  name="audienceNotes"
                  placeholder="e.g. within 5 km · SME owners · parents of kids 5–12"
                />
              </Field>
            );
          case "tone":
            return <RadioField key={config.id} config={config} name="tone" />;
          case "cta":
            return <SelectField key={config.id} config={config} name="cta" />;
          case "printFormat":
            return (
              <SelectField key={config.id} config={config} name="printFormat" />
            );
          case "printDistribution":
            return (
              <SelectField
                key={config.id}
                config={config}
                name="printDistribution"
              />
            );
          case "videoRuntime":
            return (
              <SelectField key={config.id} config={config} name="videoRuntime" />
            );
          case "factTypes":
            return (
              <CheckboxField key={config.id} config={config} name="factType" />
            );
          case "mustIncludeFacts":
            return (
              <Field
                key={config.id}
                label={config.label}
                htmlFor="mustIncludeFacts"
                hint={config.hint}
              >
                <Textarea
                  id="mustIncludeFacts"
                  name="mustIncludeFacts"
                  required={config.required}
                  rows={4}
                  placeholder="Spell out the exact facts we must use"
                />
              </Field>
            );
          case "targetQuestions":
            return (
              <Field
                key={config.id}
                label={config.label}
                htmlFor="targetQuestions"
                hint={config.hint}
              >
                <Textarea
                  id="targetQuestions"
                  name="targetQuestions"
                  required={config.required}
                  rows={3}
                  placeholder="e.g. best [service] near [suburb] for…"
                />
              </Field>
            );
          case "avoid":
            return (
              <CheckboxField key={config.id} config={config} name="avoid" />
            );
          case "timing":
            return (
              <RadioField key={config.id} config={config} name="timing" />
            );
          case "otherNotes":
            return (
              <Field
                key={config.id}
                label={config.label}
                htmlFor="otherNotes"
                hint={config.hint}
              >
                <Textarea
                  id="otherNotes"
                  name="otherNotes"
                  rows={3}
                  placeholder="Optional extras for the agency"
                />
              </Field>
            );
          default: {
            const _unused = briefField(schema, config.id);
            void _unused;
            return null;
          }
        }
      })}
    </div>
  );
}
