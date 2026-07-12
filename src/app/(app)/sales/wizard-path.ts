/** Build the field-sales new-client wizard URL for a given step. */
export function wizardPath(
  step: string,
  companyId?: string,
  extras?: Record<string, string>,
): string {
  const params = new URLSearchParams({ step });
  if (companyId) params.set("companyId", companyId);
  if (extras) for (const [k, v] of Object.entries(extras)) if (v) params.set(k, v);
  return `/sales/new-client?${params.toString()}`;
}
