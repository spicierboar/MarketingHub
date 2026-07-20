-- 0037_privacy_dsr.sql
-- Privacy data-subject requests (access / deletion / rectification /
-- restriction / portability). Owner paste into Supabase SQL editor.
-- (0036 taken by rbac_capabilities / campaign_experiments.)

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  subject_ref text not null,
  -- CRM contact id, email, or other subject identifier
  request_type text not null,
  -- access | deletion | rectification | restriction | portability
  status text not null default 'pending',
  -- pending | in_progress | completed | rejected
  lawful_basis text,
  jurisdiction text,
  due_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists privacy_requests_company_idx
  on privacy_requests (company_id, created_at desc);
create index if not exists privacy_requests_tenant_status_idx
  on privacy_requests (tenant_id, status);
create index if not exists privacy_requests_subject_idx
  on privacy_requests (company_id, subject_ref);

alter table privacy_requests enable row level security;

drop policy if exists privacy_requests_access on privacy_requests;
create policy privacy_requests_access on privacy_requests
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

comment on table privacy_requests is
  'GDPR / Privacy Act data-subject requests; restriction status blocks marketing use';
