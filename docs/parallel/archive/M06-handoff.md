# M06 — GBP local audit handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/gbp-audit.ts`
  - NAP, hours, categories, photos, FAQ checklist vs connected GBP profile
  - `buildCanonicalGbp()` — ground truth from company profile + `LocalAreaProfile`
  - `simulateGbpSnapshot()` — deterministic listing when `PUBLISHING_LIVE` / Google OAuth off
  - `fetchLiveGbpSnapshot()` — live GBP Business Information API when `gbpAuditLive()` true
  - `runGbpAudit()` / `buildGbpAuditForCompany()` — scored checklist with actionable fixes
- **UI:** `/companies/[id]/local-seo`
  - `src/app/(app)/companies/[id]/local-seo/page.tsx`
  - `src/components/gbp-audit-panel.tsx` — score cards, priority fixes, full checklist
  - Nav link **Local SEO** on company profile header
  - Wires `findConnectedIntegration`, `getLocalProfile`, approved DAM photos, FAQ content count
- **Self-test:** +3 checks (`gbpAudit.napConsistency`, `gbpAudit.simulatedWhenLiveOff`, `gbpAudit.checklistActionable`)

## Migration

**None required** — profile jsonb + existing `publishing_integrations` only. Migration slot **0019** remains reserved (unused).

## Do not touch (parallel modules)

- `src/app/(app)/calendar/actions.ts` (M04 critique gate)
- `src/app/(app)/studio/actions.ts` (M05 repurpose)
- `src/lib/business-profiles.ts` (M02)
- `src/lib/ai/critique.ts`, `similarity.ts` (M03)
- `HANDOVER.md` — integrator updates after merge

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next; npm run build   # clean — 55 routes (+1 local-seo)
npx tsx scripts/run-fixtures.mjs
# self-test 38/38 + queue-test 18/18
```

M06-specific fixture delta: **+3** GBP audit checks (suite total **38/38**).

## Live API gate

`gbpAuditLive()` requires `PUBLISHING_LIVE=true` + `PUBLISHING_TOKEN_KEY` + `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`. Owner has Google Cloud billing blocked — keep OFF; simulated mode is deterministic.

## Next module

V1 module 7 of 15 — AI campaign builder (v1)
