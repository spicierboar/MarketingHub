-- 0006 — Ad audience targeting (Module 6/7, 2026-07-07).
--
-- Reusable per-company audiences (geo + demographics + interests + custom/
-- lookalike audiences + exclusions + devices + placements) that campaigns run
-- against — the "audience-targeting records" / "audience segmentation" the paid
-- module needs. The targeting spec is a jsonb blob (structured, platform-
-- agnostic; the connector maps it to each platform's payload at launch). We
-- store NO customer PII — "custom audiences" are referenced by the client's own
-- named/id'd audiences at the platform, never the underlying list.
--
-- Company-scoped RLS via has_company_access (same as the rest of the ad module).
-- REQUIRED migration for the targeting feature under Supabase. Idempotent.

create table if not exists audience_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  platform text not null default 'all', -- 'all' | 'google_ads' | 'meta_ads'
  targeting jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_audience_segments_company on audience_segments (company_id);

-- A campaign optionally runs against one saved audience. ON DELETE SET NULL so
-- deleting an audience detaches campaigns rather than cascading them away.
alter table ad_campaigns
  add column if not exists audience_segment_id uuid
  references audience_segments (id) on delete set null;

alter table audience_segments enable row level security;
create policy audience_segments_rw on audience_segments for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
