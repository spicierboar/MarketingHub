-- 0008 — Per-company add-on entitlements (Module 3, payment-tier matrix, 2026-07-07).
--
-- The tenant's base PLAN (tenants.plan) is a tenant-level subscription; ADD-ONS
-- (video / photo / menus / order_button) are per-CLIENT-COMPANY capabilities
-- billed on top of it. At most ONE row per (company_id, addon_id): enabling
-- upserts status 'active', disabling flips it to 'cancelled' (kept for history).
-- The deliverable modules (AI visuals/video, restaurant menus, "Order Now") gate
-- their feature entry points on an ACTIVE row via assertCompanyAddon().
--
-- Company-scoped RLS via has_company_access (same as the rest of the per-company
-- tables). enabled_by is a TEXT actor ref (can be a synthetic 'stripe_webhook'),
-- matching the 0003/0005/0006 actor-column convention. REQUIRED migration under
-- Supabase — the app degrades gracefully pre-migration (entitlement reads → [],
-- so every add-on simply shows OFF and no feature is unlocked). Idempotent.

create table if not exists company_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  addon_id text not null,                 -- 'video' | 'photo' | 'menus' | 'order_button'
  status text not null default 'active',  -- 'active' | 'cancelled'
  enabled_by text,
  stripe_subscription_id text,
  enabled_at timestamptz not null default now(),
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, addon_id)           -- the upsert conflict target
);
create index if not exists idx_company_entitlements_company on company_entitlements (company_id);

alter table company_entitlements enable row level security;
-- drop-then-create so a re-paste doesn't error (create policy is not "if not exists").
drop policy if exists company_entitlements_rw on company_entitlements;
create policy company_entitlements_rw on company_entitlements for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
