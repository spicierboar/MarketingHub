# M04 — Calendar intelligence handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/calendar-intelligence.ts`
  - AU-aware seasonal / holiday / local-event planning prompts (`seasonalPromptsForMonth`)
  - Analytics-informed optimal post windows from published posts + industry/generic fallbacks (`optimalPostWindows`)
  - Agency portfolio filters: client, status, channel, business type (`filterPortfolioEntries`, `portfolioSummary`)
  - Soft schedule timing hints (`scheduleTimingHint`)
  - Tenant timezone via `resolveQueueClock` in `buildCalendarIntelligence`
- **UI:** extended `src/app/(app)/calendar/page.tsx`
  - Intelligence panel (seasonal prompts + optimal windows)
  - Business type filter (from `company.profile.industry` as-is — no M02 type changes)
  - Portfolio table view (`?view=portfolio`) with client/channel/type summary cards
  - Optimal-timing advisories on scheduled post warnings
- **Components:** `src/components/calendar-intelligence-panel.tsx`
- **Schedule actions:** `src/app/(app)/calendar/actions.ts` — **unchanged** Module 3 `critiqueForPublish` gate at `scheduleOne()` (extend-only; not weakened)
- **Self-test:** +3 checks (`calendarIntelligence.seasonalPromptsAu`, `optimalWindowsTenantScoped`, `portfolioFilterBusinessType`)

## Migration

**None required** — compute-only on existing calendar + analytics data. Migration slot reserved: **0017_*** if ever needed (0015 = ai_hardening).

## Do not touch (parallel modules)

- `src/lib/business-profiles.ts`, companies onboarding (M02)
- `src/app/(app)/studio/**` (M05)
- `src/lib/types.ts` `CompanyProfile` shape (M02)
- `HANDOVER.md` — this file is the M04 handoff

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
npm run build             # clean — 54 routes
npx tsx scripts/run-fixtures.mjs
# self-test 35/35 + queue-test 18/18
```

M04-specific fixture delta: **+3** calendar intelligence checks (suite total **35/35** includes parallel M02/M05 checks already in `isolation.ts`).

## Next module

V1 module 5 of 15 — Content repurposing (v1 platforms)
