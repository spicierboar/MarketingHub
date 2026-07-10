-- 0032 — Digital journey & conversion funnel (W4 M35): journeys, funnels, landing pages, A/B experiments.

create table if not exists funnel_journeys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  description text,
  touchpoints jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversion_funnels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  journey_id uuid references funnel_journeys (id) on delete set null,
  name text not null,
  stages jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnel_landing_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  funnel_id uuid references conversion_funnels (id) on delete set null,
  slug text not null,
  title text not null,
  url text,
  view_count integer not null default 0,
  unique_visitors integer not null default 0,
  cta_clicks integer not null default 0,
  form_submissions integer not null default 0,
  bounce_rate_pct numeric not null default 0,
  avg_time_on_page_sec integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table if not exists funnel_ab_experiments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  funnel_id uuid references conversion_funnels (id) on delete set null,
  landing_page_id uuid references funnel_landing_pages (id) on delete set null,
  name text not null,
  status text not null default 'draft',
  variants jsonb not null default '[]'::jsonb,
  winner_variant_id text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_funnel_journeys_company on funnel_journeys (company_id);
create index if not exists idx_conversion_funnels_company on conversion_funnels (company_id);
create index if not exists idx_funnel_landing_pages_company on funnel_landing_pages (company_id);
create index if not exists idx_funnel_ab_experiments_company on funnel_ab_experiments (company_id);

alter table funnel_journeys enable row level security;
drop policy if exists funnel_journeys_rw on funnel_journeys;
create policy funnel_journeys_rw on funnel_journeys for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table conversion_funnels enable row level security;
drop policy if exists conversion_funnels_rw on conversion_funnels;
create policy conversion_funnels_rw on conversion_funnels for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table funnel_landing_pages enable row level security;
drop policy if exists funnel_landing_pages_rw on funnel_landing_pages;
create policy funnel_landing_pages_rw on funnel_landing_pages for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table funnel_ab_experiments enable row level security;
drop policy if exists funnel_ab_experiments_rw on funnel_ab_experiments;
create policy funnel_ab_experiments_rw on funnel_ab_experiments for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
