-- 0013 — Per-tenant schedule timezone (2026-07-08).
--
-- Calendar scheduled_date / scheduled_time are local intent. When set, the
-- publish queue's due-gate uses this IANA timezone instead of the platform-wide
-- CC_TZ_OFFSET_MINUTES fallback. Nullable — existing tenants unchanged until
-- the owner picks a zone in Publishing Centre.
--
-- REQUIRED for per-tenant timezones. Paste into the Supabase SQL editor.

alter table tenants
  add column if not exists timezone text;
