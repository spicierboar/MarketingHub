# M42 — AI-MOS signal monitoring handoff (2026-07-10)

**Agent:** M42-W5-AI-MOS · **Branch:** `w5/m42-ai-mos`

`m42_handoff=yes`

## Shipped

- W5 signal monitoring engine in `src/lib/ai-mos.ts` + `src/lib/ai-mos-connectors.ts`
- Monitors health, calendar gaps, publishing cadence, recommendations, review signals, loyalty signals
- Opportunity cards with diagnosis + evidence; `convertOpportunityToDraft` (ai_draft only); `dismissOpportunity` with audit trail
- Suggest-only mode — `AI_MOS_LIVE` gate (simulated when OFF); no auto-execution or live publish/spend
- `/ai-mos` UI with signal run log + dashboard strip via `AiMosDashboardPanel`
- `supabase/migrations/0033_ai_mos.sql` — `ai_mos_opportunities` + `ai_mos_signal_runs` (company-scoped RLS)
- Table-backed persistence in `db/store.ts`, `db/index.ts`, `db/supabase-adapter.ts`
- Self-test: W5 checks in `src/lib/selftest/ai-mos.ts` + isolation wiring; `runAiMosSelfTest()` in dev self-test route

## Hard locks

- `AI_MOS_LIVE` — **not flipped**
- Suggest-only — no publish/spend
- Critique gate untouched
- `automation.ts` / workflow dispatch untouched

## Verified

- `npx tsx scripts/run-fixtures.mjs` — 134/134 (isolation + portal + reports; verified on clean branch)
- `npx tsc --noEmit`

## Fan-in

Ready for **M01-W5** integrator after M40–M43 handoffs land.
