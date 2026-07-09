# M09 — Recommendations v1 handoff (2026-07-08)

## Shipped

- **Engine:** extended `src/lib/ai/recommend.ts` + new `src/lib/recommendations.ts`
  - Ranked 3–5 actions from analytics report, calendar gaps, publishing cadence, Brand Brain signals
  - Explicit type-weight scoring + rationale boosts (not generic AI text)
  - New types: `calendar_gap`, `publishing_cadence`
  - `generateRankedForCompany()` caps and sorts; score stored in `action._score` jsonb (no migration)
  - Dismiss reason persisted in `action.dismiss` jsonb via `withDismissReason()`
- **Calendar signals:** `detectCalendarGap()` + `detectPublishingCadence()` in `src/lib/calendar-intelligence.ts` (extend-only on M04)
- **UI:** improved `/recommendations` cards — rank badge, score, dismiss-reason field, sorted list
  - `src/components/recommendation-cards.tsx` — shared `RecommendationCard` + `RecommendationStrip`
  - Compact top-3 strip on `/companies/[id]` when AI-ready and open recs exist
- **Actions:** `src/app/(app)/recommendations/actions.ts` — generate uses ranked engine; dismiss captures reason; accept paths unchanged (`toCampaignAction` / `toRequestAction` / `toTaskAction`)
- **Self-test:** +3 checks in `src/lib/selftest/recommendations.ts`
  - `recommendations.rankedTopFive`
  - `recommendations.calendarGapSignal`
  - `recommendations.dismissPersistsReason`

## Migration

**None required** — score + dismiss reason stored in existing `action` jsonb. Slot **0022** remains reserved if a dedicated `score` / `dismiss_reason` column is ever wanted for reporting.

## Do not touch (parallel modules)

- `src/lib/ai/campaign-builder.ts` (M07)
- `src/lib/gbp-audit.ts` (M06)
- `src/app/(app)/calendar/actions.ts` critique gate (M04)
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — this file is the M09 handoff

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean — 54 routes
npx tsx scripts/run-fixtures.mjs
# self-test 44/44 + queue-test 18/18
```

M09-specific fixture delta: **+3** recommendation checks.

## Next module

V1 module 10 of 15 — Health scores (v1 slice)
