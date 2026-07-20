-- Optimize only the six advisor-classified auth RLS init-plan findings.
-- ALTER POLICY preserves each policy's command, permissiveness, role list,
-- and predicates; only auth.uid() evaluation moves to scalar subqueries.
set local lock_timeout = '5s';

alter policy members_read
on public.tenant_members
using (
  user_id = (select auth.uid())
  or is_tenant_member(tenant_id)
);

alter policy app_users_read
on public.app_users
using (
  id = (select auth.uid())
  or is_platform_admin()
  or exists (
    select 1
    from public.tenant_members as mine
    join public.tenant_members as theirs
      on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = app_users.id
  )
);

alter policy access_read
on public.company_access
using (
  user_id = (select auth.uid())
  or is_admin_of_company(company_id)
);

alter policy terms_acceptances_own
on public.terms_acceptances
using (user_id = (select auth.uid()));

alter policy marketing_workflows_rw
on public.marketing_workflows
using (
  (
    is_agency_template
    and tenant_id in (
      select tenant_members.tenant_id
      from public.tenant_members
      where tenant_members.user_id = (select auth.uid())
    )
  )
  or (
    company_id is not null
    and has_company_access(company_id)
  )
)
with check (
  (
    is_agency_template
    and tenant_id in (
      select tenant_members.tenant_id
      from public.tenant_members
      where tenant_members.user_id = (select auth.uid())
    )
  )
  or (
    company_id is not null
    and has_company_access(company_id)
  )
);

alter policy managed_approval_requests_client_read
on public.managed_approval_requests
using (
  has_company_access(company_id)
  and (
    is_company_staff(company_id)
    or recipient_email = (
      select u.email
      from public.app_users as u
      where u.id = (select auth.uid())
        and u.active
    )
  )
);
