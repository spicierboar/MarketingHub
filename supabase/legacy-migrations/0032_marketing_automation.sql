-- 0032 — Marketing automation workflows (W4 M36).

create table if not exists marketing_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  name text not null,
  description text,
  trigger_kind text not null default 'manual',
  template_kind text,
  status text not null default 'draft',
  steps jsonb not null default '[]'::jsonb,
  is_agency_template boolean not null default false,
  deployed_from_template_id uuid references marketing_workflows (id) on delete set null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_workflow_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  quiet_hours_start text not null default '20:00',
  quiet_hours_end text not null default '08:00',
  frequency_cap_per_week integer not null default 3,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists workflow_dispatch_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references marketing_workflows (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid,
  channel text not null,
  step_id text not null,
  status text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table marketing_workflows enable row level security;
create policy marketing_workflows_rw on marketing_workflows for all
  using (
    (is_agency_template and tenant_id in (select tenant_id from tenant_members where user_id = auth.uid()))
    or (company_id is not null and has_company_access(company_id))
  )
  with check (
    (is_agency_template and tenant_id in (select tenant_id from tenant_members where user_id = auth.uid()))
    or (company_id is not null and has_company_access(company_id))
  );

alter table marketing_workflow_settings enable row level security;
create policy marketing_workflow_settings_rw on marketing_workflow_settings for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));

alter table workflow_dispatch_logs enable row level security;
create policy workflow_dispatch_logs_rw on workflow_dispatch_logs for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));
