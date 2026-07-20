-- Focused remediation for the 2026-07-19 Supabase advisor audit.
-- Keep the canonical baseline and replay-ledger migration immutable.

-- Bound policy replacement waits so a busy table fails safely instead of
-- blocking application traffic indefinitely. Retry the whole migration during
-- a low-traffic window if lock_timeout is raised.
set local lock_timeout = '5s';

-- SECURITY DEFINER search paths below include public, so enforce the trusted
-- schema invariant explicitly rather than relying only on baseline state.
revoke create on schema public from public, anon, authenticated;

-- Tenant lifecycle and updates are service operations. Remove the baseline's
-- broad browser ACLs, then retain only authenticated read access.
revoke all privileges on table public.tenants from anon, authenticated;
grant select on table public.tenants to authenticated;

-- The canonical baseline also records column-level grants. Table-level
-- revocations do not remove them, so revoke the matching column ACLs explicitly.
revoke insert (
  branding,
  created_at,
  id,
  kind,
  marketing_package_catalog,
  name,
  onboarding,
  onboarding_completed_at,
  plan,
  promo_catalog,
  promo_industries,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  timezone,
  updated_at
) on table public.tenants from anon, authenticated;

revoke update (
  branding,
  created_at,
  id,
  kind,
  marketing_package_catalog,
  name,
  onboarding,
  onboarding_completed_at,
  plan,
  promo_catalog,
  promo_industries,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  timezone,
  updated_at
) on table public.tenants from anon, authenticated;

revoke references (
  branding,
  created_at,
  id,
  kind,
  marketing_package_catalog,
  name,
  onboarding,
  onboarding_completed_at,
  plan,
  promo_catalog,
  promo_industries,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  timezone,
  updated_at
) on table public.tenants from anon, authenticated;

revoke select (
  branding,
  created_at,
  id,
  kind,
  marketing_package_catalog,
  name,
  onboarding,
  onboarding_completed_at,
  plan,
  promo_catalog,
  promo_industries,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  timezone,
  updated_at
) on table public.tenants from anon;

drop policy if exists tenants_owner_write on public.tenants;
create policy tenants_owner_write
on public.tenants
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from public.tenant_members as membership
    join public.app_users as actor
      on actor.id = membership.user_id
    where membership.tenant_id = tenants.id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
      and actor.active
  )
)
with check (
  exists (
    select 1
    from public.tenant_members as membership
    join public.app_users as actor
      on actor.id = membership.user_id
    where membership.tenant_id = tenants.id
      and membership.user_id = (select auth.uid())
      and membership.role = 'owner'
      and actor.active
  )
);

comment on policy tenants_owner_write on public.tenants is
  'Defense in depth: if a future column grant is approved, active authenticated owners must own both the old and resulting tenant row';

-- Every SECURITY DEFINER function has a fixed trusted search path. CREATE on
-- public is denied to browser roles by the canonical baseline.
alter function public.claim_managed_approval_reminder(
  uuid, text, text, timestamptz, integer
) set search_path = pg_catalog, public;
alter function public.claim_managed_content_job_event(
  text, text, uuid, uuid, text, text, text, timestamptz, integer
) set search_path = pg_catalog, public;
alter function public.client_respond_managed_approval(
  uuid, text, boolean
) set search_path = pg_catalog, public;
alter function public.consume_content_desk_delegation(
  text, text, uuid, uuid, timestamptz
) set search_path = pg_catalog, public;
alter function public.has_company_access(uuid)
  set search_path = pg_catalog, public;
alter function public.is_admin_of_company(uuid)
  set search_path = pg_catalog, public;
alter function public.is_company_staff(uuid)
  set search_path = pg_catalog, public;
alter function public.is_platform_admin()
  set search_path = pg_catalog, public;
alter function public.is_tenant_admin(uuid)
  set search_path = pg_catalog, public;
alter function public.is_tenant_member(uuid)
  set search_path = pg_catalog, public;
alter function public.respond_managed_approval_with_token(
  text, uuid, text, jsonb, boolean
) set search_path = pg_catalog, public;

-- Service-only claim/replay functions.
revoke all on function public.claim_managed_approval_reminder(
  uuid, text, text, timestamptz, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_managed_approval_reminder(
  uuid, text, text, timestamptz, integer
) to service_role;

revoke all on function public.claim_managed_content_job_event(
  text, text, uuid, uuid, text, text, text, timestamptz, integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_managed_content_job_event(
  text, text, uuid, uuid, text, text, text, timestamptz, integer
) to service_role;

revoke all on function public.consume_content_desk_delegation(
  text, text, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.consume_content_desk_delegation(
  text, text, uuid, uuid, timestamptz
) to service_role;

-- Authenticated approval RPC: its body binds auth.uid() to an active app user,
-- tenant membership, recipient email, and company access.
revoke all on function public.client_respond_managed_approval(
  uuid, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.client_respond_managed_approval(
  uuid, text, boolean
) to authenticated, service_role;

-- RLS predicate helpers are internal to authenticated policies. They remain
-- callable by authenticated so policy evaluation works, but no longer inherit
-- implicit PUBLIC/anon execution.
revoke all on function public.has_company_access(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_company_access(uuid)
  to authenticated, service_role;

revoke all on function public.is_admin_of_company(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_admin_of_company(uuid)
  to authenticated, service_role;

revoke all on function public.is_company_staff(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_company_staff(uuid)
  to authenticated, service_role;

revoke all on function public.is_platform_admin()
  from public, anon, authenticated, service_role;
grant execute on function public.is_platform_admin()
  to authenticated, service_role;

revoke all on function public.is_tenant_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_tenant_admin(uuid)
  to authenticated, service_role;

revoke all on function public.is_tenant_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_tenant_member(uuid)
  to authenticated, service_role;

-- Intentional passwordless token RPC. Keep equivalent public authorization:
-- the function validates the token hash plus company, pending/expiry/superseded
-- state, replay semantics, revision cap, and paid-approval disclosure.
revoke all on function public.respond_managed_approval_with_token(
  text, uuid, text, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.respond_managed_approval_with_token(
  text, uuid, text, jsonb, boolean
) to anon, authenticated, service_role;
