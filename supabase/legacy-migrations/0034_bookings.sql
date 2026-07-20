-- 0034 — Bookings & reservations (W7 M50, 2026-07-10).
--
-- Service periods, per-company booking settings, and guest reservations for
-- restaurant tables / hotel rooms. Company-scoped RLS via has_company_access.
-- Degrades gracefully pre-migration (reads → []). Idempotent.

create table if not exists booking_service_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  day_of_week int not null default 1,
  start_time text not null default '11:00',
  end_time text not null default '14:00',
  capacity int not null default 20,
  slot_minutes int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_booking_service_periods_company on booking_service_periods (company_id);

create table if not exists booking_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  venue_kind text not null default 'restaurant',
  enabled boolean not null default true,
  button_label text not null default 'Book a table',
  lead_time_hours int not null default 1,
  max_party_size int not null default 12,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  service_period_id uuid not null references booking_service_periods (id) on delete cascade,
  status text not null default 'requested',
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  party_size int not null default 2,
  scheduled_at timestamptz not null,
  notes text,
  confirmation_mode text not null default 'simulated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reservations_company on reservations (company_id);
create index if not exists idx_reservations_status on reservations (company_id, status);
create index if not exists idx_reservations_scheduled on reservations (company_id, scheduled_at);

alter table booking_service_periods enable row level security;
drop policy if exists booking_service_periods_rw on booking_service_periods;
create policy booking_service_periods_rw on booking_service_periods for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table booking_settings enable row level security;
drop policy if exists booking_settings_rw on booking_settings;
create policy booking_settings_rw on booking_settings for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table reservations enable row level security;
drop policy if exists reservations_rw on reservations;
create policy reservations_rw on reservations for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
