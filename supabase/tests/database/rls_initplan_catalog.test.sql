begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

create temporary table expected_initplan_policies (
  schemaname text not null,
  tablename text not null,
  policyname text not null,
  cmd text not null,
  roles text[] not null,
  has_with_check boolean not null,
  expected_qual text not null,
  expected_with_check text,
  primary key (schemaname, tablename, policyname)
) on commit drop;

insert into expected_initplan_policies values
  (
    'public',
    'tenant_members',
    'members_read',
    'SELECT',
    array['public'],
    false,
    '((user_id=(selectauth.uid()))oris_tenant_member(tenant_id))',
    null
  ),
  (
    'public',
    'app_users',
    'app_users_read',
    'SELECT',
    array['public'],
    false,
    '((id=(selectauth.uid()))oris_platform_admin()or(exists(select1from'
      || '(tenant_membersminejointenant_memberstheirson'
      || '((theirs.tenant_id=mine.tenant_id)))where'
      || '((mine.user_id=(selectauth.uid()))and'
      || '(theirs.user_id=app_users.id)))))',
    null
  ),
  (
    'public',
    'company_access',
    'access_read',
    'SELECT',
    array['public'],
    false,
    '((user_id=(selectauth.uid()))oris_admin_of_company(company_id))',
    null
  ),
  (
    'public',
    'terms_acceptances',
    'terms_acceptances_own',
    'SELECT',
    array['public'],
    false,
    '(user_id=(selectauth.uid()))',
    null
  ),
  (
    'public',
    'marketing_workflows',
    'marketing_workflows_rw',
    'ALL',
    array['public'],
    true,
    '((is_agency_templateand(tenant_idin(selecttenant_members.tenant_id'
      || 'fromtenant_memberswhere'
      || '(tenant_members.user_id=(selectauth.uid())))))or'
      || '((company_idisnotnull)andhas_company_access(company_id)))',
    '((is_agency_templateand(tenant_idin(selecttenant_members.tenant_id'
      || 'fromtenant_memberswhere'
      || '(tenant_members.user_id=(selectauth.uid())))))or'
      || '((company_idisnotnull)andhas_company_access(company_id)))'
  ),
  (
    'public',
    'managed_approval_requests',
    'managed_approval_requests_client_read',
    'SELECT',
    array['authenticated'],
    false,
    '(has_company_access(company_id)and'
      || '(is_company_staff(company_id)or'
      || '(recipient_email=(selectu.emailfromapp_usersuwhere'
      || '((u.id=(selectauth.uid()))andu.active)))))',
    null
  );

select is(
  (select count(*) from expected_initplan_policies),
  6::bigint,
  'the expectation set contains exactly the six approved policies'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
  ),
  6::bigint,
  'all six approved policies exist'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
    where actual.permissive <> 'PERMISSIVE'
      or actual.cmd <> expected.cmd
      or actual.roles::text[] <> expected.roles
  ),
  0::bigint,
  'commands, permissiveness, and role targets are unchanged'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
    where (actual.with_check is not null) <> expected.has_with_check
  ),
  0::bigint,
  'USING and WITH CHECK placement remains unchanged'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
    where concat_ws(' ', actual.qual, actual.with_check)
      !~* 'select[[:space:]]+auth[.]uid[(][)]'
  ),
  0::bigint,
  'every approved policy evaluates auth.uid through a scalar subquery'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
    where regexp_replace(
      lower(concat_ws(' ', actual.qual, actual.with_check)),
      'select[[:space:]]+auth[.]uid[(][)]([[:space:]]+as[[:space:]]+uid)?',
      '',
      'g'
    ) ~ 'auth[.]uid'
  ),
  0::bigint,
  'the six advisor targets contain no remaining per-row auth.uid calls'
);

select is(
  (
    select count(*)
    from expected_initplan_policies as expected
    join pg_policies as actual using (schemaname, tablename, policyname)
    where regexp_replace(
      regexp_replace(lower(actual.qual), '[[:space:]]+', '', 'g'),
      'asuid',
      '',
      'g'
    ) <> expected.expected_qual
      or (
        expected.has_with_check
        and regexp_replace(
          regexp_replace(
            lower(actual.with_check),
            '[[:space:]]+',
            '',
            'g'
          ),
          'asuid',
          '',
          'g'
        ) <> expected.expected_with_check
      )
  ),
  0::bigint,
  'normalized USING and WITH CHECK predicates exactly match the approved forms'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'tenant_members' and policyname = 'members_read')
        or (tablename = 'app_users' and policyname = 'app_users_read')
        or (tablename = 'company_access' and policyname = 'access_read')
        or (
          tablename = 'terms_acceptances'
          and policyname = 'terms_acceptances_own'
        )
        or (
          tablename = 'marketing_workflows'
          and policyname = 'marketing_workflows_rw'
        )
        or (
          tablename = 'managed_approval_requests'
          and policyname = 'managed_approval_requests_client_read'
        )
      )
  ),
  6::bigint,
  'advisor expectation is limited to the exact six rule-object pairs'
);

select * from finish();
rollback;
