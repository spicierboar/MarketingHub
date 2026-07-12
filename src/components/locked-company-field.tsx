import { Field, Select } from "@/components/ui/form";

type CompanyOpt = { id: string; name: string };

/**
 * Client picker that locks to one company when arriving from the client
 * workspace (`?company=`). Locked = hidden input + read-only name (no switch).
 */
export function LockedCompanyField({
  companies,
  companyId,
  locked = false,
  id,
  name = "companyId",
  label = "Client",
  hint,
  required = true,
}: {
  companies: CompanyOpt[];
  companyId?: string;
  locked?: boolean;
  id: string;
  name?: string;
  label?: string;
  hint?: string;
  required?: boolean;
}) {
  const effectiveId = companyId ?? companies[0]?.id;
  const company = companies.find((c) => c.id === effectiveId);

  if (locked && company) {
    return (
      <Field label={label} htmlFor={id} hint={hint}>
        <input type="hidden" name={name} value={company.id} />
        <p
          id={id}
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium"
        >
          {company.name}
        </p>
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Select
        id={id}
        name={name}
        required={required}
        defaultValue={effectiveId}
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** GET filter: when locked, keep company via hidden input (no All clients). */
export function LockedCompanyFilter({
  companies,
  companyId,
  locked,
  name = "company",
  allLabel = "All clients",
  className = "h-9 w-44",
}: {
  companies: CompanyOpt[];
  companyId?: string;
  locked: boolean;
  name?: string;
  allLabel?: string;
  className?: string;
}) {
  if (locked && companyId) {
    const company = companies.find((c) => c.id === companyId);
    return (
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Client</label>
        <input type="hidden" name={name} value={companyId} />
        <p className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
          {company?.name ?? "Client"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">Client</label>
      <Select name={name} defaultValue={companyId ?? ""} className={className}>
        <option value="">{allLabel}</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
