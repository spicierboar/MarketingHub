-- 0035_ai_campaign_layer.sql
-- AI campaign management layer — extend existing campaigns/offers; add
-- orchestration runs, structured recommendations, approval policies,
-- prompt versions, and performance snapshots. Preserve all existing rows.
-- Owner paste into Supabase SQL editor (no psql/CLI).

-- ---------------------------------------------------------------------------
-- Campaigns: structured meta for type/budget/geo/UTM without breaking rows
-- ---------------------------------------------------------------------------
alter table campaigns
  add column if not exists campaign_type text,
  add column if not exists description text,
  add column if not exists priority text not null default 'medium',
  add column if not exists timezone text not null default 'Australia/Sydney',
  add column if not exists budget_amount numeric,
  add column if not exists currency text not null default 'AUD',
  add column if not exists daily_spend_limit numeric,
  add column if not exists geographic_scope jsonb not null default '[]'::jsonb,
  add column if not exists landing_page_url text,
  add column if not exists utm jsonb not null default '{}'::jsonb,
  add column if not exists associated_products jsonb not null default '[]'::jsonb,
  add column if not exists end_date date,
  add column if not exists archived_at timestamptz,
  add column if not exists layer_meta jsonb not null default '{}'::jsonb;

comment on column campaigns.campaign_type is
  'brand_awareness | product_launch | lead_generation | … (AI campaign layer)';
comment on column campaigns.layer_meta is
  'AI assumptions, risks, missing info, performance targets (jsonb)';

-- ---------------------------------------------------------------------------
-- Offers → promotion fields (reuse Offer as Promotion root)
-- ---------------------------------------------------------------------------
alter table offers
  add column if not exists promotion_type text,
  add column if not exists offer_description text,
  add column if not exists discount_amount numeric,
  add column if not exists discount_percentage numeric,
  add column if not exists coupon_code text,
  add column if not exists minimum_purchase_amount numeric,
  add column if not exists maximum_discount numeric,
  add column if not exists eligible_products jsonb not null default '[]'::jsonb,
  add column if not exists eligible_categories jsonb not null default '[]'::jsonb,
  add column if not exists eligible_segments jsonb not null default '[]'::jsonb,
  add column if not exists excluded_products jsonb not null default '[]'::jsonb,
  add column if not exists excluded_customers jsonb not null default '[]'::jsonb,
  add column if not exists eligible_regions jsonb not null default '[]'::jsonb,
  add column if not exists excluded_regions jsonb not null default '[]'::jsonb,
  add column if not exists total_usage_limit int,
  add column if not exists per_customer_usage_limit int,
  add column if not exists redemption_channel text,
  add column if not exists inventory_allocation int,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists promotion_meta jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Approval policies (configurable human gates)
-- ---------------------------------------------------------------------------
create table if not exists approval_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  entity_type text not null,
  -- campaign | content | promotion | budget | spend | complaint | crisis | regulated_claim
  trigger_rules jsonb not null default '{}'::jsonb,
  -- { campaignTypes[], minBudget, minRiskScore, platforms[], regions[] }
  approval_level text not null default 'single',
  -- none | single | two | departmental | legal | executive
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists approval_policies_tenant_idx
  on approval_policies (tenant_id, entity_type)
  where active = true;

alter table approval_policies enable row level security;

-- Use is_tenant_admin from 0001 — there is no auth_tenant_id() helper.
drop policy if exists approval_policies_tenant on approval_policies;
create policy approval_policies_tenant on approval_policies
  for all using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- Prompt versions (do not hard-code production prompts in business logic)
-- ---------------------------------------------------------------------------
create table if not exists ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  -- null tenant = platform library
  prompt_key text not null,
  name text not null,
  purpose text not null,
  prompt_text text not null,
  version int not null default 1,
  model_provider text not null default 'anthropic',
  model_name text,
  temperature numeric,
  output_schema jsonb,
  active boolean not null default false,
  created_by text,
  approved_by text,
  effective_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, prompt_key, version)
);

create index if not exists ai_prompt_versions_active_idx
  on ai_prompt_versions (prompt_key)
  where active = true;

alter table ai_prompt_versions enable row level security;

-- Platform library (tenant_id null) is readable by any member; tenant rows
-- use is_tenant_member / is_tenant_admin from 0001 (no auth_tenant_id()).
drop policy if exists ai_prompt_versions_read on ai_prompt_versions;
create policy ai_prompt_versions_read on ai_prompt_versions
  for select using (
    tenant_id is null or is_tenant_member(tenant_id)
  );

drop policy if exists ai_prompt_versions_write on ai_prompt_versions;
create policy ai_prompt_versions_write on ai_prompt_versions
  for all using (tenant_id is not null and is_tenant_admin(tenant_id))
  with check (tenant_id is not null and is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- AI orchestration runs (controlled tool trail — not direct DB writes by model)
-- ---------------------------------------------------------------------------
create table if not exists ai_orchestration_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  operation text not null,
  -- plan_campaign | design_promotion | generate_content | optimise | analyse_sentiment | …
  input_summary text,
  structured_output jsonb not null default '{}'::jsonb,
  model_provider text,
  model_name text,
  prompt_version_id uuid references ai_prompt_versions (id) on delete set null,
  confidence_score numeric,
  risk_score numeric,
  approval_required boolean not null default true,
  status text not null default 'proposed',
  -- proposed | awaiting_approval | approved | rejected | executed | failed
  created_by text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_orchestration_runs_company_idx
  on ai_orchestration_runs (company_id, created_at desc);

alter table ai_orchestration_runs enable row level security;

drop policy if exists ai_orchestration_runs_access on ai_orchestration_runs;
create policy ai_orchestration_runs_access on ai_orchestration_runs
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- Structured AI recommendations (brief §3 + §17 JSON shape)
-- ---------------------------------------------------------------------------
create table if not exists ai_campaign_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  orchestration_run_id uuid references ai_orchestration_runs (id) on delete set null,
  recommendation_type text not null,
  related_entity_type text,
  related_entity_id text,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  -- full structured recommendation (actions, data_sources, assumptions, flags)
  confidence_score numeric,
  risk_score numeric,
  expected_outcome text,
  model_provider text,
  model_name text,
  model_version text,
  prompt_version text,
  human_decision text,
  -- pending | accepted | rejected | overridden
  human_decision_at timestamptz,
  override_reason text,
  action_taken text,
  actual_outcome text,
  feedback_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_campaign_recommendations_company_idx
  on ai_campaign_recommendations (company_id, created_at desc);
create index if not exists ai_campaign_recommendations_campaign_idx
  on ai_campaign_recommendations (campaign_id)
  where campaign_id is not null;

alter table ai_campaign_recommendations enable row level security;

drop policy if exists ai_campaign_recommendations_access on ai_campaign_recommendations;
create policy ai_campaign_recommendations_access on ai_campaign_recommendations
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- Campaign performance snapshots (time-series; live import later)
-- ---------------------------------------------------------------------------
create table if not exists campaign_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete cascade,
  content_id uuid references content_items (id) on delete set null,
  platform_account_id text,
  period_start timestamptz not null,
  period_end timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  data_source text not null default 'simulated',
  attribution_status text,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists campaign_performance_snapshots_campaign_idx
  on campaign_performance_snapshots (campaign_id, period_start desc);

alter table campaign_performance_snapshots enable row level security;

drop policy if exists campaign_performance_snapshots_access on campaign_performance_snapshots;
create policy campaign_performance_snapshots_access on campaign_performance_snapshots
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));
