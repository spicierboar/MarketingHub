# M23 — Portal migration handoff (2026-07-09)

**Agent:** M23-W1-PortalMigration · **Branch:** `w1/m23-portal-migration`  
**Merge first** in M01-W1 integrator (before M20–M22).

`m23_handoff=yes`

## Shipped

### Migration 0028 — `portal_only` flag

- **New:** `supabase/migrations/0028_portal_and_sales.sql`
  - `tenant_members.portal_only boolean not null default false`
  - Idempotent; app degrades gracefully pre-paste (inference path only)

### RBAC — explicit flag + inference fallback

- **Modified:** `src/lib/auth/rbac.ts`
  - `isPortalUser()` — when `portal_only` is set on membership → portal user; else infer `member` + exactly one `company_access` in tenant
  - `portalCompanyId()` — unchanged (single company_access required)
- **Modified:** `src/lib/types.ts` — `TenantMember.portalOnly?: boolean`
- **Modified:** `src/app/(app)/sales/actions.ts` — `provisionClientAction` sets `portalOnly: true` on new client memberships

## Owner paste (agent did NOT apply to live DB)

**When:** After M01-W1 merges W1 to `main` (or before W6 go-live). **Not during P0/W0 chain.**

Live project: `hrwkshspqeulgrmpqtpx` (migrations **0001–0015 + 0027** applied as of 2026-07-09).

1. Open Supabase Dashboard → SQL Editor → New query
2. Paste the full contents of:

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0028_portal_and_sales.sql
```

3. Run once; confirm `portal_only` column exists on `tenant_members`
4. Redeploy Vercel if already on a build that includes M23 RBAC changes

**Do not** set `PUBLISHING_LIVE` / `ADS_LIVE` as part of this step.

## Do not touch (parallel W1 modules)

- `src/app/(client)/client/reports/**` — M20
- `src/lib/calendar-intelligence.ts` — M22
- Company intel panel — M21
- `PUBLISHING_LIVE` / `ADS_LIVE` unchanged

## Verified (2026-07-09)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean
```

## Next step

M01-W1 merges `w1/m23-portal-migration` → `w1/m20-client-reports` → `w1/m21-intel-panel` → `w1/m22-calendar-assist`.
