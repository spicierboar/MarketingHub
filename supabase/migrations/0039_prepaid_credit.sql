-- 0039_prepaid_credit.sql
-- Prepaid company credit wallet (C2) + append-only ledger.
-- Owner paste into Supabase SQL editor.
-- Requires: 0001 helpers (has_company_access, is_tenant_member, is_tenant_admin).
-- $50 minimum floor is enforced in app (src/lib/credit-wallet.ts); no live Stripe charge yet.

create table if not exists company_credit_wallets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  balance_usd numeric not null default 0,
  min_floor_usd numeric not null default 50,
  auto_top_up_enabled boolean not null default false,
  top_up_trigger_balance_usd numeric not null default 50,
  top_up_amount_usd numeric not null default 100,
  max_top_up_amount_usd numeric not null default 500,
  max_top_up_per_day integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_credit_wallets_company_unique unique (company_id)
);

create index if not exists company_credit_wallets_tenant_idx
  on company_credit_wallets (tenant_id);

create table if not exists company_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  wallet_id uuid not null references company_credit_wallets (id) on delete cascade,
  kind text not null,
  -- top_up | debit | adjustment | refund | auto_top_up
  amount_usd numeric not null,
  -- signed: + credit, - debit
  balance_after_usd numeric not null,
  reason text not null,
  related_type text,
  related_id text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists company_credit_ledger_company_idx
  on company_credit_ledger (company_id, created_at desc);
create index if not exists company_credit_ledger_wallet_idx
  on company_credit_ledger (wallet_id, created_at desc);
create index if not exists company_credit_ledger_kind_day_idx
  on company_credit_ledger (company_id, kind, created_at desc);

alter table company_credit_wallets enable row level security;
alter table company_credit_ledger enable row level security;

drop policy if exists company_credit_wallets_access on company_credit_wallets;
create policy company_credit_wallets_access on company_credit_wallets
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

drop policy if exists company_credit_ledger_access on company_credit_ledger;
create policy company_credit_ledger_access on company_credit_ledger
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

comment on table company_credit_wallets is
  'Prepaid company credit wallet (C2); $50 floor enforced in app; auto top-up is ledger-simulated until Stripe';
comment on table company_credit_ledger is
  'Append-only credit ledger; amount_usd signed (+ credit / - debit)';
