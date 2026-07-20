create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  email text, phone text, first_name text not null, last_name text,
  tags jsonb not null default '[]'::jsonb,
  consent_status text not null default 'pending', source text not null default 'manual',
  lead_id uuid references leads (id) on delete set null, notes text,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists crm_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null, description text, rule_type text not null default 'manual',
  rule_config jsonb not null default '{}'::jsonb,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists crm_interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid not null references crm_contacts (id) on delete cascade,
  channel text not null, direction text not null default 'inbound',
  summary text not null, detail text, occurred_at timestamptz not null default now(),
  created_by uuid, metadata jsonb
);
alter table crm_contacts enable row level security;
drop policy if exists crm_contacts_rw on crm_contacts;
create policy crm_contacts_rw on crm_contacts for all using (has_company_access(company_id)) with check (has_company_access(company_id));
alter table crm_segments enable row level security;
drop policy if exists crm_segments_rw on crm_segments;
create policy crm_segments_rw on crm_segments for all using (has_company_access(company_id)) with check (has_company_access(company_id));
alter table crm_interactions enable row level security;
drop policy if exists crm_interactions_rw on crm_interactions;
create policy crm_interactions_rw on crm_interactions for all using (has_company_access(company_id)) with check (has_company_access(company_id));
