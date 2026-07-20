-- Canonical timestamped successor to the archived logical migration 0050.
-- Source: ../legacy-migrations/pending/0050_content_desk_delegation_replay_ledger.sql
-- Source SHA-256: 7e32ee6bc2b98b04bc3a4cf7c3e7a005f7bc49377be1edb138e65d3c3e8c30e9
-- This migration remains unapplied.

-- 0050 — one-time Content Desk actor delegations.
-- Service-role callers consume issuer/JTI pairs atomically before operator work.

create table content_desk_delegation_uses (
  issuer text not null,
  jti text not null,
  actor_id uuid not null references app_users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  consumed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (issuer, jti),
  check (issuer = 'content-desk'),
  check (expires_at > consumed_at)
);

create index content_desk_delegation_uses_expiry_idx
  on content_desk_delegation_uses (expires_at);

alter table content_desk_delegation_uses enable row level security;
revoke all on table content_desk_delegation_uses from anon, authenticated;

create or replace function consume_content_desk_delegation(
  p_issuer text,
  p_jti text,
  p_actor_id uuid,
  p_tenant_id uuid,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_jti text;
  v_now timestamptz := clock_timestamp();
begin
  if p_issuer <> 'content-desk' or p_expires_at <= v_now then
    return false;
  end if;

  delete from public.content_desk_delegation_uses
  where expires_at <= v_now;

  insert into public.content_desk_delegation_uses (
    issuer,
    jti,
    actor_id,
    tenant_id,
    consumed_at,
    expires_at
  ) values (
    p_issuer,
    p_jti,
    p_actor_id,
    p_tenant_id,
    v_now,
    p_expires_at
  )
  on conflict (issuer, jti) do nothing
  returning jti into inserted_jti;

  return inserted_jti is not null;
end;
$$;

revoke all on function consume_content_desk_delegation(
  text, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function consume_content_desk_delegation(
  text, text, uuid, uuid, timestamptz
) to service_role;

comment on table content_desk_delegation_uses is
  'Service-only TTL replay ledger for one-time Content Desk actor delegations';
