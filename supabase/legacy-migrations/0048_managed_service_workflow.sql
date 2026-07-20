-- 0048 — durable managed-service planning, approvals and risk routing.
-- Browser access remains company-scoped through the existing P0 helper.

create table managed_strategy_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  quarter_start date not null,
  status text not null default 'draft',
  confirmed_inputs jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, quarter_start)
);

create table managed_content_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  strategy_cycle_id uuid references managed_strategy_cycles (id) on delete set null,
  campaign_id uuid references campaigns (id) on delete set null,
  package_period text not null,
  unit_key text not null,
  title text not null,
  theme text not null,
  status text not null default 'planned',
  reusable_asset_id uuid references assets (id) on delete set null,
  quota_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, package_period, unit_key)
);

create table managed_channel_adaptations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  concept_id uuid not null references managed_content_concepts (id) on delete cascade,
  channel_key text not null,
  copy text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (concept_id, channel_key)
);

create table managed_planned_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  concept_id uuid not null references managed_content_concepts (id) on delete cascade,
  adaptation_id uuid not null references managed_channel_adaptations (id) on delete cascade,
  planned_publish_at timestamptz not null,
  final_content_due_at timestamptz generated always as
    (
      (
        (planned_publish_at at time zone 'UTC') - interval '14 days'
      ) at time zone 'UTC'
    ) stored,
  status text not null default 'planned',
  scheduled_post_id uuid references scheduled_posts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adaptation_id, planned_publish_at)
);

create table managed_approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  content_id uuid references content_items (id) on delete cascade,
  concept_id uuid references managed_content_concepts (id) on delete cascade,
  planned_slot_id uuid references managed_planned_slots (id) on delete cascade,
  ad_campaign_id uuid references ad_campaigns (id) on delete cascade,
  scope text not null,
  recipient_email text not null,
  token_hash text not null unique,
  status text not null default 'pending',
  due_at timestamptz not null,
  revision_round smallint not null default 0 check (revision_round between 0 and 2),
  superseded_by_id uuid references managed_approval_requests (id) on delete set null,
  reminder_7d_at timestamptz,
  reminder_3d_at timestamptz,
  staff_escalation_at timestamptz,
  reminder_7d_key text unique,
  reminder_3d_key text unique,
  staff_escalation_key text unique,
  reminder_claim_kind text
    check (reminder_claim_kind in ('client_7d', 'client_3d', 'staff_1d')),
  reminder_claim_owner text,
  reminder_claimed_at timestamptz,
  reminder_claim_expires_at timestamptz,
  responded_at timestamptz,
  response_payload jsonb,
  direct_charge_disclosure_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table managed_paid_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  ad_campaign_id uuid not null references ad_campaigns (id) on delete cascade,
  month_key text not null,
  requested_budget_aud numeric(12,2) not null check (requested_budget_aud >= 0),
  client_monthly_cap_aud numeric(12,2) not null check (client_monthly_cap_aud >= 0),
  creative_approval_id uuid references managed_approval_requests (id) on delete restrict,
  budget_targeting_approval_id uuid references managed_approval_requests (id) on delete restrict,
  disclosure_accepted_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_campaign_id, month_key)
);

create table managed_engagement_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  source_kind text not null,
  source_id text not null,
  risk_level text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  sentiment text not null,
  decision text not null,
  reason text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, source_kind, source_id)
);

-- Keep denormalised tenant ids cryptographically boring: a row cannot claim a
-- different tenant from its company, even when written by the service role.
create unique index if not exists companies_id_tenant_unique_idx
  on companies (id, tenant_id);
create unique index if not exists campaigns_id_company_unique_idx
  on campaigns (id, company_id);
create unique index if not exists content_items_id_company_unique_idx
  on content_items (id, company_id);
create unique index if not exists scheduled_posts_id_company_unique_idx
  on scheduled_posts (id, company_id);
create unique index if not exists ad_campaigns_id_company_unique_idx
  on ad_campaigns (id, company_id);
create unique index if not exists assets_id_company_unique_idx
  on assets (id, company_id);
create unique index managed_strategy_cycles_id_tenant_company_unique_idx
  on managed_strategy_cycles (id, tenant_id, company_id);
create unique index managed_content_concepts_id_tenant_company_unique_idx
  on managed_content_concepts (id, tenant_id, company_id);
create unique index managed_content_concepts_id_company_unique_idx
  on managed_content_concepts (id, company_id);
create unique index managed_channel_adaptations_id_tenant_company_unique_idx
  on managed_channel_adaptations (id, tenant_id, company_id);
create unique index managed_planned_slots_id_tenant_company_unique_idx
  on managed_planned_slots (id, tenant_id, company_id);
create unique index managed_approval_requests_id_tenant_company_unique_idx
  on managed_approval_requests (id, tenant_id, company_id);
alter table managed_strategy_cycles
  add constraint managed_strategy_cycles_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_content_concepts
  add constraint managed_content_concepts_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_channel_adaptations
  add constraint managed_channel_adaptations_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_planned_slots
  add constraint managed_planned_slots_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_approval_requests
  add constraint managed_approval_requests_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_paid_authorizations
  add constraint managed_paid_authorizations_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;
alter table managed_engagement_routes
  add constraint managed_engagement_routes_company_tenant_fk
  foreign key (company_id, tenant_id) references companies (id, tenant_id) on delete cascade;

alter table managed_content_concepts
  add constraint managed_content_concepts_strategy_tenant_company_fk
  foreign key (strategy_cycle_id, tenant_id, company_id)
  references managed_strategy_cycles (id, tenant_id, company_id),
  add constraint managed_content_concepts_campaign_company_fk
  foreign key (campaign_id, company_id)
  references campaigns (id, company_id),
  add constraint managed_content_concepts_asset_company_fk
  foreign key (reusable_asset_id, company_id)
  references assets (id, company_id);
alter table managed_channel_adaptations
  add constraint managed_channel_adaptations_concept_tenant_company_fk
  foreign key (concept_id, tenant_id, company_id)
  references managed_content_concepts (id, tenant_id, company_id) on delete cascade;
alter table managed_planned_slots
  add constraint managed_planned_slots_concept_tenant_company_fk
  foreign key (concept_id, tenant_id, company_id)
  references managed_content_concepts (id, tenant_id, company_id) on delete cascade,
  add constraint managed_planned_slots_adaptation_tenant_company_fk
  foreign key (adaptation_id, tenant_id, company_id)
  references managed_channel_adaptations (id, tenant_id, company_id) on delete cascade,
  add constraint managed_planned_slots_scheduled_post_company_fk
  foreign key (scheduled_post_id, company_id)
  references scheduled_posts (id, company_id);
alter table managed_approval_requests
  add constraint managed_approval_requests_content_company_fk
  foreign key (content_id, company_id)
  references content_items (id, company_id) on delete cascade,
  add constraint managed_approval_requests_concept_tenant_company_fk
  foreign key (concept_id, tenant_id, company_id)
  references managed_content_concepts (id, tenant_id, company_id) on delete cascade,
  add constraint managed_approval_requests_slot_tenant_company_fk
  foreign key (planned_slot_id, tenant_id, company_id)
  references managed_planned_slots (id, tenant_id, company_id) on delete cascade,
  add constraint managed_approval_requests_ad_campaign_company_fk
  foreign key (ad_campaign_id, company_id)
  references ad_campaigns (id, company_id) on delete cascade,
  add constraint managed_approval_requests_superseded_tenant_company_fk
  foreign key (superseded_by_id, tenant_id, company_id)
  references managed_approval_requests (id, tenant_id, company_id);
alter table managed_paid_authorizations
  add constraint managed_paid_authorizations_ad_campaign_company_fk
  foreign key (ad_campaign_id, company_id)
  references ad_campaigns (id, company_id) on delete cascade,
  add constraint managed_paid_authorizations_creative_approval_tenant_company_fk
  foreign key (creative_approval_id, tenant_id, company_id)
  references managed_approval_requests (id, tenant_id, company_id) on delete restrict,
  add constraint managed_paid_authorizations_budget_approval_tenant_company_fk
  foreign key (budget_targeting_approval_id, tenant_id, company_id)
  references managed_approval_requests (id, tenant_id, company_id) on delete restrict;

alter table content_items
  add column if not exists managed_concept_id uuid
    references managed_content_concepts (id) on delete set null,
  add column if not exists managed_channel_key text;
alter table content_items
  add constraint content_items_managed_concept_company_fk
  foreign key (managed_concept_id, company_id)
  references managed_content_concepts (id, company_id);

alter table assets
  add column if not exists rights_confirmed_at timestamptz,
  add column if not exists rights_confirmation_email text,
  add column if not exists private_provenance jsonb;

create index managed_strategy_cycles_due_idx
  on managed_strategy_cycles (tenant_id, quarter_start, status);
create index managed_content_concepts_quota_idx
  on managed_content_concepts (tenant_id, company_id, package_period);
create index managed_planned_slots_horizon_idx
  on managed_planned_slots (tenant_id, planned_publish_at, status);
create index managed_approval_requests_due_idx
  on managed_approval_requests (tenant_id, status, due_at);
create index managed_approval_requests_content_idx
  on managed_approval_requests (content_id, created_at desc);
create index managed_engagement_routes_queue_idx
  on managed_engagement_routes (tenant_id, decision, created_at);

alter table managed_strategy_cycles enable row level security;
alter table managed_content_concepts enable row level security;
alter table managed_channel_adaptations enable row level security;
alter table managed_planned_slots enable row level security;
alter table managed_approval_requests enable row level security;
alter table managed_paid_authorizations enable row level security;
alter table managed_engagement_routes enable row level security;

create or replace function is_company_staff(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from companies c
    join tenant_members m
      on m.tenant_id = c.tenant_id and m.user_id = auth.uid()
    join app_users u on u.id = m.user_id
    where c.id = cid
      and u.active
      and (
        m.role in ('owner', 'admin')
        or (
          m.role = 'member'
          and not (
            m.portal_only
            or (
              select count(*)
              from company_access member_access
              join companies member_company
                on member_company.id = member_access.company_id
              where member_access.user_id = m.user_id
                and member_company.tenant_id = m.tenant_id
            ) = 1
          )
          and exists (
            select 1 from company_access a
            where a.user_id = auth.uid() and a.company_id = cid
          )
        )
      )
  );
$$;
revoke all on function is_company_staff(uuid) from public, anon;
grant execute on function is_company_staff(uuid) to authenticated, service_role;

create policy managed_strategy_cycles_read on managed_strategy_cycles
  for select to authenticated using (has_company_access(company_id));
create policy managed_strategy_cycles_staff_write on managed_strategy_cycles
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
create policy managed_content_concepts_read on managed_content_concepts
  for select to authenticated using (has_company_access(company_id));
create policy managed_content_concepts_staff_write on managed_content_concepts
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
create policy managed_channel_adaptations_read on managed_channel_adaptations
  for select to authenticated using (has_company_access(company_id));
create policy managed_channel_adaptations_staff_write on managed_channel_adaptations
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
create policy managed_planned_slots_read on managed_planned_slots
  for select to authenticated using (has_company_access(company_id));
create policy managed_planned_slots_staff_write on managed_planned_slots
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
create policy managed_approval_requests_client_read on managed_approval_requests
  for select to authenticated using (
    has_company_access(company_id)
    and (
      is_company_staff(company_id)
      or recipient_email = (
        select u.email from app_users u where u.id = auth.uid() and u.active
      )
    )
  );
create policy managed_approval_requests_staff_write on managed_approval_requests
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
revoke select on managed_approval_requests from authenticated;
grant select (
  id, tenant_id, company_id, content_id, concept_id, planned_slot_id,
  ad_campaign_id, scope, recipient_email, status, due_at, revision_round,
  superseded_by_id, reminder_7d_at, reminder_3d_at, staff_escalation_at,
  reminder_7d_key, reminder_3d_key, staff_escalation_key, responded_at,
  direct_charge_disclosure_accepted_at, created_at, updated_at
) on managed_approval_requests to authenticated;
create policy managed_paid_authorizations_read on managed_paid_authorizations
  for select to authenticated using (has_company_access(company_id));
create policy managed_paid_authorizations_staff_write on managed_paid_authorizations
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));
create policy managed_engagement_routes_staff_access on managed_engagement_routes
  for all to authenticated using (is_company_staff(company_id))
  with check (is_company_staff(company_id));

create or replace function client_respond_managed_approval(
  p_request_id uuid,
  p_decision text,
  p_accept_direct_charge_disclosure boolean default false
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  target managed_approval_requests%rowtype;
  stamp timestamptz := now();
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid approval decision';
  end if;
  select r.* into target
  from managed_approval_requests r
  join app_users u
    on u.id = auth.uid() and u.active and lower(u.email) = lower(r.recipient_email)
  join tenant_members m
    on m.user_id = u.id and m.tenant_id = r.tenant_id
  where r.id = p_request_id
    and r.status = 'pending'
    and r.due_at > stamp
    and r.superseded_by_id is null
    and m.role = 'member'
    and (
      m.portal_only
      or (
        select count(*)
        from company_access client_access
        join companies client_company on client_company.id = client_access.company_id
        where client_access.user_id = m.user_id
          and client_company.tenant_id = m.tenant_id
      ) = 1
    )
    and has_company_access(r.company_id)
  for update of r;
  if not found then return false; end if;
  if p_decision = 'changes_requested' and target.revision_round >= 2 then
    return false;
  end if;
  if target.scope = 'paid_budget_targeting'
     and p_decision = 'approved'
     and not p_accept_direct_charge_disclosure then
    raise exception 'Direct platform charge disclosure acceptance is required';
  end if;
  update managed_approval_requests
  set status = p_decision,
      responded_at = stamp,
      revision_round = case
        when p_decision = 'changes_requested'
          then least(2, revision_round + 1)
        else revision_round
      end,
      direct_charge_disclosure_accepted_at = case
        when p_accept_direct_charge_disclosure then stamp
        else direct_charge_disclosure_accepted_at
      end,
      updated_at = stamp
  where id = target.id;
  if p_decision = 'approved' and target.ad_campaign_id is not null then
    update managed_paid_authorizations a
    set status = 'approved',
        disclosure_accepted_at = coalesce(
          a.disclosure_accepted_at,
          (
            select r.direct_charge_disclosure_accepted_at
            from managed_approval_requests r
            where r.id = a.budget_targeting_approval_id
          )
        ),
        updated_at = stamp
    where a.ad_campaign_id = target.ad_campaign_id
      and a.tenant_id = target.tenant_id
      and a.company_id = target.company_id
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.creative_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
      )
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.budget_targeting_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
          and r.direct_charge_disclosure_accepted_at is not null
      )
      and (
        select coalesce(sum(other.requested_budget_aud), 0)
        from managed_paid_authorizations other
        where other.company_id = a.company_id
          and other.month_key = a.month_key
          and other.status = 'approved'
          and other.id <> a.id
      ) + a.requested_budget_aud <= a.client_monthly_cap_aud;
  end if;
  return true;
end;
$$;
revoke all on function client_respond_managed_approval(uuid, text, boolean)
  from public, anon;
grant execute on function client_respond_managed_approval(uuid, text, boolean)
  to authenticated;

-- Magic-link decisions are validated and recorded wholly inside Postgres. The
-- caller supplies only the SHA-256 digest; token_hash is never selected back to
-- browser code. Replaying the same decision is idempotent, while a conflicting
-- replay, expired/superseded request, wrong company, or third revision fails.
create or replace function respond_managed_approval_with_token(
  p_token_hash text,
  p_company_id uuid,
  p_decision text,
  p_response_payload jsonb default '{}'::jsonb,
  p_accept_direct_charge_disclosure boolean default false
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  target managed_approval_requests%rowtype;
  stamp timestamptz := now();
begin
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid approval decision';
  end if;
  select r.* into target
  from managed_approval_requests r
  where r.token_hash = p_token_hash
    and r.company_id = p_company_id
  for update;
  if not found then return false; end if;
  if target.status = p_decision and target.responded_at is not null then
    return true;
  end if;
  if target.status <> 'pending'
     or target.due_at <= stamp
     or target.superseded_by_id is not null then
    return false;
  end if;
  if p_decision = 'changes_requested' and target.revision_round >= 2 then
    return false;
  end if;
  if target.scope = 'paid_budget_targeting'
     and p_decision = 'approved'
     and not p_accept_direct_charge_disclosure then
    raise exception 'Direct platform charge disclosure acceptance is required';
  end if;
  update managed_approval_requests
  set status = p_decision,
      responded_at = stamp,
      response_payload = coalesce(p_response_payload, '{}'::jsonb),
      revision_round = case
        when p_decision = 'changes_requested' then revision_round + 1
        else revision_round
      end,
      direct_charge_disclosure_accepted_at = case
        when p_accept_direct_charge_disclosure then stamp
        else direct_charge_disclosure_accepted_at
      end,
      updated_at = stamp
  where id = target.id;
  if p_decision = 'approved' and target.ad_campaign_id is not null then
    update managed_paid_authorizations a
    set status = 'approved',
        disclosure_accepted_at = coalesce(
          a.disclosure_accepted_at,
          (
            select r.direct_charge_disclosure_accepted_at
            from managed_approval_requests r
            where r.id = a.budget_targeting_approval_id
          )
        ),
        updated_at = stamp
    where a.ad_campaign_id = target.ad_campaign_id
      and a.tenant_id = target.tenant_id
      and a.company_id = target.company_id
      and a.status = 'pending'
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.creative_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
      )
      and exists (
        select 1 from managed_approval_requests r
        where r.id = a.budget_targeting_approval_id
          and r.status = 'approved'
          and r.due_at > stamp
          and r.superseded_by_id is null
          and r.direct_charge_disclosure_accepted_at is not null
      )
      and (
        select coalesce(sum(other.requested_budget_aud), 0)
        from managed_paid_authorizations other
        where other.company_id = a.company_id
          and other.month_key = a.month_key
          and other.status = 'approved'
          and other.id <> a.id
      ) + a.requested_budget_aud <= a.client_monthly_cap_aud;
  end if;
  return true;
end;
$$;
revoke all on function respond_managed_approval_with_token(
  text, uuid, text, jsonb, boolean
) from public;
grant execute on function respond_managed_approval_with_token(
  text, uuid, text, jsonb, boolean
) to anon, authenticated, service_role;

create or replace function claim_managed_approval_reminder(
  p_request_id uuid,
  p_kind text,
  p_owner text,
  p_now timestamptz,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql security definer set search_path = public as $$
declare claimed_count integer;
begin
  if p_kind not in ('client_7d', 'client_3d', 'staff_1d') then
    raise exception 'Invalid reminder kind';
  end if;
  update managed_approval_requests
  set reminder_claim_kind = p_kind,
      reminder_claim_owner = p_owner,
      reminder_claimed_at = p_now,
      reminder_claim_expires_at = p_now + make_interval(secs => p_lease_seconds),
      updated_at = p_now
  where id = p_request_id
    and status = 'pending'
    and (reminder_claim_expires_at is null or reminder_claim_expires_at <= p_now)
    and case p_kind
      when 'client_7d' then reminder_7d_at is null
      when 'client_3d' then reminder_3d_at is null
      else staff_escalation_at is null
    end;
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;
revoke all on function claim_managed_approval_reminder(uuid, text, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function claim_managed_approval_reminder(uuid, text, text, timestamptz, integer)
  to service_role;

comment on column managed_approval_requests.token_hash is
  'SHA-256 digest only; plaintext magic-link tokens are never persisted';
comment on column assets.private_provenance is
  'Service-only generation provenance; never expose in client-facing copy';
