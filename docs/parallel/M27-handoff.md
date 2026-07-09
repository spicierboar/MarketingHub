# M27 — Public REST API handoff (2026-07-09)

**Agent:** M27-W2-PublicAPI · **Branch:** `w2/m27-public-api`

`m27_handoff=yes`

## Shipped

- `/api/v1/*` REST catalog (companies, content, leads) with Bearer API-key auth
- Tenant-pin from key record; optional per-key company scope; audited mutations
- Partner webhooks: register, GET challenge verify, HMAC outbound delivery
- `/developers` admin UI · migration `0029_public_api.sql` · `docs/public-api-manifest.yaml`
- Self-test: `src/lib/selftest/public-api.ts`

## Gate

`PUBLIC_API_LIVE` — open in dev/staging; set `true` for production.

## Next

M01-W2 fan-in after M25 handoff.