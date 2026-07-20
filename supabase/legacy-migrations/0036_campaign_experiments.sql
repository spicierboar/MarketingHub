-- 0036_campaign_experiments.sql
-- Campaign A/B experiments with sample-size + confidence winner gate.
-- Owner paste into Supabase SQL editor (no psql/CLI).

create table if not exists campaign_experiments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  hypothesis text not null,
  control_variant_id text not null,
  test_variant_id text not null,
  variants jsonb not null default '[]'::jsonb,
  audience_split numeric not null default 50,
  start_date date,
  end_date date,
  success_metric text not null default 'conversion_rate',
  min_sample_size integer not null default 100,
  confidence_threshold numeric not null default 0.95,
  winning_variation text,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_experiments_company_idx
  on campaign_experiments (company_id);
create index if not exists campaign_experiments_campaign_idx
  on campaign_experiments (campaign_id);

alter table campaign_experiments enable row level security;

drop policy if exists campaign_experiments_scoped on campaign_experiments;
create policy campaign_experiments_scoped on campaign_experiments for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
