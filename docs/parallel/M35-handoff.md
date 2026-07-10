# M35 — Funnel / A/B handoff (2026-07-10)

**Agent:** M35-W4-Funnel · **Branch:** `w4/m35-funnel`

`m35_handoff=yes`

## Shipped

- `/funnel` — journey mapping, conversion stages, landing analytics, A/B experiments (admin)
- `src/lib/funnel.ts` + `src/lib/funnel-connectors.ts` — FUNNEL_LIVE gate, stage drop-off, CTA metrics, simulated A/B winner
- Migration `0032_funnel.sql` — funnel_journeys, conversion_funnels, funnel_landing_pages, funnel_ab_experiments + RLS
- Self-test `funnel.*` (+12) wired into isolation + `/api/dev/self-test`

## Hard lock

`FUNNEL_LIVE` — **not flipped** (simulated landing analytics and A/B results until FUNNEL_API_KEY is set)

## Next

M01-W4 fan-in after M34–M37 handoffs ready
