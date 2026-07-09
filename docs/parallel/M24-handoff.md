# M24 - Live publish adapters handoff (2026-07-09)

**Agent:** M24-W2-LivePublish | **Branch:** `w2/m24-live-publish`

`m24_handoff=yes`

## Shipped

### Publishing connectors (Meta / GBP / TikTok)

- `src/lib/publishing-connectors.ts` - appEnv + PUBLISHING_LIVE gate, platform health helpers, hardened Meta/GBP/TikTok adapters
- `src/lib/security-slice.ts` - `publishingPlatforms` in integration health bundle
- `src/components/security-health-panel.tsx` - per-platform sub-rows
- `src/lib/publishing.ts` - records publishing provider failures when live connector fails
- `src/lib/selftest/publishing-connectors.ts` + `isolation.ts` - 3 new checks
- `.env.example` - TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET

## Hard locks

- PUBLISHING_LIVE not flipped
- M25/M26/M27 untouched

## Verified

- tsc clean
- build clean
- self-test 98/98 (90 baseline + M24 checks; main may add more)

## Fan-in

When m24+m25+m26+m27 handoffs all yes -> M01-W2 integrator.