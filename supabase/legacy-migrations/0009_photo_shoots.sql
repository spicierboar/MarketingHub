-- 0009 — Photo shoots workflow (Module 2 / Phase 4, 2026-07-08).
--
-- Managed professional photo shoots: request → schedule → shoot → DAM upload →
-- approve → optional content attach. Company-scoped RLS via has_company_access.
-- The app degrades gracefully pre-migration (photo shoot reads → []). Idempotent.

create table if not exists photo_shoots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  brief text not null,
  location text,
  scheduled_at timestamptz,
  status text not null default 'requested',
  photographer_notes text,
  deliverable_asset_ids jsonb not null default '[]'::jsonb,
  target_content_id uuid references content_items (id) on delete set null,
  target_channels jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_photo_shoots_company on photo_shoots (company_id);

alter table photo_shoots enable row level security;
drop policy if exists photo_shoots_rw on photo_shoots;
create policy photo_shoots_rw on photo_shoots for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
