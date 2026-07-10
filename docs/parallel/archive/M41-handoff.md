# M41 — AI recommendations (full) handoff (2026-07-10)

**Agent:** M41-W5-Recommendations · **Branch:** `w5/m41-recommendations`

`m41_handoff=yes`

## Shipped

- **Engine:** `src/lib/recommendations.ts` + `src/lib/recommendations-connectors.ts`
  - Ranked 3–5 opportunities from analytics, CRM, calendar, reviews, loyalty, Brand Brain
  - Supplemental types: `seo_gap`, `review_gap`, `loyalty_opportunity`, `retention_risk`
  - `RECOMMENDATIONS_LIVE` gate (simulated when OFF — default)
  - Snooze with until-date; dismiss history dedupe on regenerate
  - Agency portfolio attention strip helper
- **Calendar (extend-only):** `recommendationGapUrgencyBoost` + `recommendationCadenceUrgencyBoost` in `calendar-intelligence.ts`
- **Migration:** `supabase/migrations/0033_recommendations.sql` — snooze columns, dismiss history, portfolio snapshots (company-scoped RLS)
- **UI:** `/recommendations` — rank/score, accept/dismiss/snooze, evidence trail, agency portfolio strip
- **Self-test:** +7 checks in `src/lib/selftest/recommendations.ts` (10 total) wired into `isolation.ts`

## Gate

`RECOMMENDATIONS_LIVE` — off in dev/staging; set `true` for production adapter.

## Verified

```powershell
cd F:/MarketingHub/command-centre-m41
npx tsc --noEmit
npx tsx scripts/run-fixtures.mjs
```

M41-specific fixture delta: **+7** recommendation checks (131 → 138 baseline expectation).

## Next

M01-W5 fan-in after M40–M43 handoffs ready.
