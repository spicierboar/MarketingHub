# M33 — Review management handoff (2026-07-09)

**Agent:** M33-W3-Reviews · **Branch:** `w3/m33-reviews`

## Shipped (Module 7 / Phase 6 slice)

- **`src/lib/reviews-connectors.ts`** — `REVIEWS_LIVE` gate, deterministic platform import simulator, publish stub
- **`src/lib/ai/review.ts`** — sentiment/topic/urgency analysis + AI/template response drafts (approved library wired)
- **`src/lib/reviews.ts`** — import orchestration, reputation score, review-request campaign simulation
- **`/reviews`** — import UI, review inbox with AI draft + publish, review-request campaigns
- **`src/lib/db/*`** — `company_reviews` + `review_request_campaigns` persistence (in-memory + Supabase)
- **Self-test** — `reviews.simulatedWhenLiveOff`, `reviews.analyzeNegativeUrgent`, `reviews.reputationScoreInRange`, `reviews.importDedup`, `reviews.campaignSimulated` (+5 fixtures)

## Migration

**`0031_reviews.sql`** — `company_reviews`, `review_request_campaigns`, company-scoped RLS

## Hard lock

- **`REVIEWS_LIVE` not flipped** — simulated import/publish/campaign dispatch remain default
- **`PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` unchanged (OFF)**

## Verified

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
npm run build
```

## Flags

- `m33_handoff=yes` in PROGRESS.md

## Fan-in

Ready for **M01-W3** after M30–M32 handoffs land.
