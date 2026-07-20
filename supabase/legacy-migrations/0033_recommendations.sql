-- 0033 — W5 M41 recommendations: snooze, dismiss history, portfolio snapshots.

alter table recommendations
  add column if not exists score int,
  add column if not exists dismiss_reason text,
  add column if not exists snoozed_until timestamptz,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

create table if not exists recommendation_dismiss_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  recommendation_type text not null,
  title text not null default '',
  reason text,
  dismissed_by text, -- opaque actor; no FK — see 0003
  dismissed_at timestamptz not null default now()
);

create table if not exists agency_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  open_count int not null default 0,
  snoozed_count int not null default 0,
  top_score int not null default 0,
  headline text not null default '',
  captured_at timestamptz not null default now()
);

alter table recommendation_dismiss_history enable row level security;
alter table agency_portfolio_snapshots enable row level security;

drop policy if exists recommendation_dismiss_history_scoped on recommendation_dismiss_history;
create policy recommendation_dismiss_history_scoped on recommendation_dismiss_history for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists agency_portfolio_snapshots_scoped on agency_portfolio_snapshots;
create policy agency_portfolio_snapshots_scoped on agency_portfolio_snapshots for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
