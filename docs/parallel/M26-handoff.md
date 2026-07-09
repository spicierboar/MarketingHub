# M26 - Live analytics import handoff (2026-07-09)

**Agent:** M26-W2-LiveAnalytics - **Branch:** w2/m26-live-analytics

## Shipped

- src/lib/analytics-connectors.ts - Meta Graph + Google Business Profile Performance API; CRM merge hook; platformPostIdFromPublishDetail()
- src/lib/analytics.ts - resolvePostMetrics() + publishedInScope batch live/sim resolution
- src/lib/health-scores.ts - lead-volume factor uses pre-resolved metrics
- Self-test +5 (analytics.*)

## Flags

- ANALYTICS_LIVE not flipped (hard lock)
- m26_handoff=yes

## Fan-in

Push branch -> M01-W2 when M24-M27 handoffs ready.
