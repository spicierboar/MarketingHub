# M55 handoff — Video studio + continuous learning

**Branch work:** on `main` (code-only, W7)  
**Status:** implemented · `VISUALS_LIVE` unchanged (OFF) · critique gate untouched

## Delivered

### A) Video studio
- `src/lib/video-studio.ts` — templates, script packs, FB/IG/TikTok/GBP channel variants → governed draft specs; placeholder render when `VISUALS_LIVE` off
- `/visuals` — Video studio panel: template → script pack → draft `ai_draft` script → generate vertical variants (`pending_approval` assets via existing `persistGeneratedAsset`)
- Actions: `draftVideoStudioScriptAction`, `generateVideoStudioVariantsAction` (metering + rate limits per variant)

### B) Continuous learning
- `src/lib/learning-connectors.ts` — `learningLive()` on `LEARNING_LIVE` (default OFF)
- `src/lib/learning.ts` — hypotheses, experiment outcomes, lessons register; dismiss → lesson via `recordDismissLesson` wired in recommendations dismiss
- Types in `src/lib/types.ts`
- In-memory store + `db/index.ts` + `supabase-adapter.ts`
- Migration `supabase/migrations/0034_learning.sql` (RLS `has_company_access`)
- `/learning` admin page + nav under **Website & growth**
- Self-test: `src/lib/selftest/learning.ts` (parent wires into `/api/dev/self-test`)

## Verify

```bash
cd command-centre
npx tsc --noEmit
```

Self-test keys (after parent wires `runLearningSelfTests`):
- `learning.liveDefaultOff`
- `learning.dismissRecordsLesson`
- `learning.hypothesisOutcome`
- `learning.tenantIsolation`
- `videoStudio.templates`
- `videoStudio.channelVariants`
- `videoStudio.draftSpec`

Manual UI:
1. `/visuals` — pick template + pack → **Draft script** → content `ai_draft`; fill script → **Generate vertical variants** → assets `pending_approval`
2. `/recommendations` — dismiss a rec → `/learning` shows lesson
3. `/learning` — add hypothesis, record outcome

## Migration notepad

Apply `supabase/migrations/0034_learning.sql` on staging Supabase before relying on persisted learning rows (in-memory works without migration).

Note: `0034_bookings.sql` may already exist from M50 — both are independent; apply both in filename order.

## Hard locks respected

- Critique gate not modified
- `VISUALS_LIVE` not flipped
- `appEnv()` / tenant isolation / OAuth-only auth unchanged
- Did not edit: bookings*, local-seo*, exec-dash*, public-api*, security-slice*, self-test/route.ts

## Blockers

- None for code-only path. Live video rendering still requires `VISUALS_LIVE` + provider keys (unchanged).
- Parent agent must wire `runLearningSelfTests` into `src/app/api/dev/self-test/route.ts`.
