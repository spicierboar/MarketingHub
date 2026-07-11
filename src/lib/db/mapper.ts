// Generic row<->domain mapping for the Supabase adapter.
//
// The schema (supabase/migrations) is snake_case; the domain (src/lib/types.ts)
// is camelCase. Mapping is a SHALLOW top-level key conversion: jsonb VALUES
// (profile, versions, compliance, usageRights, branding, clientReview,
// statusHistory, action, outcomes, …) already hold camelCase domain objects, so
// we store/read them verbatim and NEVER recurse into them.

// Person-reference FK columns are named *_by in the schema (created_by,
// approved_by, added_by, …), not *_by_id, so these aliases bridge the domain's
// *ById fields. EVERY other field converts by the regular snake<->camel rule.
const WRITE_ALIAS: Record<string, string> = {
  createdById: "created_by", createdBy: "created_by", approvedById: "approved_by",
  addedById: "added_by", connectedById: "connected_by", updatedById: "updated_by",
  triggeredById: "triggered_by", answeredById: "answered_by", appliedById: "applied_by",
  releasedById: "released_by", publishedById: "published_by", enabledById: "enabled_by",
  invitedById: "invited_by",
};
// Reverse. The ONE ambiguous column is created_by: companies map it to createdBy,
// everyone else to createdById — callers pass an override for companies.
const READ_ALIAS: Record<string, string> = {
  created_by: "createdById", approved_by: "approvedById", added_by: "addedById",
  connected_by: "connectedById", updated_by: "updatedById", triggered_by: "triggeredById",
  answered_by: "answeredById", applied_by: "appliedById", released_by: "releasedById",
  published_by: "publishedById", enabled_by: "enabledById", invited_by: "invitedById",
};
// numeric/bigint columns PostgREST returns as strings — coerce to number on read.
const NUMERIC_COLS = new Set([
  "est_cost_usd", "ai_monthly_cap_usd", "size_bytes", "size",
  // Module 6 paid-advertising money/fraction columns (numeric in Postgres).
  "monthly_budget_usd", "daily_budget_usd", "fee_percent", "fee_flat_usd", "value_usd",
  // AI campaign layer (0035) numeric columns.
  "budget_amount", "daily_spend_limit", "discount_amount", "discount_percentage",
  "minimum_purchase_amount", "maximum_discount", "temperature",
  "confidence_score", "risk_score", "feedback_score",
]);
// tenant_id / company_id carry a MEANINGFUL null on the platform-library entities
// (approved_responses / prompt_templates / brand_templates): null tenant_id =
// platform library, null company_id = tenant-wide. The app distinguishes these
// rows with strict `=== null`, so their null MUST be preserved (not coerced to
// undefined). Every other column's null becomes undefined (the app's `?:` shape).
const PRESERVE_NULL_COLS = new Set(["tenant_id", "company_id"]);

const snakeToCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const camelToSnake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

export type Row = Record<string, unknown>;

// Row -> domain. DB null becomes undefined (the app treats both as absent);
// known numeric columns are coerced. `aliasOverride` handles companies.created_by.
export function toDomain<T>(row: Row, aliasOverride: Record<string, string> = {}): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    const key = aliasOverride[k] ?? READ_ALIAS[k] ?? snakeToCamel(k);
    out[key] =
      v === null
        ? PRESERVE_NULL_COLS.has(k)
          ? null
          : undefined
        : NUMERIC_COLS.has(k)
          ? Number(v)
          : v;
  }
  return out as T;
}

// Domain object (or partial patch) -> row. Undefined keys are omitted so DB
// defaults apply and PATCH semantics hold; explicit null passes through. Never
// writes id/createdAt/updatedAt unless the caller included them intentionally.
export function toRow(obj: object): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined) continue;
    row[WRITE_ALIAS[k] ?? camelToSnake(k)] = v;
  }
  return row;
}
