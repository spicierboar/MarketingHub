# M30 — CRM program management handoff (2026-07-09)

**Agent:** M30-W3-CRM · **Branch:** `w3/m30-crm`

`m30_handoff=yes`

## Shipped

- `/crm` — contacts, segments, interaction history, dedup merge, consent
- `src/lib/crm.ts` + `src/lib/crm-connectors.ts` — CRM_LIVE gate, attribution helpers
- `src/lib/ad-leads.ts` — ad lead ingest bridges to CRM contact + interaction
- `src/lib/analytics-connectors.ts` — internal CRM attribution fallback + CRM_API_URL hook
- `GET /api/crm/leads` — attribution count API (CRM_API_KEY optional)
- Migration `0031_crm.sql`
- Self-test `crm.*` (+9) wired into isolation + `/api/dev/self-test`

## Hard lock

`PUBLISHING_LIVE` · `ADS_LIVE` · `ANALYTICS_LIVE` — **not flipped**

## Next

M01-W3 fan-in after M30–M33 handoffs ready
