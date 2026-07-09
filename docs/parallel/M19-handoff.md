# M19 — Field sales wizard handoff (2026-07-09)

**Agent:** M19-P0-FieldSales · **Branch:** `p0/m19-field-sales`

## Shipped (module M9)

- **`/sales/new-client`** — 5-step wizard: business → add-ons → Stripe checkout → provision client → done
- **`src/app/(app)/sales/actions.ts`** — createCompany (session tenant), sequential addon checkout, provision client + magic-link
- **`rbac.ts`** — `requireSalesRepOrAdmin()` (admin or `role_title=sales_rep`)
- **`app-shell.tsx`** — **New client** nav (`salesAccess` + `canFieldSales`)
- **`billing.ts`** — optional return URLs on `createAddonCheckoutSession`

## Verified

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
npm run build
```

## Flags

- `m19_handoff=yes` in PROGRESS.md
- No migration 0028 · live flags unchanged
