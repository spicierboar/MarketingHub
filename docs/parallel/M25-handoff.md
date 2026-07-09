# M25 ΓÇö Live ads execution handoff (2026-07-09)

**Agent:** M25-W2-LiveAds ┬╖ **Branch:** `w2/m25-live-ads`

`m25_handoff=yes`

## Shipped

### Live connectors ΓÇö Google Ads + Meta Marketing API

- **Extended:** `src/lib/ad-connectors.ts`
  - `adsConfigured()` / `adsPlatformConfigured()` ΓÇö env gate (requires `ADS_LIVE` + `PUBLISHING_TOKEN_KEY` + provider creds)
  - `dispatchCampaignSync()` ΓÇö create / activate / pause on delegated accounts (client-billed; we never front spend)
  - `fetchLiveCampaignMetrics()` ΓÇö trailing-30 platform insights when `externalCampaignId` is set
  - `translateTargeting()` ΓÇö `AdTargeting` -> Meta / Google payload shapes

### Sim -> live transition

- **Extended:** `src/lib/paid.ts` ΓÇö `resolveCampaignMetrics()` tries live pull, falls back to seeded simulator
- **Wired:** `src/app/(app)/ads/actions.ts` ΓÇö campaign create + status changes sync to platform when `ADS_LIVE`
- **Wired:** `src/app/(app)/ads/page.tsx` ΓÇö per-campaign metrics via `resolveCampaignMetrics`
- **Extended:** `src/lib/types.ts` ΓÇö `AdCampaign.externalCampaignId`
- **Extended:** `src/lib/security-slice.ts` ΓÇö richer ads health hint when live gate on

### Migration (owner paste ΓÇö not blocking code)

- **New:** `supabase/migrations/0030_ad_campaign_external_id.sql` ΓÇö `ad_campaigns.external_campaign_id`

### Self-test +5 (`liveAds.*`) -> target ~95/95

- `src/lib/selftest/live-ads.ts`

## Hard lock (unchanged)

- **`ADS_LIVE` not flipped** ΓÇö code paths only; simulator remains default

## Do not touch (parallel W2)

- M24 publish ┬╖ M26 analytics ┬╖ M27 public API

## Owner paste (when ready)

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0030_ad_campaign_external_id.sql
```

Paste into Supabase SQL Editor after W2 merge (or before go-live). App degrades gracefully if column absent (in-memory + pre-paste Supabase).

**Keys for live cutover (Phase 4):** `ADS_LIVE=true` + `GOOGLE_ADS_DEVELOPER_TOKEN` + `GOOGLE_OAUTH_*` + `META_APP_*` + `PUBLISHING_TOKEN_KEY` (delegated tokens encrypted with same key).

## Verified (2026-07-09)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # M25 files clean (parallel W2 agents may add unrelated WIP)
```

## Next step

Fan-in -> **M01-W2** when M24 + M25 + M26 + M27 handoffs ready.
