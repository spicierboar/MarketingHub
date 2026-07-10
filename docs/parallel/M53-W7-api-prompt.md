# M53 — Public API expansion · branch w7/m53-api
Spawned while W6 Google-blocked (code-only). Fan-in → M01-FINAL. See FULL-IMPLEMENTATION-PLAN W7 / M27 baseline.

Deliver: expand `/api/v1` catalog (campaigns, reservations, reviews read where safe), API versioning notes, tighter rate-limit buckets, OpenAPI manifest update. Keep `PUBLIC_API_LIVE` OFF by default. Migration `0034_api.sql` only if schema needed. Self-test fixtures. Isolation: tenant via API key only. Do not touch bookings/local-seo/exec-dash/security/video.
