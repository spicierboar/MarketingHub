-- Marketing Command Centre — Phase 1 production schema (Supabase / Postgres).
--
-- STATUS: authored to match the Phase 1 domain model in src/lib/types.ts.
-- The running app currently uses the in-memory store (src/lib/db/store.ts) so
-- it can run with zero external accounts. To move to production persistence:
--   1. Create a Supabase project.
--   2. Run this migration (supabase db push / supabase migration up).
--   3. Set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SERVICE_ROLE_KEY in .env.
--   4. Implement the Supabase adapter behind the functions in src/lib/db/index.ts.
--
-- RLS mirrors the app-layer rules in src/lib/auth/rbac.ts: admins see the whole
-- group; users see only companies they are assigned to.

-- ---- Enums ------------------------------------------------------------------
create type company_status as enum
  ('draft_onboarding','pending_review','approved','ai_ready','needs_update','archived');
create type request_status as enum
  ('submitted','needs_more_information','ai_drafting','draft_ready','pending_approval',
   'changes_required','approved','scheduled','published','cancelled','completed');
create type content_status as enum
  ('ai_draft','user_edited','pending_approval','changes_required','approved',
   'scheduled','published','rejected','archived','analysed');
create type risk_level as enum ('low','medium','high','critical');

-- ---- Tenancy (SaaS T1) -------------------------------------------------------
-- A tenant is one customer: a marketing agency with client companies, or a
-- business group. Identity is GLOBAL (auth.users / app_users); membership is
-- PER-TENANT (tenant_members carries the user's role inside that tenant).
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'business_group',   -- business_group | agency
  plan text not null default 'starter',          -- starter | agency | scale
  status text not null default 'active',         -- active | suspended
  stripe_customer_id text,                        -- T4 billing (set by webhook)
  stripe_subscription_id text,                    -- T4 billing (set by webhook)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Webhook resolves a tenant from the Stripe customer id — UNIQUE so a customer
-- can never map to two tenants (multiple NULLs allowed pre-subscription).
create unique index tenants_stripe_customer_idx on tenants (stripe_customer_id);

-- ---- Users (extends Supabase auth.users; global identity) -------------------
create table app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,          -- global identity, like auth.users
  name text not null,
  active boolean not null default true,
  platform_admin boolean not null default false,  -- SaaS operator flag
  created_at timestamptz not null default now()
);

-- Per-tenant membership + role. owner ≙ senior/compliance approver tier;
-- admin = tenant-wide; member = company-scoped via company_access.
create table tenant_members (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  role text not null default 'member',           -- owner | admin | member
  role_title text,                               -- granular §9 title
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- ---- Companies --------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  status company_status not null default 'draft_onboarding',
  profile jsonb not null default '{}'::jsonb,   -- Brand Brain / onboarding fields
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_tenant_idx on companies (tenant_id);

create table company_access (
  user_id uuid not null references app_users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  location_id text,
  primary key (user_id, company_id)
);

create table company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  content_type text,
  size bigint,
  approval_status text not null default 'pending',
  consent_obtained boolean not null default false,
  shows_customer boolean not null default false,
  uploaded_by uuid references app_users (id),
  uploaded_at timestamptz not null default now()
);

-- ---- Marketing requests (tickets) ------------------------------------------
create table marketing_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  location_id text,
  requester_id uuid references app_users (id),
  request_type text not null,
  objective text not null,
  target_audience text,
  platform text,
  topic text not null,
  offer text,
  call_to_action text,
  preferred_date date,
  preferred_time text,
  urgency text not null default 'normal',
  notes text,
  consent jsonb not null default '{}'::jsonb,
  uploads jsonb not null default '[]'::jsonb,
  status request_status not null default 'submitted',
  assigned_reviewer_id uuid references app_users (id),
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Content ----------------------------------------------------------------
create table content_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  request_id uuid references marketing_requests (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  status content_status not null default 'ai_draft',
  created_by uuid references app_users (id),
  compliance jsonb,
  brand_fit_score int,
  approved_by uuid references app_users (id),
  approved_at timestamptz,
  ai_model text,
  ai_prompt text,
  sources_used jsonb not null default '[]'::jsonb,
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Social responses -------------------------------------------------------
create table social_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  original_comment text not null,
  sentiment text not null,
  intent text not null,
  risk_level risk_level not null,
  escalation_required boolean not null default false,
  draft_response text not null,
  status text not null default 'pending_approval',
  created_by uuid references app_users (id),
  approved_by uuid references app_users (id),
  created_at timestamptz not null default now()
);

-- ---- Audit log (append-only) ------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  action text not null,
  actor_id uuid references app_users (id),
  actor_email text not null,
  target_type text,
  target_id text,
  company_id uuid references companies (id) on delete set null,
  detail text,
  created_at timestamptz not null default now()
);

-- ---- RLS helpers (tenant-aware since T1) -------------------------------------
-- has_company_access keeps its NAME so the ~20 company-scoped policies below
-- are textually unchanged — only the definition became tenant-aware. Isolation
-- rule: a row is visible iff the caller is a member of the row's TENANT (and,
-- for members, assigned to the row's company). Non-members of a tenant never
-- qualify, so cross-tenant reads are impossible regardless of app bugs.

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users
    where id = auth.uid() and platform_admin and active
  );
$$;

create or replace function is_tenant_member(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m join app_users u on u.id = m.user_id
    where m.user_id = auth.uid() and m.tenant_id = tid and u.active
  );
$$;

create or replace function is_tenant_admin(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members m join app_users u on u.id = m.user_id
    where m.user_id = auth.uid() and m.tenant_id = tid
      and m.role in ('owner','admin') and u.active
  );
$$;

-- Company access = member of the company's tenant AND (tenant admin OR an
-- explicit company_access assignment).
create or replace function has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = cid
      and (
        is_tenant_admin(c.tenant_id)
        or (
          is_tenant_member(c.tenant_id)
          and exists (
            select 1 from company_access a
            where a.user_id = auth.uid() and a.company_id = cid
          )
        )
      )
  );
$$;

-- Legacy alias used by earlier policies: "admin of the tenant that owns the
-- row's company". Kept for the admin-gated tables below.
create or replace function is_admin_of_company(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = cid and is_tenant_admin(c.tenant_id)
  );
$$;

-- ---- Enable RLS -------------------------------------------------------------
alter table app_users            enable row level security;
alter table companies            enable row level security;
alter table company_access       enable row level security;
alter table company_documents    enable row level security;
alter table marketing_requests   enable row level security;
alter table content_items        enable row level security;
alter table social_responses     enable row level security;
alter table audit_logs           enable row level security;

-- Tenancy tables: members read their tenants; owners administer them.
alter table tenants        enable row level security;
alter table tenant_members enable row level security;
create policy tenants_read on tenants for select
  using (is_tenant_member(id) or is_platform_admin());
create policy tenants_owner_write on tenants for update
  using (exists (select 1 from tenant_members m where m.tenant_id = id
                 and m.user_id = auth.uid() and m.role = 'owner'))
  with check (true);
create policy members_read on tenant_members for select
  using (user_id = auth.uid() or is_tenant_member(tenant_id));
create policy members_admin_write on tenant_members for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));

-- Users: read your own identity row, plus fellow members of your tenants.
-- Identity writes (create/deactivate) run through the service role (invites)
-- or the platform admin.
create policy app_users_read on app_users for select
  using (
    id = auth.uid()
    or is_platform_admin()
    or exists (
      select 1 from tenant_members mine
      join tenant_members theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = auth.uid() and theirs.user_id = app_users.id
    )
  );
create policy app_users_platform_write on app_users for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Companies: tenant admins manage their tenant's companies; members read assigned.
create policy companies_read on companies for select
  using (has_company_access(id));
create policy companies_admin_write on companies for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));

create policy access_read on company_access for select
  using (user_id = auth.uid() or is_admin_of_company(company_id));
create policy access_admin_write on company_access for all
  using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));

create policy docs_scoped on company_documents for select
  using (has_company_access(company_id));
create policy docs_admin_write on company_documents for all
  using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));

-- Requests / content / social: scoped read; write within accessible company.
create policy requests_scoped on marketing_requests for select
  using (has_company_access(company_id));
create policy requests_write on marketing_requests for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

create policy content_scoped on content_items for select
  using (has_company_access(company_id));
create policy content_write on content_items for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

create policy social_scoped on social_responses for select
  using (has_company_access(company_id));
create policy social_write on social_responses for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

-- Audit: tenant-scoped read (admins whole tenant; members their companies),
-- insert-only within your tenant, never update/delete.
create policy audit_read on audit_logs for select
  using (
    tenant_id is not null and (
      is_tenant_admin(tenant_id)
      or (company_id is not null and has_company_access(company_id))
    )
  );
create policy audit_insert on audit_logs for insert
  with check (tenant_id is not null and is_tenant_member(tenant_id));

-- ============================================================================
--  Phases 2–12 — later-phase entities.
--
--  Style: complex nested structures (versions, source refs, claim audits,
--  usage rights, status history…) are stored as jsonb, mirroring the Phase-1
--  tables above and the shapes in src/lib/types.ts. RLS mirrors src/lib/auth/
--  rbac.ts: admins are tenant-wide (is_admin()); users see only companies they
--  are assigned to (has_company_access(company_id)). Tenant-wide rows (a null
--  company_id on responses / templates) are readable by everyone signed in.
--
--  A helper to DRY the company-scoped policy set for a table.
-- ============================================================================

-- ---- Content columns added by Phases 2–11 ----------------------------------
alter table content_items
  add column if not exists source_refs        jsonb not null default '[]'::jsonb,
  add column if not exists grounding_label    text,
  add column if not exists claim_audit        jsonb not null default '[]'::jsonb,
  add column if not exists routed_to          text,
  add column if not exists campaign_id        uuid,
  add column if not exists campaign_item_id   uuid,
  add column if not exists variant_group_id   text,
  add column if not exists variant_label      text,
  add column if not exists repurposed_from_id uuid,
  add column if not exists duplicate_warning  text,
  add column if not exists reuse_permitted    boolean,
  add column if not exists reuse_channels     jsonb not null default '[]'::jsonb,
  add column if not exists review_date        date,
  add column if not exists expiry_date        date,
  add column if not exists asset_ids          jsonb not null default '[]'::jsonb; -- Phase 11

-- ---- Social response column added by Phase 3 -------------------------------
alter table social_responses
  add column if not exists library_ref text;

-- ---- Phase 2: Brand Brain ---------------------------------------------------
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  content text not null,
  source_type text not null,
  status text not null default 'approved',
  version int not null default 1,
  previous_versions jsonb not null default '[]'::jsonb,
  added_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  description text not null default '',
  target_customer text,
  price_range text,
  price_approved boolean not null default false,
  margin_priority text not null default 'medium',
  seasonality text,
  locations jsonb not null default '[]'::jsonb,
  required_disclaimer text,
  restrictions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table local_area_profiles (
  company_id uuid primary key references companies (id) on delete cascade,
  suburbs jsonb not null default '[]'::jsonb,
  demographics text,
  common_needs text,
  competitors jsonb not null default '[]'::jsonb,
  local_events text,
  seasonal_patterns text,
  search_terms jsonb not null default '[]'::jsonb,
  buying_triggers text,
  updated_at timestamptz not null default now()
);

create table knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  request_id uuid references marketing_requests (id) on delete set null,
  question text not null,
  context text,
  blocking boolean not null default false,
  status text not null default 'open',
  answer text,
  answered_by uuid references app_users (id),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---- Phase 3: Governance ----------------------------------------------------
create table consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  person_shown text not null,
  consent_obtained boolean not null default false,
  document_name text,
  permitted_channels jsonb not null default '[]'::jsonb,
  expiry_date date,
  restrictions text,
  approved_by uuid references app_users (id),
  withdrawn boolean not null default false,
  created_at timestamptz not null default now()
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  evidence_type text not null,
  detail text not null default '',
  document_name text,
  valid_until date,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now()
);

create table approved_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  claim_text text not null,
  evidence_id uuid references evidence (id) on delete set null,
  allowed_channels jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- tenant_id null = PLATFORM library (curated, read-only to tenants);
-- tenant_id set + company_id null = tenant-wide; company_id set = company.
create table approved_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  category text not null,
  title text not null,
  response_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid references companies (id) on delete set null,
  user_id uuid references app_users (id),
  kind text not null,
  model text not null,
  prompt_summary text not null default '',
  output_chars int not null default 0,
  sources_used jsonb not null default '[]'::jsonb,
  est_cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---- Phase 4: Campaign Planner + Offers ------------------------------------
create table offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  terms text,
  exclusions text,
  approved_wording text not null default '',
  required_disclaimer text,
  channels_allowed jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  objective text not null,
  audience text,
  service_focus text,
  channels jsonb not null default '[]'::jsonb,
  duration_days int not null default 30,
  start_date date not null,
  offer_id uuid references offers (id) on delete set null,
  event_name text,
  event_date date,
  key_message text,
  status text not null default 'draft',
  request_id uuid references marketing_requests (id) on delete set null,
  created_by uuid references app_users (id),
  approved_by uuid references app_users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  day_offset int not null,
  channel text not null,
  content_type text not null,
  title text not null,
  brief text not null default '',
  content_id uuid references content_items (id) on delete set null,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- content_items forward references resolved now that campaigns exist.
alter table content_items
  add constraint content_campaign_fk
    foreign key (campaign_id) references campaigns (id) on delete set null,
  add constraint content_campaign_item_fk
    foreign key (campaign_item_id) references campaign_items (id) on delete set null,
  add constraint content_repurposed_fk
    foreign key (repurposed_from_id) references content_items (id) on delete set null;

-- ---- Phase 5: Prompt templates (tenant-wide when company_id null) ----------
create table prompt_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  name text not null,
  content_type text not null,
  topic text not null default '',
  objective text not null default '',
  audience text,
  channel text,
  tone text,
  active boolean not null default true,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now()
);

-- ---- Phase 6: Scheduled posts ----------------------------------------------
create table scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  scheduled_date date not null,
  scheduled_time text,
  status text not null default 'scheduled',
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Phase 7: Publishing ----------------------------------------------------
-- Tokens are encrypted at rest by the app (AES-256-GCM); only the ciphertext
-- and the last four chars are ever stored. Never store plaintext credentials.
create table publishing_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  account_name text not null,
  encrypted_token text not null,
  token_last_four text not null,
  status text not null default 'connected',
  connected_by uuid references app_users (id),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table publish_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  integration_id uuid references publishing_integrations (id) on delete set null,
  scheduled_post_id uuid references scheduled_posts (id) on delete set null,
  social_response_id uuid references social_responses (id) on delete set null,
  content_id uuid references content_items (id) on delete set null,
  status text not null,
  attempt int not null default 1,
  detail text not null default '',
  actor_id uuid references app_users (id),
  created_at timestamptz not null default now()
);

-- Per-tenant publishing control panel (T1: one row per tenant).
create table publishing_controls (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  freeze_all boolean not null default false,
  automated_publishing_disabled boolean not null default false,
  social_replies_disabled boolean not null default false,
  frozen_company_ids jsonb not null default '[]'::jsonb,
  frozen_platforms jsonb not null default '[]'::jsonb,
  frozen_campaign_ids jsonb not null default '[]'::jsonb
);

-- ---- Phase 8: UTM links -----------------------------------------------------
create table utm_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  destination_url text not null,
  source text not null,
  medium text not null,
  campaign text not null,
  content_type text,
  campaign_id uuid references campaigns (id) on delete set null,
  content_id uuid references content_items (id) on delete set null,
  request_id uuid references marketing_requests (id) on delete set null,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now()
);

-- ---- Phase 9: Recommendations + Tasks --------------------------------------
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  type text not null,
  title text not null,
  rationale text not null default '',
  action jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_by uuid references app_users (id),
  result_type text,
  result_id text,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  detail text,
  status text not null default 'open',
  source_recommendation_id uuid references recommendations (id) on delete set null,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  done_at timestamptz
);

-- ---- Phase 10: Security + Legal holds --------------------------------------
create table security_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  crisis_mode boolean not null default false,
  crisis_note text,
  sandbox_mode boolean not null default false,
  retention_days int not null default 730,
  ai_monthly_cap_usd numeric not null default 50,   -- matches in-memory default (T4)
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users (id)
);


create table legal_holds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  scope text not null,
  target_id text not null,
  company_id uuid not null references companies (id) on delete cascade,
  reason text not null,
  active boolean not null default true,
  applied_by uuid references app_users (id),
  applied_at timestamptz not null default now(),
  released_by uuid references app_users (id),
  released_at timestamptz
);

-- ---- Phase 11: Creative assets + brand templates ---------------------------
create table assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  location_id text,
  folder text,
  name text not null,
  description text,
  asset_type text not null,
  source text not null default 'upload',
  external_ref text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  tags jsonb not null default '[]'::jsonb,
  usage_rights jsonb not null default '{}'::jsonb, -- owner/licence/consent/channels/expiry
  status text not null default 'draft',
  created_by uuid references app_users (id),
  approved_by uuid references app_users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- tenant_id null = platform library; else tenant-wide / company-scoped.
create table brand_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  name text not null,
  kind text not null,
  description text not null default '',
  dimensions text,
  source text not null default 'canva',
  external_ref text,
  spec text,
  active boolean not null default true,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- Phase 12: Enterprise automation ---------------------------------------
create table automation_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  enabled boolean not null default false,
  draft_campaign_suggestions boolean not null default true,
  monthly_content_generation boolean not null default true,
  analytics_summaries boolean not null default true,
  content_alerts boolean not null default true,
  low_risk_auto_responses boolean not null default false,
  max_campaigns_per_run int not null default 2,
  max_drafts_per_company int not null default 2,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users (id)
);


create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  trigger text not null,
  triggered_by uuid references app_users (id),
  outcomes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
--  RLS for the later-phase tables.
-- ============================================================================
alter table knowledge_documents      enable row level security;
alter table services                 enable row level security;
alter table local_area_profiles      enable row level security;
alter table knowledge_gaps           enable row level security;
alter table consents                 enable row level security;
alter table evidence                 enable row level security;
alter table approved_claims          enable row level security;
alter table approved_responses       enable row level security;
alter table ai_runs                  enable row level security;
alter table offers                   enable row level security;
alter table campaigns                enable row level security;
alter table campaign_items           enable row level security;
alter table prompt_templates         enable row level security;
alter table scheduled_posts          enable row level security;
alter table publishing_integrations  enable row level security;
alter table publish_logs             enable row level security;
alter table publishing_controls      enable row level security;
alter table utm_links                enable row level security;
alter table recommendations          enable row level security;
alter table tasks                    enable row level security;
alter table security_settings        enable row level security;
alter table legal_holds              enable row level security;
alter table assets                   enable row level security;
alter table brand_templates          enable row level security;
alter table automation_settings      enable row level security;
alter table automation_runs          enable row level security;

-- Company-scoped tables: read within accessible companies; write likewise.
-- (Admins pass has_company_access() for every company via is_admin().)
create policy kd_rw   on knowledge_documents for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy svc_rw  on services for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy lap_rw  on local_area_profiles for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy gap_rw  on knowledge_gaps for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy cons_rw on consents for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy ev_rw   on evidence for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy clm_rw  on approved_claims for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy off_rw  on offers for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy cmp_rw  on campaigns for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy ci_rw   on campaign_items for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy sp_rw   on scheduled_posts for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy utm_rw  on utm_links for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy rec_rw  on recommendations for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy task_rw on tasks for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
create policy asset_rw on assets for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

-- ai_runs: the tenant's AI meter. Tenant admins read all of their tenant's
-- runs; members read their companies'. Tenant-level (null-company) rows — e.g.
-- automated management summaries — are admin-written only.
create policy air_read on ai_runs for select
  using (
    is_tenant_admin(tenant_id)
    or (company_id is not null and has_company_access(company_id))
  );
create policy air_write on ai_runs for insert
  with check (
    case when company_id is null then is_tenant_admin(tenant_id)
         else is_tenant_member(tenant_id) and has_company_access(company_id) end
  );

-- approved_responses / brand_templates / prompt_templates:
-- tenant-wide rows (null company) readable by anyone signed in; writes admin-only
-- for tenant-wide, company-scoped writes for the rest.
create policy resp_read on approved_responses for select
  using (
    tenant_id is null                                   -- platform library
    or (company_id is null and is_tenant_member(tenant_id))  -- tenant-wide
    or (company_id is not null and has_company_access(company_id))
  );
create policy resp_write on approved_responses for all
  using (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  )
  with check (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  );

create policy pt_read on prompt_templates for select
  using (
    tenant_id is null                                   -- platform library
    or (company_id is null and is_tenant_member(tenant_id))  -- tenant-wide
    or (company_id is not null and has_company_access(company_id))
  );
create policy pt_write on prompt_templates for all
  using (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  )
  with check (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  );

create policy bt_read on brand_templates for select
  using (
    tenant_id is null                                   -- platform library
    or (company_id is null and is_tenant_member(tenant_id))  -- tenant-wide
    or (company_id is not null and has_company_access(company_id))
  );
create policy bt_write on brand_templates for all
  using (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  )
  with check (
    case when tenant_id is null then is_platform_admin()
         when company_id is null then is_tenant_admin(tenant_id)
         else has_company_access(company_id) end
  );

-- Publishing integrations + logs: tenant-ADMIN-only (credentials + publishing).
create policy pi_admin on publishing_integrations for all
  using (is_admin_of_company(company_id)) with check (is_admin_of_company(company_id));
create policy pl_read on publish_logs for select
  using (has_company_access(company_id));
create policy pl_insert on publish_logs for insert
  with check (has_company_access(company_id));

-- Group control panels + legal holds: admin-only writes; controls readable by
-- all signed-in (the app reads freeze/crisis state everywhere), holds admin-only.
create policy pc_read on publishing_controls for select using (is_tenant_member(tenant_id));
create policy pc_write on publishing_controls for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy ss_read on security_settings for select using (is_tenant_member(tenant_id));
create policy ss_write on security_settings for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy as_read on automation_settings for select using (is_tenant_member(tenant_id));
create policy as_write on automation_settings for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy ar_admin on automation_runs for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
create policy lh_admin on legal_holds for all
  using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));
