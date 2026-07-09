# M26 - Live analytics import handoff (2026-07-09)

**Agent:** M26-W2-LiveAnalytics - **Branch:** w2/m26-live-analytics

## Shipped

- src/lib/analytics-connectors.ts - Meta + Google insights; CRM merge hook
- src/lib/analytics.ts - resolvePostMetrics + publishedInScope wiring
- src/lib/health-scores.ts - live/sim metrics in lead-volume factor
- Self-test +5 (analytics.*)

## Flags

- ANALYTICS_LIVE not flipped (hard lock)
- m26_handoff=yes
