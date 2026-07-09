# M19 ΓÇö Field sales wizard handoff (2026-07-09)

**Agent:** M19-P0-FieldSales ┬╖ **Branch:** `p0/m19-field-sales`

## Shipped

- `/sales/new-client` ΓÇö 5-step wizard: business ΓåÆ add-ons ΓåÆ checkout ΓåÆ provision ΓåÆ done
- `src/app/(app)/sales/actions.ts` ΓÇö createCompany (session tenant), addon checkout, provision client
- `rbac.ts` ΓÇö `requireSalesRepOrAdmin()` (admin or `role_title=sales_rep`)
- `app-shell.tsx` ΓÇö **New client** nav item
- `billing.ts` ΓÇö optional return URLs on `createAddonCheckoutSession`

## Verify

- `npx tsc --noEmit` ΓÇö pass (M19 scope only; no `(client)/**` on branch)
- `npm run build` ΓÇö pass on clean M19 branch

## Flags

- `m19_handoff=yes` in PROGRESS.md
- No migration 0028 ┬╖ live flags unchanged
