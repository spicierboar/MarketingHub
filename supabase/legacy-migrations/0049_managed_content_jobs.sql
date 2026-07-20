-- 0049 — private Command Centre correlation for Content Engine managed jobs.
-- These tables are service-role only: RLS is enabled without browser policies.

create table managed_content_jobs (
  id text primary key,
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  request_id text not null,
  concept_id text not null,
  strategy_cycle_id uuid references managed_strategy_cycles (id) on delete set null,
  idempotency_key text not null,
  request_fingerprint text not null,
  request_payload jsonb not null,
  schema_version text not null check (schema_version = '1.0'),
  callback_url text,
  callback_target text check (callback_target in ('command-centre')),
  external_job_id text,
  external_status_url text,
  status text not null,
  poll_attempts integer not null default 0 check (poll_attempts >= 0),
  next_poll_at timestamptz,
  last_error text,
  result_payload jsonb,
  private_provenance jsonb,
  imported_concept_id uuid references managed_content_concepts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((callback_url is not null) <> (callback_target is not null)),
  unique (tenant_id, idempotency_key),
  unique (external_job_id)
);

create table managed_content_job_events (
  event_id text primary key,
  job_id text not null references managed_content_jobs (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  event_type text not null,
  payload_digest text not null,
  processing_status text not null
    check (processing_status in ('processing', 'completed', 'failed')),
  lease_owner text,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);

create table managed_content_job_exceptions (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references managed_content_jobs (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  kind text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (job_id, kind)
);

create unique index managed_content_jobs_id_tenant_company_unique_idx
  on managed_content_jobs (id, tenant_id, company_id);
alter table managed_content_job_events
  add constraint managed_content_job_events_job_tenant_company_fk
  foreign key (job_id, tenant_id, company_id)
  references managed_content_jobs (id, tenant_id, company_id) on delete cascade;
alter table managed_content_job_exceptions
  add constraint managed_content_job_exceptions_job_tenant_company_fk
  foreign key (job_id, tenant_id, company_id)
  references managed_content_jobs (id, tenant_id, company_id) on delete cascade;
alter table managed_content_jobs
  add constraint managed_content_jobs_company_tenant_fk
  foreign key (company_id, tenant_id)
  references companies (id, tenant_id) on delete cascade,
  add constraint managed_content_jobs_strategy_tenant_company_fk
  foreign key (strategy_cycle_id, tenant_id, company_id)
  references managed_strategy_cycles (id, tenant_id, company_id)
  on delete set null (strategy_cycle_id),
  add constraint managed_content_jobs_imported_concept_tenant_company_fk
  foreign key (imported_concept_id, tenant_id, company_id)
  references managed_content_concepts (id, tenant_id, company_id)
  on delete set null (imported_concept_id);

create index managed_content_jobs_poll_idx
  on managed_content_jobs (tenant_id, next_poll_at)
  where status in ('accepted', 'processing');
create index managed_content_job_events_job_idx
  on managed_content_job_events (job_id, received_at desc);
create index managed_content_job_events_lease_idx
  on managed_content_job_events (lease_expires_at)
  where processing_status = 'processing';
create index managed_content_job_exceptions_open_idx
  on managed_content_job_exceptions (tenant_id, status, created_at desc);

alter table managed_content_jobs enable row level security;
alter table managed_content_job_events enable row level security;
alter table managed_content_job_exceptions enable row level security;
revoke all on table managed_content_jobs from anon, authenticated;
revoke all on table managed_content_job_events from anon, authenticated;
revoke all on table managed_content_job_exceptions from anon, authenticated;

create or replace function claim_managed_content_job_event(
  p_event_id text,
  p_job_id text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_event_type text,
  p_payload_digest text,
  p_lease_owner text,
  p_now timestamptz,
  p_lease_seconds integer default 300
) returns text
language plpgsql security definer set search_path = public as $$
declare
  claimed_id text;
  existing_digest text;
begin
  insert into managed_content_job_events (
    event_id, job_id, tenant_id, company_id, event_type, payload_digest,
    processing_status, lease_owner, lease_acquired_at, lease_expires_at
  ) values (
    p_event_id, p_job_id, p_tenant_id, p_company_id, p_event_type,
    p_payload_digest, 'processing', p_lease_owner, p_now,
    p_now + make_interval(secs => p_lease_seconds)
  )
  on conflict (event_id) do update
    set processing_status = 'processing',
        lease_owner = excluded.lease_owner,
        lease_acquired_at = excluded.lease_acquired_at,
        lease_expires_at = excluded.lease_expires_at,
        completed_at = null,
        last_error = null
    where managed_content_job_events.payload_digest = excluded.payload_digest
      and (
        managed_content_job_events.processing_status = 'failed'
        or (
          managed_content_job_events.processing_status = 'processing'
          and managed_content_job_events.lease_expires_at <= p_now
        )
      )
  returning event_id into claimed_id;
  if claimed_id is not null then return 'claimed'; end if;
  select payload_digest into existing_digest
  from managed_content_job_events where event_id = p_event_id;
  if existing_digest is distinct from p_payload_digest then
    return 'payload_mismatch';
  end if;
  return 'duplicate';
end;
$$;
revoke all on function claim_managed_content_job_event(
  text, text, uuid, uuid, text, text, text, timestamptz, integer
) from public, anon, authenticated;
grant execute on function claim_managed_content_job_event(
  text, text, uuid, uuid, text, text, text, timestamptz, integer
) to service_role;

comment on column managed_content_jobs.private_provenance is
  'Service-only import/correlation provenance; never serialize to client surfaces';
comment on table managed_content_job_events is
  'Durable HMAC callback replay and deduplication ledger';
