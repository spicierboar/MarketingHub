# M11 — AI-MOS suggest-only v1 handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/ai-mos.ts`
  - Monitors health scores (`buildCompanyHealthScore`), calendar gaps (`detectCalendarGap`), publishing cadence (`detectPublishingCadence`), and top recommendations (`generateRankedForCompany`)
  - `detectOpportunitiesFromSignals()` — pure diagnosis + suggested action cards with evidence
  - `surfaceTenantOpportunities()` — dedupes by kind per company, logs `ai_run` kind `ai_mos_scan`
  - `convertOpportunityToDraft()` — campaign path via `buildCampaignFromGoal` + `spawnGovernedDraftForItem` (draft only); content path redirects to prefilled request builder
  - `dismissOpportunity()` — persists reason + `ai_run` kind `ai_mos_dismiss` + audit `ai_mos.dismissed`
- **Persistence:** `companies.profile.aiMos.opportunities` jsonb (Supabase) + in-memory `aiMosOpportunities` array (demo). **No migration** — slot **0024** reserved.
- **UI**
  - `src/components/ai-mos-opportunity-cards.tsx` — opportunity cards with accept/dismiss
  - `/ai-mos` — per-company scan + open/history panels
  - `/dashboard` — admin AI-MOS strip when open opportunities exist
  - Nav: **AI-MOS** (admin) in `app-shell.tsx`
- **Actions:** `src/app/(app)/ai-mos/actions.ts` — `scanAiMosAction`, `acceptAiMosOpportunityAction`, `dismissAiMosOpportunityAction`
- **Self-test:** +3 in `src/lib/selftest/ai-mos.ts`
  - `aiMos.signalsProduceOpportunity`
  - `aiMos.convertCreatesDraftOnly`
  - `aiMos.dismissAudited`

## Do not touch (parallel / integrator)

- `src/lib/agency-ops.ts` (M12)
- `src/lib/publish-queue.ts`
- `src/app/(app)/calendar/actions.ts` critique gate
- `HANDOVER.md` — integrator updates after batch 5

## Verified

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npx tsx scripts/run-fixtures.mjs
# self-test 52/52 (+3 aiMos) + queue-test 18/18 (if agency-ops +3 on branch → 55/55)
```

M11-specific fixture delta: **+3** AI-MOS checks.

## Next module

V1 module 12 of 15 — Agency ops slice (if not already integrated on branch)
