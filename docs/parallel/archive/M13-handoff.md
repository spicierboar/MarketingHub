# M13 — Auto-onboarding handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/auto-onboarding.ts`
  - `autoOnboardingLive()` — live HTTP gated on `appEnv()` + `AUTO_ONBOARDING_FETCH_KEY` (+ `AUTO_ONBOARDING_LIVE` in production)
  - `scrapeForOnboardingPreview()` — consent-required scrape of website + public social URLs → field preview
  - `simulatePageContent()` — deterministic extraction when live keys off
  - `fetchLivePageContent()` — meta-tag HTML parse when live
  - `applyExtractedFields()` — merge selected fields into `CompanyProfile` (optional overwrite)
  - `buildAutoOnboardingMeta()` — jsonb audit trail slice on profile
- **Profile jsonb:** `CompanyProfile.autoOnboarding` — last scrape/apply/consent metadata (no migration)
- **UI:** `src/components/auto-onboarding-panel.tsx` on `/companies/[id]`
  - Client consent checkbox (required)
  - Website + social URL inputs (pre-filled from profile)
  - Preview extracted fields with confidence + “already set” badges
  - Select fields + optional overwrite → apply
- **Server actions:** `src/app/(app)/companies/auto-onboarding-actions.ts`
  - `previewAutoOnboardingAction` — tenant-pinned via `assertAdminCompanyAccess`, audit `auto_onboarding.scraped`
  - `applyAutoOnboardingAction` — tenant-pinned, audit `auto_onboarding.applied`
- **Env:** `.env.example` — `AUTO_ONBOARDING_LIVE`, `AUTO_ONBOARDING_FETCH_KEY`
- **Self-test:** +3 in `src/lib/selftest/auto-onboarding.ts`
  - `autoOnboarding.consentRequired`
  - `autoOnboarding.simulatedWhenLiveOff`
  - `autoOnboarding.applyPrefillsProfile`

## Migration

**None required** — scrape metadata stored in `companies.profile` jsonb (`autoOnboarding` slice). Slot **0026** remains reserved.

## Do not touch (parallel modules)

- `src/lib/security-slice.ts` (M15)
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — integrator updates after batch 6

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean
npx tsx scripts/run-fixtures.mjs
# self-test 61/61 + queue-test 18/18 (M13 +3 · M15 +3 integrated)
```

M13-specific fixture delta: **+3** auto-onboarding checks (55 → 58 post-batch-5; **61/61** with M15 security slice also integrated).

## Next module

V1 module 14 of 15 — Photographer marketplace
