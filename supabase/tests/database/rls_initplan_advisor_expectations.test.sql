begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

create temporary table expected_resolved_initplan_findings (
  tablename text not null,
  policyname text not null,
  primary key (tablename, policyname)
) on commit drop;

insert into expected_resolved_initplan_findings values
  ('tenant_members', 'members_read'),
  ('app_users', 'app_users_read'),
  ('company_access', 'access_read'),
  ('terms_acceptances', 'terms_acceptances_own'),
  ('marketing_workflows', 'marketing_workflows_rw'),
  (
    'managed_approval_requests',
    'managed_approval_requests_client_read'
  );

select is(
  (
    select count(*)
    from expected_resolved_initplan_findings as expected
    join pg_policies as actual
      on actual.schemaname = 'public'
      and actual.tablename = expected.tablename
      and actual.policyname = expected.policyname
  ),
  6::bigint,
  'advisor expectation covers the exact six approved rule-object pairs'
);

select is(
  (
    select count(*)
    from expected_resolved_initplan_findings as expected
    join pg_policies as actual
      on actual.schemaname = 'public'
      and actual.tablename = expected.tablename
      and actual.policyname = expected.policyname
    where concat_ws(' ', actual.qual, actual.with_check)
      !~* 'select[[:space:]]+auth[.]uid[(][)]'
  ),
  0::bigint,
  'all six policies now expose scalar auth init plans to the advisor'
);

select is(
  (
    select count(*)
    from expected_resolved_initplan_findings as expected
    join pg_policies as actual
      on actual.schemaname = 'public'
      and actual.tablename = expected.tablename
      and actual.policyname = expected.policyname
    where regexp_replace(
      lower(concat_ws(' ', actual.qual, actual.with_check)),
      'select[[:space:]]+auth[.]uid[(][)]([[:space:]]+as[[:space:]]+uid)?',
      '',
      'g'
    ) ~ 'auth[.]uid'
  ),
  0::bigint,
  'the six 0003_auth_rls_initplan warnings have no residual direct calls'
);

select * from finish();
rollback;
