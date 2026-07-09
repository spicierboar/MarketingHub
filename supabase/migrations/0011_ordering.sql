-- 0011 — Order Now direct ordering (Module 5 / Phase 6, 2026-07-08).
--
-- Menu catalog, per-company ordering settings (Stripe Connect), and guest
-- orders. Company-scoped RLS via has_company_access. Degrades gracefully
-- pre-migration (reads → []). Idempotent.

create table if not exists order_menu_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null,
  category text not null default 'General',
  available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_order_menu_items_company on order_menu_items (company_id);

create table if not exists ordering_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  min_order_cents int not null default 0,
  button_label text not null default 'Order Now',
  stripe_connect_account_id text,
  connect_status text not null default 'not_started',
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  status text not null default 'pending_payment',
  fulfillment text not null default 'pickup',
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  delivery_address text,
  lines jsonb not null default '[]'::jsonb,
  subtotal_cents int not null default 0,
  total_cents int not null default 0,
  notes text,
  payment_status text not null default 'pending',
  stripe_checkout_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_restaurant_orders_company on restaurant_orders (company_id);
create index if not exists idx_restaurant_orders_status on restaurant_orders (company_id, status);

alter table order_menu_items enable row level security;
drop policy if exists order_menu_items_rw on order_menu_items;
create policy order_menu_items_rw on order_menu_items for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table ordering_settings enable row level security;
drop policy if exists ordering_settings_rw on ordering_settings;
create policy ordering_settings_rw on ordering_settings for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table restaurant_orders enable row level security;
drop policy if exists restaurant_orders_rw on restaurant_orders;
create policy restaurant_orders_rw on restaurant_orders for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
