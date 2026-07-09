# M27 - Public REST API handoff (2026-07-09)

**Agent:** M27-W2-PublicAPI | **Branch:** `w2/m27-public-api`

`m27_handoff=yes`

## Shipped

- `/api/v1/*` REST catalog (companies, content, leads) with Bearer API-key auth
- Tenant-pin from key record; optional per-key company scope; audited mutations
- Partner webhooks: register, GET challenge verify, HMAC outbound delivery
- `/developers` admin UI | migration `0029_public_api.sql` | `docs/public-api-manifest.yaml`
- Self-test: `src/lib/selftest/public-api.ts` (wired into `/api/dev/self-test`)

## Gate

`PUBLIC_API_LIVE` - open in dev/staging; set `true` for production.

## Isolation rule

API keys carry `tenantId`; all reads/writes tenant-pin from the key record. Optional `companyIds` on the key further restricts company scope. Session auth remains separate (`/developers` admin UI).

## Verified (2026-07-09)

- `npx tsc --noEmit` clean
- `npm run build` clean
- fixtures: self-test **103/103** | queue-test **20/20**
- UTF-16 encoding fixes on public-api sources + developers actions

## Next

M01-W2 fan-in (M24-M27 all `m*_handoff=yes`).