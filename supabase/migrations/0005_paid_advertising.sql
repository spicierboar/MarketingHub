-- 0005 — Module 6: Paid advertising (delegated model + management fee).
--
-- Delegated ad accounts (the client's OWN Google Ads / Meta ad account, granted
-- to us via a scoped OAuth token — the platform bills the CLIENT, never us),
-- a per-company budget with an AI-guided per-platform allocation and our
-- management-fee terms, managed paid campaigns (metrics SIMULATED until the
-- Google Ads / Meta Marketing API approvals land), and ingested leads for
-- closed-loop attribution.
--
-- All four tables are COMPANY-SCOPED and reuse the has_company_access() RLS
-- helper (identical to scheduled_posts / publishing_integrations). Actor columns
-- (connected_by / created_by / updated_by) are `text` per migration 0003's
-- opaque-actor convention (synthetic actors like system:cron must be storable).
-- Money/fraction columns are `numeric` (mapper coerces the PostgREST string on
-- read). REQUIRED migration — paste into the Supabase SQL editor before running
-- Supabase mode with the paid-advertising module.

create table if not exists ad_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  account_name text not null,
  external_account_id text not null,
  encrypted_token text not null,
  token_last_four text not null,
  status text not null default 'connected',
  connected_by text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ad_accounts_company on ad_accounts (company_id);

-- One budget per company (singleton keyed by company_id).
create table if not exists ad_budgets (
  company_id uuid primary key references companies (id) on delete cascade,
  monthly_budget_usd numeric not null default 0,
  allocation jsonb not null default '{}'::jsonb,
  fee_model text not null default 'percent_of_spend',
  fee_percent numeric not null default 0,
  fee_flat_usd numeric not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  ad_account_id uuid references ad_accounts (id) on delete set null,
  platform text not null,
  name text not null,
  objective text not null default 'leads',
  daily_budget_usd numeric not null default 0,
  status text not null default 'draft',
  start_date date not null,
  end_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ad_campaigns_company on ad_campaigns (company_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  ad_campaign_id uuid references ad_campaigns (id) on delete set null,
  contact text not null,
  source text not null default 'manual',
  value_usd numeric,
  status text not null default 'new',
  captured_at timestamptz not null default now()
);
create index if not exists idx_leads_company on leads (company_id);

-- RLS: company-scoped, identical shape to scheduled_posts / publishing_integrations.
alter table ad_accounts enable row level security;
alter table ad_budgets enable row level security;
alter table ad_campaigns enable row level security;
alter table leads enable row level security;

create policy ad_accounts_rw on ad_accounts for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy ad_budgets_rw on ad_budgets for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy ad_campaigns_rw on ad_campaigns for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy leads_rw on leads for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
