# M10 — Health scores v1 handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/health-scores.ts`
  - Single marketing-health score per company (0–100)
  - Factors: publishing cadence (`detectPublishingCadence` from M04), approval backlog, paid/simulated ROAS (`campaignMetrics`), lead volume (captured + post-attributed)
  - Explainable drill-down: each factor has label, weight, contribution points, and evidence string
  - `companiesNeedingAttention()` — agency portfolio helper (lowest scores / threshold, default 60)
  - `buildTenantHealthScores()` / `buildCompanyHealthScore()` — tenant-scoped loaders
- **UI**
  - `src/components/health-score-card.tsx` — `HealthScoreCard` + `HealthAttentionList`
  - `/companies/[id]` — marketing health card in sidebar (factor drill-down)
  - `/dashboard` — agency “Clients needing attention” list (admin only, top 6 below threshold)
- **Self-test:** +3 in `src/lib/selftest/health-scores.ts`
  - `healthScores.scoreInRange`
  - `healthScores.factorsExplainable`
  - `healthScores.agencyNeedsAttentionSort`

## Migration

**None required** — compute-only from existing content, posts, campaigns, and leads. Slot **0023** remains reserved.

## Do not touch (parallel modules)

- `src/lib/brand-brain-rag.ts` (M08)
- `src/lib/ai/campaign-builder.ts` (M07)
- `src/lib/ai/recommend.ts`, `src/lib/recommendations.ts` (M09) — read OK
- `src/lib/gbp-audit.ts` (M06)
- `src/app/(app)/calendar/actions.ts` critique gate
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — integrator updates after batch 4

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean
npx tsx scripts/run-fixtures.mjs
# self-test 49/49 + queue-test 18/18
```

M10-specific fixture delta: **+3** health score checks (47 → 49 if M08 brand-brain +2 already on branch; 44 → 47 post-batch-3 baseline).

## Next module

V1 module 11 of 15 — AI-MOS suggest-only (v1 slice)
