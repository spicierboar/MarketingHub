# M07 — AI campaign builder handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/ai/campaign-builder.ts`
  - Plain-language goal → strategy + channel plan + KPIs + calendar plan
  - `buildCampaignFromGoal()` — Claude JSON layer when `ANTHROPIC_API_KEY` set; deterministic goal parsing otherwise
  - Reuses `generateCampaignPlan` + `buildBusinessProfileAiContext`
  - KPIs/strategy packed into `campaigns.key_message` via `<!--m07:…-->` marker (no migration)
  - `spawnGovernedDraftForItem()` — creates `ai_draft` content + links campaign items; compliance + routing applied
  - `spawnedContentNotScheduled()` — invariant helper for tests
- **Server action:** `createCampaignFromGoalAction` in `src/app/(app)/campaigns/actions.ts`
  - Tenant-pinned via `assertCompanyAccess`
  - AI budget + rate limits
  - Spawns all plan items as governed drafts (never scheduled)
- **UI:** `/campaigns/new` — **Build from goal** panel (primary) + existing manual planner below
  - `src/components/campaign-builder-panel.tsx` — quick goals + vertical hints
- **Detail page:** `/campaigns/[id]` — unpacks strategy, channel plan, KPIs, risk notes from goal-built campaigns
- **Self-test:** +3 checks in `src/lib/selftest/campaign-builder.ts`
  - `campaignBuilder.goalProducesPlan`
  - `campaignBuilder.spawnsDraftContentNotScheduled`
  - `campaignBuilder.kpisPresent`

## Migration

**None required** — existing `campaigns`, `campaign_items`, `content_items` tables only. Migration slot **0020** remains reserved (unused).

## Do not touch (parallel modules)

- `src/lib/gbp-audit.ts` (M06)
- `src/lib/ai/recommend.ts`, `src/app/(app)/recommendations/**` (M09)
- `src/app/(app)/calendar/actions.ts` critique gate (M04)
- `src/app/(app)/studio/actions.ts` (M05)
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — integrator updates after merge

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npx tsx scripts/run-fixtures.mjs
```

M07-specific fixture delta: **+3** campaign builder checks.

## Governance

- Campaign stays `draft` until submit + admin approve (unchanged)
- Spawned content is `ai_draft` only — submit/approve/schedule gates unchanged
- Paid `ad_copy` items route via existing `routeContent` senior path

## Next module

V1 module 8 of 15 — Brand Brain RAG (v1) · or module 9 Recommendations if batch 3 continues in parallel
