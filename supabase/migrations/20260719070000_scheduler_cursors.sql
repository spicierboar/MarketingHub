-- Durable, leased fairness cursors for bounded scheduler ticks.
-- This migration intentionally remains unapplied until the scheduler release.

create table public.scheduler_cursors (
  scope text primary key,
  after_key text,
  claim_sequence bigint not null default 0 check (claim_sequence >= 0),
  claims jsonb not null default '{}'::jsonb check (jsonb_typeof(claims) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.scheduler_cursors enable row level security;
alter table public.scheduler_cursors force row level security;

revoke all on table public.scheduler_cursors
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.scheduler_cursors to service_role;

create or replace function public.claim_scheduler_cursor(
  p_scope text,
  p_candidate_keys text[],
  p_owner text,
  p_lease_seconds integer default 120
) returns table (claimed_key text, claim_sequence bigint)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row public.scheduler_cursors%rowtype;
  v_claims jsonb;
  v_count integer;
  v_after_index integer;
  v_index integer;
  v_candidate text;
  v_sequence bigint;
  v_now timestamptz;
begin
  if current_user <> 'service_role' then
    raise insufficient_privilege using message = 'service_role required';
  end if;
  if p_scope is null or btrim(p_scope) = '' then
    raise invalid_parameter_value using message = 'scope is required';
  end if;
  if p_owner is null or btrim(p_owner) = '' then
    raise invalid_parameter_value using message = 'owner is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 900 then
    raise invalid_parameter_value using message = 'lease must be between 1 and 900 seconds';
  end if;

  select count(*)::integer
  into v_count
  from unnest(p_candidate_keys) candidate
  where candidate is not null and btrim(candidate) <> '';
  if v_count = 0 or v_count <> cardinality(p_candidate_keys) then
    raise invalid_parameter_value using message = 'candidate keys must be non-empty';
  end if;
  if v_count <> (
    select count(distinct candidate)::integer from unnest(p_candidate_keys) candidate
  ) then
    raise invalid_parameter_value using message = 'candidate keys must be unique';
  end if;

  insert into public.scheduler_cursors (scope)
  values (p_scope)
  on conflict (scope) do nothing;

  select *
  into strict v_row
  from public.scheduler_cursors
  where scope = p_scope
  for update;

  v_now := clock_timestamp();
  select coalesce(
    jsonb_object_agg(entry.key, entry.value),
    '{}'::jsonb
  )
  into v_claims
  from jsonb_each(v_row.claims) entry
  where (entry.value ->> 'expiresAt')::timestamptz > v_now;

  v_after_index := coalesce(array_position(p_candidate_keys, v_row.after_key), 0);
  for offset_index in 1..v_count loop
    v_index := ((v_after_index + offset_index - 1) % v_count) + 1;
    v_candidate := p_candidate_keys[v_index];
    if not (v_claims ? v_candidate) then
      v_sequence := v_row.claim_sequence + 1;
      v_claims := v_claims || jsonb_build_object(
        v_candidate,
        jsonb_build_object(
          'owner', p_owner,
          'expiresAt', v_now + make_interval(secs => p_lease_seconds)
        )
      );
      update public.scheduler_cursors
      set
        after_key = v_candidate,
        claim_sequence = v_sequence,
        claims = v_claims,
        updated_at = v_now
      where scope = p_scope;
      return query select v_candidate, v_sequence;
      return;
    end if;
  end loop;

  update public.scheduler_cursors
  set claims = v_claims, updated_at = v_now
  where scope = p_scope and claims is distinct from v_claims;
end;
$$;

create or replace function public.release_scheduler_cursor_claim(
  p_scope text,
  p_claimed_key text,
  p_owner text
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_claims jsonb;
begin
  if current_user <> 'service_role' then
    raise insufficient_privilege using message = 'service_role required';
  end if;

  select claims
  into v_claims
  from public.scheduler_cursors
  where scope = p_scope
  for update;

  if not found or v_claims -> p_claimed_key ->> 'owner' is distinct from p_owner then
    return false;
  end if;

  update public.scheduler_cursors
  set claims = claims - p_claimed_key, updated_at = clock_timestamp()
  where scope = p_scope;
  return true;
end;
$$;

revoke all on function public.claim_scheduler_cursor(
  text, text[], text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.release_scheduler_cursor_claim(
  text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_scheduler_cursor(
  text, text[], text, integer
) to service_role;
grant execute on function public.release_scheduler_cursor_claim(
  text, text, text
) to service_role;

-- A live provider may accept a request even when the worker loses the response.
-- Such posts are quarantined until reconciliation; the queue never auto-retries.
alter table public.scheduled_posts
  add column delivery_idempotency_key text,
  add column delivery_unknown_at timestamptz,
  add column delivery_unknown_reason text;

create index scheduled_posts_delivery_unknown_idx
  on public.scheduled_posts (company_id, delivery_unknown_at desc)
  where status = 'delivery_unknown';
