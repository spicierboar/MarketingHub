-- 0004 — publish-queue performance indexes (scale pass, 2026-07-06).
--
-- OPTIONAL: the publish queue works on the existing schema without this file —
-- queue state is new STATUS VALUES on scheduled_posts (text column, no
-- constraint change) plus derived state from the append-only publish_logs.
-- These indexes only make the per-tenant queue tick cheap at 1600-account
-- scale. Paste into the Supabase SQL editor whenever convenient.

-- Tick candidate selection: due scheduled posts + failed retries by status.
create index if not exists idx_scheduled_posts_status_date
  on scheduled_posts (status, scheduled_date);

-- Attempt/backoff derivation: logs for a specific set of posts.
create index if not exists idx_publish_logs_scheduled_post
  on publish_logs (scheduled_post_id, created_at desc)
  where scheduled_post_id is not null;

-- Platform-ceiling usage: a tenant's trailing-24h window scan.
create index if not exists idx_publish_logs_company_created
  on publish_logs (company_id, created_at desc);
