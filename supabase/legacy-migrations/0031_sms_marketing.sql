-- 0031 - SMS marketing (W3 M32).

create table if not exists sms_company_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  country_code text not null default 'AU',
  sender_id text not null default '',
  quiet_hours_start text not null default '20:00',
  quiet_hours_end text not null default '08:00',
  monthly_spend_cap_usd numeric,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists sms_subscribers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  phone_e164 text not null,
  name text,
  tags jsonb not null default '[]'::jsonb,
  consent_status text not null default 'pending',
  consented_at timestamptz,
  opted_out_at timestamptz,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, phone_e164)
);
create index if not exists idx_sms_subscribers_company on sms_subscribers (company_id);

create table if not exists sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  body text not null,
  kind text not null default 'promotional',
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  segment_tag text,
  short_link text,
  utm_campaign text,
  stats jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sms_campaigns_company on sms_campaigns (company_id);

alter table sms_company_settings enable row level security;
alter table sms_subscribers enable row level security;
alter table sms_campaigns enable row level security;

create policy sms_settings_rw on sms_company_settings for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy sms_subscribers_rw on sms_subscribers for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy sms_campaigns_rw on sms_campaigns for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
