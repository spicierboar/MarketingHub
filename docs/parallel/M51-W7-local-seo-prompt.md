# M51 — Local SEO (full) · branch w7/m51-local-seo
Spawned while W6 Google-blocked (code-only). Fan-in → M01-FINAL. See FULL-IMPLEMENTATION-PLAN W7 / BUSINESS-ROADMAP module 11.

Deliver: extend GBP audit with suburb/local landing-page briefs, schema markup recommendations, AI factual Q&A drafts (governed `ai_draft` only), local-SEO score surface. `LOCAL_SEO_LIVE` gate — simulated when OFF; live GBP still via existing `gbpAuditLive()` (Google-blocked). Migration `0034_local_seo.sql` only if new tables needed. Self-test fixtures. Do not flip `PUBLISHING_LIVE`. Do not touch bookings/exec-dash/api/security/video.
