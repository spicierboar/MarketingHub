-- 0027 — Photographer marketplace (V1 module 14, 2026-07-08).
--
-- Two-sided booking: photographer profiles + packages + marketplace bookings
-- tied to photo_shoots. Company-scoped RLS on bookings; photographers visible
-- to tenant members (tenant-scoped) or all tenants (platform-scoped, tenant_id
-- null). Degrades gracefully pre-migration (reads → []). Idempotent.

create table if not exists photographer_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  name text not null,
  bio text,
  specialty jsonb not null default '[]'::jsonb,
  service_area text,
  stripe_connect_account_id text,
  connect_status text not null default 'not_started',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_photographer_profiles_tenant on photographer_profiles (tenant_id);

create table if not exists photographer_packages (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references photographer_profiles (id) on delete cascade,
  title text not null,
  description text,
  duration_minutes int not null default 60,
  price_cents int not null,
  includes jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_photographer_packages_photographer on photographer_packages (photographer_id);

create table if not exists photo_marketplace_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  photographer_id uuid not null references photographer_profiles (id) on delete restrict,
  package_id uuid not null references photographer_packages (id) on delete restrict,
  photo_shoot_id uuid not null references photo_shoots (id) on delete cascade,
  scheduled_slot timestamptz,
  brief text,
  location text,
  status text not null default 'pending_payment',
  payment_status text not null default 'pending',
  payout_status text not null default 'held',
  total_cents int not null default 0,
  marketplace_fee_cents int not null default 0,
  photographer_payout_cents int not null default 0,
  stripe_checkout_session_id text,
  booked_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_photo_marketplace_bookings_company on photo_marketplace_bookings (company_id);

alter table photo_shoots
  add column if not exists marketplace_booking_id uuid references photo_marketplace_bookings (id) on delete set null;

-- Photographer visibility: platform (tenant_id null) OR same tenant membership.
-- Use is_tenant_member(uuid) from 0001 — do NOT compare auth.uid()::text to
-- tenant_members.user_id (uuid); that raises "operator does not exist: uuid = text".
alter table photographer_profiles enable row level security;
drop policy if exists photographer_profiles_read on photographer_profiles;
create policy photographer_profiles_read on photographer_profiles for select
  using (tenant_id is null or is_tenant_member(tenant_id));
drop policy if exists photographer_profiles_write on photographer_profiles;
create policy photographer_profiles_write on photographer_profiles for all
  using (tenant_id is not null and is_tenant_member(tenant_id))
  with check (tenant_id is not null and is_tenant_member(tenant_id));

alter table photographer_packages enable row level security;
drop policy if exists photographer_packages_read on photographer_packages;
create policy photographer_packages_read on photographer_packages for select
  using (
    exists (
      select 1 from photographer_profiles p
      where p.id = photographer_packages.photographer_id
        and (p.tenant_id is null or is_tenant_member(p.tenant_id))
    )
  );
drop policy if exists photographer_packages_write on photographer_packages;
create policy photographer_packages_write on photographer_packages for all
  using (
    exists (
      select 1 from photographer_profiles p
      where p.id = photographer_packages.photographer_id
        and p.tenant_id is not null
        and is_tenant_member(p.tenant_id)
    )
  )
  with check (
    exists (
      select 1 from photographer_profiles p
      where p.id = photographer_packages.photographer_id
        and p.tenant_id is not null
        and is_tenant_member(p.tenant_id)
    )
  );

alter table photo_marketplace_bookings enable row level security;
drop policy if exists photo_marketplace_bookings_rw on photo_marketplace_bookings;
create policy photo_marketplace_bookings_rw on photo_marketplace_bookings for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
