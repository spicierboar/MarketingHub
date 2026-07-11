-- 0038_managed_delivery.sql
-- Managed-service delivery runs (post-onboarding strategy + calendar + drafts).
-- Owner paste into Supabase SQL editor.
-- Requires: 0001 helpers (has_company_access, is_tenant_member, is_tenant_admin).

create table if not exists managed_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  phase text not null default 'queued',
  -- queued | validating | analysing | strategy | calendar | content |
  -- awaiting_approval | active | blocked | failed
  service_level text not null default 'approval',
  -- approval | managed_exceptions | fully_managed
  onboarding_completed_at timestamptz not null,
  strategy_due_at timestamptz not null,
  strategy_started_at timestamptz,
  strategy_completed_at timestamptz,
  calendar_completed_at timestamptz,
  campaign_id uuid,
  strategy_version integer not null default 0,
  calendar_version integer not null default 0,
  missing_info jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  retry_count integer not null default 0,
  status_message_key text not null default 'strategy_preparing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_delivery_runs_tenant_phase_idx
  on managed_delivery_runs (tenant_id, phase);
create index if not exists managed_delivery_runs_company_idx
  on managed_delivery_runs (company_id, created_at desc);
create index if not exists managed_delivery_runs_due_idx
  on managed_delivery_runs (tenant_id, strategy_due_at);

alter table managed_delivery_runs enable row level security;

drop policy if exists managed_delivery_runs_access on managed_delivery_runs;
create policy managed_delivery_runs_access on managed_delivery_runs
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

comment on table managed_delivery_runs is
  'Managed-service delivery pipeline; drafts/suggestions only — never auto-publishes';
