-- 0031 — Email marketing (W3 M31): templates, subscribers, campaigns.

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  kind text not null default 'newsletter',
  subject text not null,
  preview_text text,
  html_body text not null,
  accent_color text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_company on email_templates (company_id);

create table if not exists email_subscribers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  email text not null,
  name text,
  tags jsonb not null default '[]'::jsonb,
  marketing_consent boolean not null default false,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists idx_email_subscribers_company on email_subscribers (company_id);

create table if not exists email_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  template_id uuid not null references email_templates (id) on delete restrict,
  name text not null,
  subject text not null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  segment_tag text,
  stats jsonb not null default '{"recipients":0,"sent":0,"failed":0,"opens":0,"clicks":0,"unsubscribes":0,"bounces":0}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_campaigns_company on email_campaigns (company_id);

alter table email_templates enable row level security;
alter table email_subscribers enable row level security;
alter table email_campaigns enable row level security;

create policy email_tpl_rw on email_templates for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

create policy email_sub_rw on email_subscribers for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

create policy email_cmp_rw on email_campaigns for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
