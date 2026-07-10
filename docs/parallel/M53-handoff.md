# M53 handoff — Public API expansion (W7)

**Branch work:** on `main` (code-only)  
**Status:** implemented · `PUBLIC_API_LIVE` unchanged (OFF in production by default)

## Delivered

- **Read endpoints** (tenant-scoped via API key):
  - `GET /api/v1/campaigns` · `GET /api/v1/campaigns/{id}` — scope `campaigns:read`
  - `GET /api/v1/reservations` · `GET /api/v1/reservations/{id}` — scope `reservations:read`
  - `GET /api/v1/reviews` · `GET /api/v1/reviews/{id}` — scope `reviews:read`
- **Catalog** (`src/lib/public-api/catalog.ts`): W7 expansion notes under `versioning`; `rateLimits` documented; `PUBLIC_API_VERSION` stays `v1`
- **Rate limits** (`src/lib/public-api/auth.ts`): tighter tiered buckets — `public_api_auth` 60/min, `public_api_read` 90/min, `public_api_write` 40/min (was single 120/min bucket)
- **Scopes** (`src/lib/types.ts`): `campaigns:read`, `reservations:read`, `reviews:read`
- **Serializers** (`src/lib/public-api/serializers.ts`): campaign, reservation, review (draft responses omitted from review payload)
- **OpenAPI stub** (`docs/public-api-manifest.yaml`)
- **Self-test** (`src/lib/selftest/public-api.ts`): catalog route checks, new scopes, tenant isolation for campaigns/reservations/reviews

## Not touched

- Bookings engine, local-seo, exec-dash, security-slice, video, learning, app-shell, `self-test/route.ts`
- No migration (`0034_api.sql` not needed)
- `PUBLIC_API_LIVE` not flipped

## Verify

```bash
cd command-centre
npx tsc --noEmit
```

- Self-test: `publicApi.*` checks via `/api/dev/self-test` (includes `catalog.w7RoutesListed`, `isolation.campaignListTenantScoped`, etc.)
- With `PUBLIC_API_LIVE=true` (or dev default on):
  - `GET /api/v1` — catalog lists new routes + versioning block
  - Mint key with `campaigns:read` → `GET /api/v1/campaigns` with Bearer token
  - Cross-tenant id returns 404 via `assertCompanyInScope`

## Blockers

- None for code-only delivery. Production enablement still requires explicit `PUBLIC_API_LIVE=true`.

## Next

M01-W7 fan-in after parallel W7 modules land.
