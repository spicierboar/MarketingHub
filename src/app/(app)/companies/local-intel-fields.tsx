import { Field, Textarea } from "@/components/ui/form";
import {
  EXTENDED_INTEL_FIELDS,
  KEY_INTEL_FIELDS,
  type IntelFieldDef,
} from "@/lib/local-area-intel";
import type { LocalAreaProfile } from "@/lib/types";

function joinLines(items?: string[]): string {
  return (items ?? []).join("\n");
}

function defaultForField(local: LocalAreaProfile | undefined, field: IntelFieldDef): string {
  if (!local) return "";
  const value = local[field.id];
  if (field.kind === "lines") return joinLines(value as string[] | undefined);
  return (value as string | undefined) ?? "";
}

interface Props {
  local?: LocalAreaProfile;
  variant: "key" | "full";
}

export function LocalIntelFields({ local, variant }: Props) {
  const fields =
    variant === "key" ? KEY_INTEL_FIELDS : [...KEY_INTEL_FIELDS, ...EXTENDED_INTEL_FIELDS];

  return (
    <>
      {variant === "key" && <input type="hidden" name="intelScope" value="key" />}

      {fields.map((field) => {
        if (variant === "full" && field.id === "suburbs") {
          const competitors = fields.find((f) => f.id === "competitors");
          return (
            <div key="paired-suburbs" className="grid gap-4 sm:grid-cols-2">
              <Field label={field.label} htmlFor={field.id} hint="One per line">
                <Textarea id={field.id} name={field.id} defaultValue={defaultForField(local, field)} />
              </Field>
              {competitors && (
                <Field label={competitors.label} htmlFor={competitors.id} hint="One per line">
                  <Textarea
                    id={competitors.id}
                    name={competitors.id}
                    defaultValue={defaultForField(local, competitors)}
                  />
                </Field>
              )}
            </div>
          );
        }
        if (variant === "full" && field.id === "competitors") return null;

        if (variant === "full" && field.id === "searchTerms") {
          const triggers = fields.find((f) => f.id === "buyingTriggers");
          return (
            <div key="paired-search" className="grid gap-4 sm:grid-cols-2">
              <Field label={field.label} htmlFor={field.id} hint="One per line">
                <Textarea id={field.id} name={field.id} defaultValue={defaultForField(local, field)} />
              </Field>
              {triggers && (
                <Field label={triggers.label} htmlFor={triggers.id}>
                  <Textarea
                    id={triggers.id}
                    name={triggers.id}
                    defaultValue={defaultForField(local, triggers)}
                  />
                </Field>
              )}
            </div>
          );
        }
        if (variant === "full" && field.id === "buyingTriggers") return null;

        return (
          <Field
            key={field.id}
            label={field.label}
            htmlFor={field.id}
            hint={field.kind === "lines" ? "One per line" : undefined}
          >
            <Textarea id={field.id} name={field.id} defaultValue={defaultForField(local, field)} />
          </Field>
        );
      })}
    </>
  );
}
