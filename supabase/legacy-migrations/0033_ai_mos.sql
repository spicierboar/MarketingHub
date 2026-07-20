-- W5 M42: AI-MOS opportunities + signal runs (company-scoped RLS).

create table if not exists ai_mos_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  kind text not null,
  title text not null,
  diagnosis text not null,
  suggested_action jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  priority integer not null default 50,
  status text not null default 'open',
  ai_run_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  dismissed_at timestamptz,
  dismiss_reason text,
  result_type text,
  result_id text
);

create table if not exists ai_mos_signal_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null,
  mode text not null default 'suggest_only',
  execution_mode text not null default 'suggest_only',
  signal_count integer not null default 0,
  opportunity_count integer not null default 0,
  signals jsonb not null default '[]'::jsonb,
  ai_run_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_mos_opportunities_tenant_idx on ai_mos_opportunities (tenant_id);
create index if not exists ai_mos_opportunities_company_idx on ai_mos_opportunities (company_id);
create index if not exists ai_mos_signal_runs_tenant_idx on ai_mos_signal_runs (tenant_id);
create index if not exists ai_mos_signal_runs_company_idx on ai_mos_signal_runs (company_id);

alter table ai_mos_opportunities enable row level security;
drop policy if exists ai_mos_opportunities_rw on ai_mos_opportunities;
create policy ai_mos_opportunities_rw on ai_mos_opportunities
  for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table ai_mos_signal_runs enable row level security;
drop policy if exists ai_mos_signal_runs_rw on ai_mos_signal_runs;
create policy ai_mos_signal_runs_rw on ai_mos_signal_runs
  for all using (has_company_access(company_id)) with check (has_company_access(company_id));
