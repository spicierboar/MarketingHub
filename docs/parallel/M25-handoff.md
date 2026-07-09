# M25 — Live ads execution handoff (2026-07-09)

**Agent:** M25-W2-LiveAds · **Branch:** `w2/m25-live-ads`

`m25_handoff=yes`

## Shipped

- `src/lib/ad-connectors.ts` — live Google Ads + Meta campaign sync + metrics + targeting translation
- `src/lib/paid.ts` — `resolveCampaignMetrics()` sim/live resolver
- `src/app/(app)/ads/actions.ts` — platform sync on create + status change when `ADS_LIVE`
- `src/app/(app)/ads/page.tsx` — live metrics in campaign table
- `src/lib/types.ts` — `AdCampaign.externalCampaignId`
- `src/lib/security-slice.ts` — ads health hints
- `src/lib/selftest/live-ads.ts` — +5 `liveAds.*` fixtures
- `supabase/migrations/0030_ad_campaign_external_id.sql`

## Hard lock

`ADS_LIVE` **not flipped** — delegated billing model unchanged.

## Next

Fan-in → M01-W2 when all W2 handoffs ready.