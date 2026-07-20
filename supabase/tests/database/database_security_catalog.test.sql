begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

create temporary table expected_security_definer_acl (
  oid regprocedure primary key,
  public_execute boolean not null,
  anon_execute boolean not null,
  authenticated_execute boolean not null,
  service_role_execute boolean not null
) on commit drop;

insert into expected_security_definer_acl values
  (
    'public.claim_managed_approval_reminder(uuid,text,text,timestamp with time zone,integer)',
    false, false, false, true
  ),
  (
    'public.claim_managed_content_job_event(text,text,uuid,uuid,text,text,text,timestamp with time zone,integer)',
    false, false, false, true
  ),
  (
    'public.client_respond_managed_approval(uuid,text,boolean)',
    false, false, true, true
  ),
  (
    'public.consume_content_desk_delegation(text,text,uuid,uuid,timestamp with time zone)',
    false, false, false, true
  ),
  (
    'public.has_company_access(uuid)',
    false, false, true, true
  ),
  (
    'public.is_admin_of_company(uuid)',
    false, false, true, true
  ),
  (
    'public.is_company_staff(uuid)',
    false, false, true, true
  ),
  (
    'public.is_platform_admin()',
    false, false, true, true
  ),
  (
    'public.is_tenant_admin(uuid)',
    false, false, true, true
  ),
  (
    'public.is_tenant_member(uuid)',
    false, false, true, true
  ),
  (
    'public.respond_managed_approval_with_token(text,uuid,text,jsonb,boolean)',
    false, true, true, true
  );

select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_write'
  ),
  'UPDATE',
  'tenants_owner_write remains update-only defense in depth'
);

select is(
  (
    select roles::text[]
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_write'
  ),
  array['authenticated'],
  'tenant owner policy targets authenticated explicitly'
);

select ok(
  (
    select qual is not null
      and with_check is not null
      and qual like '%membership.role = ''owner''%'
      and with_check like '%membership.role = ''owner''%'
      and qual like '%actor.active%'
      and with_check like '%actor.active%'
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_write'
  ),
  'tenant policy constrains old and resulting rows'
);

select ok(
  (
    select coalesce(qual, '') !~ 'auth[.]role|user_metadata'
      and coalesce(with_check, '') !~ 'auth[.]role|user_metadata'
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_write'
  ),
  'tenant policy avoids deprecated or user-editable authorization claims'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.tenants',
    'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER'
  ),
  'anon has no tenant table privileges'
);

select ok(
  has_table_privilege('authenticated', 'public.tenants', 'SELECT')
  and not has_table_privilege(
    'authenticated',
    'public.tenants',
    'INSERT,REFERENCES,TRIGGER'
  ),
  'authenticated retains only tenant table read access'
);

select ok(
  not has_table_privilege('authenticated', 'public.tenants', 'DELETE'),
  'authenticated cannot delete tenants directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.tenants', 'UPDATE'),
  'authenticated cannot update tenants directly'
);

select ok(
  (
    select bool_and(
      not has_column_privilege('anon', 'public.tenants', column_name, 'INSERT')
      and not has_column_privilege(
        'anon',
        'public.tenants',
        column_name,
        'SELECT'
      )
      and not has_column_privilege(
        'anon',
        'public.tenants',
        column_name,
        'REFERENCES'
      )
    )
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
  ),
  'anon has no tenant column privileges'
);

select ok(
  (
    select bool_and(
      not has_column_privilege('anon', 'public.tenants', column_name, 'UPDATE')
    )
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
  ),
  'anon has no tenant column update privileges'
);

select ok(
  (
    select bool_and(
      not has_column_privilege(
        'authenticated',
        'public.tenants',
        column_name,
        'INSERT'
      )
      and not has_column_privilege(
        'authenticated',
        'public.tenants',
        column_name,
        'REFERENCES'
      )
    )
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
  ),
  'authenticated has no tenant column insert or references privileges'
);

select ok(
  (
    select bool_and(
      not has_column_privilege(
        'authenticated',
        'public.tenants',
        column_name,
        'UPDATE'
      )
    )
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenants'
  ),
  'authenticated has no tenant column update privileges'
);

select ok(
  has_table_privilege('service_role', 'public.tenants', 'INSERT,UPDATE,DELETE'),
  'service_role retains tenant lifecycle privileges'
);

select is(
  (
    select count(*)
    from pg_namespace
    cross join lateral aclexplode(
      coalesce(nspacl, acldefault('n', nspowner))
    ) as privilege
    where nspname = 'public'
      and privilege.grantee = 0
      and privilege.privilege_type = 'CREATE'
  ),
  0::bigint,
  'PUBLIC has no direct CREATE grant on public schema'
);

select ok(
  not has_schema_privilege('anon', 'public', 'CREATE'),
  'anon has no effective CREATE privilege on public schema'
);

select ok(
  not has_schema_privilege('authenticated', 'public', 'CREATE'),
  'authenticated has no effective CREATE privilege on public schema'
);

select is(
  (select count(*) from expected_security_definer_acl),
  11::bigint,
  'the ACL matrix covers all eleven audited function signatures'
);

select is(
  (
    select count(*)
    from expected_security_definer_acl as expected
    join pg_proc on pg_proc.oid = expected.oid
    where not pg_proc.prosecdef
  ),
  0::bigint,
  'every inventoried function remains SECURITY DEFINER'
);

with actual as (
  select
    expected.*,
    exists (
      select 1
      from pg_proc
      cross join lateral aclexplode(
        coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))
      ) as privilege
      where pg_proc.oid = expected.oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) as actual_public_execute,
    has_function_privilege('anon', expected.oid, 'EXECUTE')
      as actual_anon_execute,
    has_function_privilege('authenticated', expected.oid, 'EXECUTE')
      as actual_authenticated_execute,
    has_function_privilege('service_role', expected.oid, 'EXECUTE')
      as actual_service_role_execute
  from expected_security_definer_acl as expected
)
select is(
  (
    select count(*)
    from actual
    where actual_public_execute <> public_execute
      or actual_anon_execute <> anon_execute
      or actual_authenticated_execute <> authenticated_execute
      or actual_service_role_execute <> service_role_execute
  ),
  0::bigint,
  'all function signatures match the complete effective role ACL matrix'
);

select is(
  (
    select count(*)
    from expected_security_definer_acl as expected
    join pg_proc on pg_proc.oid = expected.oid
    where not (
      'search_path=pg_catalog, public'
      = any(coalesce(pg_proc.proconfig, array[]::text[]))
    )
  ),
  0::bigint,
  'all inventoried definer functions pin the trusted search path'
);

select * from finish();
rollback;
