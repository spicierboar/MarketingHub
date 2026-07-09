# M02 — Business profiles (retail + hotel) handoff

**Agent:** M02-Profiles  
**Date:** 2026-07-08  
**Branch:** `v1-m02-business-profiles` — **may be behind `main`.** M02 work started from a workspace snapshot that predated **module 3 (AI assistant hardening)** landing on `main`. Rebase or merge `main` before integrating this branch. (No `.git` was present at M02 build time.)

## Addendum (owner, 2026-07-08)

- **Module 3 (AI assistant hardening) is DONE on `main`** — M02 did **not** rebuild critique, duplicate warnings, token caps, or `0015_ai_hardening.sql`.
- **No M02 migration** — vertical fields use existing `companies.profile` jsonb. `0015_ai_hardening.sql` is M03 only; no `0015_*` or `0016_*` file was created for M02.
- **Territory respected** — `src/app/(app)/calendar/actions.ts` and `src/app/(app)/studio/actions.ts` were **not** edited.
- **Incidental build-unblock edits** (not M02 scope; reconcile with `main` / M04 / M05 owners): `src/lib/calendar-intelligence.ts`, `src/lib/content-repurposing.ts`, `src/lib/types.ts` (`RepurposePlatform`), `src/lib/db/index.ts` (`Tenant` export), `src/components/ui/button.tsx` (`secondary` variant). Drop these if `main` already has equivalent fixes.

## Shipped

- **`src/lib/business-profiles.ts`** — `BusinessType`, vertical field types, `resolveBusinessType`, `CAMPAIGN_GOALS`, `CONTENT_TEMPLATES`, `buildBusinessProfileAiContext`, form helpers.
- **`CompanyProfile` jsonb extensions** in `src/lib/types.ts` — `businessType`, `retail`, `hotel`, `restaurant` slices (no new DB tables).
- **Company onboarding UI** — `/companies/[id]`: business-type picker + conditional retail / hotel / restaurant sections (`business-profile-fields.tsx`); sidebar shows recommended campaign goals + content templates.
- **Server actions** — `saveOnboardingAction` persists vertical fields via `assertAdminCompanyAccess`; only updates the slice matching the active business type (preserves other slices on type switch).
- **AI wiring** — `buildBusinessProfileAiContext` injected into `src/lib/ai/draft.ts` (`brandBrainContext`) and `src/lib/ai/campaign.ts` (`planContext`).
- **Campaign UX** — `/campaigns/new` shows business-type objective hints (`campaign-objective-hints.tsx`).
- **Seed data** — Millbrook IGA (`retail`), Golden Wattle Motel (`hotel`), Wattle & Bean Cafe (`restaurant_cafe`) extended with structured vertical fields.
- **Self-test** — `businessProfiles.retailAiContext` + `businessProfiles.hotelAiContext` in `src/lib/selftest/isolation.ts`.

## Migration

**None required.** All new fields live in existing `companies.profile` jsonb. **`0015_ai_hardening.sql` = M03 (AI hardening) on `main`** — M02 did not add or rename any migration.

## Verify (2026-07-08)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | pass |
| `npm run build` | pass |
| `npx tsx scripts/run-fixtures.mjs` self-test | **35/35** |
| queue-test | **18/18** |

> Note: see **Addendum** above for incidental cross-module type fixes applied only to unblock `tsc`/`build` in this snapshot.

## Routes

No new routes. Build remains at **~55 app routes** (same surface; onboarding page enhanced).

## Tenant isolation

All profile writes go through `assertAdminCompanyAccess(companyId)` in `src/app/(app)/companies/actions.ts`.

## Next integrator

- Update `HANDOVER.md` “▶ NEXT SESSION” — mark module 2 **DONE**, bump V1 tracker to 2/15 complete.
- Owner: no migration paste for M02.
- Suggested next no-keys build: **calendar intelligence** (module 4) or **content repurposing** (module 5) per tracker priority.
