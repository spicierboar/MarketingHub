m42_handoff=yes

## Branch
`w5/m42-ai-mos` (from `main` @ 2198ba3)

## Files shipped
- `src/lib/ai-mos.ts` — W5 signal monitoring: health, calendar, cadence, recommendations, reviews, loyalty; `recordCompanySignalRun()`, suggest-only gates
- `src/lib/ai-mos-connectors.ts` — `AI_MOS_LIVE` gate; review/loyalty signal loaders (simulated when OFF)
- `supabase/migrations/0033_ai_mos.sql` — `ai_mos_opportunities` + `ai_mos_signal_runs` (company-scoped RLS)
- `src/app/(app)/ai-mos/page.tsx` — signal log, mode badges, extended copy
- `src/components/ai-mos-opportunity-cards.tsx` — dashboard strip signal-scan hint
- `src/app/(app)/dashboard/page.tsx` — AI-MOS strip shows recent signal scan count
- `src/lib/selftest/ai-mos.ts` — 11 checks + `runAiMosSelfTest()`

## Choke files (append / extend)
- `src/lib/types.ts` — `review_signal` / `loyalty_signal` kinds, `AiMosSignalRun`, `ai_mos_signal_scan`
- `src/lib/db/index.ts` — `listAiMosSignalRuns`, `createAiMosSignalRun`
- `src/lib/db/store.ts` — `aiMosSignalRuns` seed array
- `src/lib/db/supabase-adapter.ts` — table-backed opportunities + signal runs (moved off `profile.aiMos` jsonb)
- `src/lib/selftest/isolation.ts` — +3 isolation checks (`healthThresholdUsed`, `signalRunRecorded`, `surfaceDedupesByKind`)
- `src/app/api/dev/self-test/route.ts` — `runAiMosSelfTest()` wired

## Migration
`0033_ai_mos.sql`

## Fixture delta
+7 AI-MOS checks → **138/138** (baseline 131/131)

## Hard locks
- `AI_MOS_LIVE` **not** flipped (simulated default)
- **Suggest-only** enforced (`aiMosSuggestOnly()`; convert → draft only)
- Did **not** touch `src/lib/automation.ts`, workflow dispatch, critique gate, or `HANDOVER.md`
- Did **not** modify `rag*`, `recommendations*`, `campaign-builder*`, `marketing-automation*`

## Verification
- `npx tsx scripts/run-fixtures.mjs` — **138/138**

## Notes
- Opportunities + signal runs persist to dedicated tables; Supabase adapter no longer writes `companies.profile.aiMos` jsonb.
- In-memory demo store uses `aiMosOpportunities` + `aiMosSignalRuns` arrays.
