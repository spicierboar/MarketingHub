# M19 — Field sales wizard handoff (2026-07-09)

**Agent:** M19-P0-FieldSales · **Branch:** `p0/m19-field-sales`  
**Depends:** M16 merged to `main`

## Shipped (module M9)

### Route: `/sales/new-client`

Tablet-friendly 5-step wizard (reuses onboarding Stepper pattern):

1. **Business** — company name, business type + vertical fields, AI profile seeds
2. **Add-ons** — multi-select from `ADDON_ORDER` catalogue
3. **Checkout** — sequential `createAddonCheckoutSession` per add-on (demo: direct entitlement)
4. **Client login** — `createUser` + `addMembership(member)` + `grantAccess(company)`
5. **Done** — summary + links

### New files

- `src/app/(app)/sales/new-client/page.tsx`
- `src/app/(app)/sales/actions.ts`

### Modified files

- `src/lib/auth/rbac.ts` — `isSalesRep()`, `canAccessFieldSales()`, `requireSalesRepOrAdmin()`
- `src/lib/billing.ts` — optional `returnPaths` on `createAddonCheckoutSession` (wizard return URLs)
- `src/components/app-shell.tsx` — **New client** nav (`salesAccess`)
- `src/app/(app)/layout.tsx` — passes `canFieldSales` to shell

## Access control

- Gate: `requireSalesRepOrAdmin()` → tenant `admin`/`super_admin` OR `role_title === "sales_rep"`
- Company created under **session tenant** (`user.tenantId`), not a new tenant
- All company mutations via `assertAdminCompanyAccess` (tenant-pinned)

## Provisioning flow

```text
saveBusinessStepAction → createCompany + updateCompany(profile)
saveAddonsStepAction   → redirect with ?addons=...
startAddonCheckoutAction → Stripe or demo entitlement per add-on
provisionClientAction  → portal member + single company_access
```

Client signs in via existing magic-link flow at `/login` → M17 portal at `/client`.

## Verify

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |

## Not touched (per ownership)

- `src/app/(client)/**`
- `src/lib/client-approval.ts`
- `src/app/approve/[token]/actions.ts`
- No migration 0028 · no `PUBLISHING_LIVE` / `ADS_LIVE`

## M00 integrator notes

- Merge order: m18 → m17 → **m19** (per orchestration)
- `rbac.ts` may conflict with M17 `requirePortalUser` — keep both guards
- `createAddonCheckoutSession` signature extended (backward-compatible optional arg)
