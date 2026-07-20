-- 0033 — W5 M43 campaign builder: plan versions, builder runs, draft schedule (company-scoped RLS).

create table if not exists campaign_plan_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  version_number integer not null default 1,
  goal text not null,
  objective text not null,
  strategy text not null default '',
  channel_plan text not null default '',
  kpis jsonb not null default '[]'::jsonb,
  risk_warnings jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  model text not null default 'template (no API key)',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists campaign_builder_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  plan_version_id uuid references campaign_plan_versions (id) on delete set null,
  goal text not null,
  status text not null default 'completed',
  mode text not null default 'simulated',
  model text not null default 'template (no API key)',
  spawned_content_count integer not null default 0,
  draft_schedule_count integer not null default 0,
  ai_run_id uuid references ai_runs (id) on delete set null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists campaign_draft_schedule_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  campaign_item_id uuid references campaign_items (id) on delete set null,
  content_id uuid references content_items (id) on delete set null,
  plan_version_id uuid references campaign_plan_versions (id) on delete set null,
  scheduled_date date not null,
  scheduled_time text,
  platform text not null,
  title text not null,
  status text not null default 'draft',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_plan_versions_campaign_idx on campaign_plan_versions (campaign_id);
create index if not exists campaign_builder_runs_company_idx on campaign_builder_runs (company_id);
create index if not exists campaign_draft_schedule_campaign_idx on campaign_draft_schedule_items (campaign_id);

alter table campaign_plan_versions enable row level security;
drop policy if exists campaign_plan_versions_rw on campaign_plan_versions;
create policy campaign_plan_versions_rw on campaign_plan_versions for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));

alter table campaign_builder_runs enable row level security;
drop policy if exists campaign_builder_runs_rw on campaign_builder_runs;
create policy campaign_builder_runs_rw on campaign_builder_runs for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));

alter table campaign_draft_schedule_items enable row level security;
drop policy if exists campaign_draft_schedule_items_rw on campaign_draft_schedule_items;
create policy campaign_draft_schedule_items_rw on campaign_draft_schedule_items for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));
