-- Allow field-sales seats to onboard client companies in their tenant.
-- companies_admin_write is owner/admin only; sales_rep is a tenant member.

create or replace function public.is_tenant_sales_rep(tid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from tenant_members m
    join app_users u on u.id = m.user_id
    where m.user_id = (select auth.uid())
      and m.tenant_id = tid
      and m.role_title = 'sales_rep'
      and u.active
  );
$function$;

revoke all on function public.is_tenant_sales_rep(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_tenant_sales_rep(uuid) to authenticated;
grant execute on function public.is_tenant_sales_rep(uuid) to service_role;

comment on function public.is_tenant_sales_rep(uuid) is
  'True when the signed-in user is an active sales_rep member of the tenant.';

-- Insert: sales may create companies they own (created_by = self) in their tenant.
create policy companies_sales_insert on public.companies
  for insert
  to authenticated
  with check (
    public.is_tenant_sales_rep(tenant_id)
    and created_by = (select auth.uid())
  );

-- Select: sales may read companies they created before company_access is granted
-- (insert … returning / immediate follow-up reads).
create policy companies_sales_read_created on public.companies
  for select
  to authenticated
  using (
    public.is_tenant_sales_rep(tenant_id)
    and created_by = (select auth.uid())
  );

-- Update: sales may edit companies they can access (after grantAccess).
create policy companies_sales_update on public.companies
  for update
  to authenticated
  using (
    public.is_tenant_sales_rep(tenant_id)
    and public.has_company_access(id)
  )
  with check (
    public.is_tenant_sales_rep(tenant_id)
    and public.has_company_access(id)
  );
