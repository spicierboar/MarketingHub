-- 0010 — Restaurant menu designs (Module 4 / Phase 5, 2026-07-08).
--
-- Designed-menu deliverable with 2-free-menus/year entitlement counter
-- (billing_class + quota_year set at request). Company-scoped RLS via
-- has_company_access. The app degrades gracefully pre-migration (reads → []).
-- Idempotent.

create table if not exists menu_designs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  brief text not null,
  format text not null default 'both',
  status text not null default 'requested',
  billing_class text not null default 'included',
  quota_year int not null,
  designer_notes text,
  deliverable_asset_ids jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_menu_designs_company on menu_designs (company_id);
create index if not exists idx_menu_designs_quota on menu_designs (company_id, quota_year, billing_class);

alter table menu_designs enable row level security;
drop policy if exists menu_designs_rw on menu_designs;
create policy menu_designs_rw on menu_designs for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
