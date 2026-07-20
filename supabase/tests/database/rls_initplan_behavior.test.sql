begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'initplan-owner@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'initplan-client@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'initplan-other@example.test');

insert into public.app_users (id, email, name, active)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'initplan-owner@example.test',
    'Init-plan owner',
    true
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'initplan-client@example.test',
    'Init-plan client',
    true
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'initplan-other@example.test',
    'Init-plan other tenant owner',
    true
  );

insert into public.tenants (id, name)
values
  ('60000000-0000-0000-0000-000000000001', 'Init-plan tenant'),
  ('60000000-0000-0000-0000-000000000002', 'Init-plan other tenant');

insert into public.tenant_members (
  tenant_id,
  user_id,
  role,
  portal_only
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    'owner',
    false
  ),
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    'member',
    true
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000003',
    'owner',
    false
  );

insert into public.companies (id, tenant_id, name)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'Init-plan company'
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002',
    'Init-plan other company'
  );

insert into public.company_access (user_id, company_id)
values
  (
    '50000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000002'
  );

insert into public.terms_acceptances (
  id,
  user_id,
  tenant_id,
  version
)
values
  (
    '80000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    1
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    1
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000002',
    1
  );

insert into public.marketing_workflows (
  id,
  tenant_id,
  company_id,
  name,
  is_agency_template,
  created_by
)
values
  (
    '90000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    null,
    'Own tenant template',
    true,
    '50000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'Own company workflow',
    false,
    '50000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    '60000000-0000-0000-0000-000000000002',
    null,
    'Other tenant template',
    true,
    '50000000-0000-0000-0000-000000000003'
  ),
  (
    '90000000-0000-0000-0000-000000000004',
    '60000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'Other company workflow',
    false,
    '50000000-0000-0000-0000-000000000003'
  ),
  (
    '90000000-0000-0000-0000-000000000005',
    '60000000-0000-0000-0000-000000000001',
    null,
    'Non-template without company',
    false,
    '50000000-0000-0000-0000-000000000001'
  );

insert into public.managed_approval_requests (
  id,
  tenant_id,
  company_id,
  scope,
  recipient_email,
  token_hash,
  due_at
)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    'content',
    'initplan-client@example.test',
    'initplan-token-own',
    now() + interval '1 day'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    'content',
    'initplan-other@example.test',
    'initplan-token-other',
    now() + interval '1 day'
  );

set local role authenticated;
set local "request.jwt.claim.sub" =
  '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select user_id::text
    from public.tenant_members
    order by user_id
  $$,
  array[
    '50000000-0000-0000-0000-000000000001'::text,
    '50000000-0000-0000-0000-000000000002'::text
  ],
  'members_read preserves same-tenant access and denies cross-tenant rows'
);

select results_eq(
  $$
    select id::text
    from public.app_users
    order by id
  $$,
  array[
    '50000000-0000-0000-0000-000000000001'::text,
    '50000000-0000-0000-0000-000000000002'::text
  ],
  'app_users_read preserves self and same-tenant access without tenant escape'
);

select results_eq(
  $$
    select company_id::text
    from public.company_access
    order by company_id
  $$,
  array['70000000-0000-0000-0000-000000000001'::text],
  'access_read preserves company-admin access and denies another tenant'
);

select results_eq(
  $$
    select id::text
    from public.terms_acceptances
    order by id
  $$,
  array['80000000-0000-0000-0000-000000000001'::text],
  'terms_acceptances_own preserves ownership and denies other users'
);

select results_eq(
  $$
    select id::text
    from public.marketing_workflows
    order by id
  $$,
  array[
    '90000000-0000-0000-0000-000000000001'::text,
    '90000000-0000-0000-0000-000000000002'::text
  ],
  'marketing_workflows_rw preserves tenant-template and company access only'
);

select results_eq(
  $$
    select id::text
    from public.managed_approval_requests
    order by id
  $$,
  array['a0000000-0000-0000-0000-000000000001'::text],
  'managed approval staff access remains company-bound'
);

select lives_ok(
  $$
    insert into public.marketing_workflows (
      tenant_id,
      name,
      is_agency_template,
      created_by
    )
    values (
      '60000000-0000-0000-0000-000000000001',
      'Authorized init-plan insert',
      true,
      '50000000-0000-0000-0000-000000000001'
    )
  $$,
  'marketing workflow WITH CHECK still allows an authorized tenant template'
);

select throws_ok(
  $$
    insert into public.marketing_workflows (
      tenant_id,
      name,
      is_agency_template,
      created_by
    )
    values (
      '60000000-0000-0000-0000-000000000002',
      'Denied cross-tenant init-plan insert',
      true,
      '50000000-0000-0000-0000-000000000001'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "marketing_workflows"',
  'marketing workflow WITH CHECK still denies a cross-tenant template'
);

set local "request.jwt.claim.sub" =
  '50000000-0000-0000-0000-000000000002';

select results_eq(
  $$
    select company_id::text
    from public.company_access
    order by company_id
  $$,
  array['70000000-0000-0000-0000-000000000001'::text],
  'access_read preserves the direct self-access branch'
);

select results_eq(
  $$
    select id::text
    from public.managed_approval_requests
    order by id
  $$,
  array['a0000000-0000-0000-0000-000000000001'::text],
  'managed approval recipient access remains active-user and company-bound'
);

select results_eq(
  $$
    select id::text
    from public.terms_acceptances
    order by id
  $$,
  array['80000000-0000-0000-0000-000000000002'::text],
  'terms acceptance ownership follows the current authenticated user'
);

set local "request.jwt.claim.sub" =
  '50000000-0000-0000-0000-000000000003';

select results_eq(
  $$
    select id::text
    from public.marketing_workflows
    order by id
  $$,
  array[
    '90000000-0000-0000-0000-000000000003'::text,
    '90000000-0000-0000-0000-000000000004'::text
  ],
  'the other tenant sees only its own template and company workflow'
);

reset role;

set local role anon;

select throws_ok(
  $$
    select user_id
    from public.tenant_members
  $$,
  '42501',
  'permission denied for function is_tenant_member',
  'anonymous callers cannot execute authenticated RLS helpers'
);

select results_eq(
  $$
    select id::text
    from public.managed_approval_requests
    order by id
  $$,
  array[]::text[],
  'anonymous callers see no authenticated-only approval rows'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '';

select results_eq(
  $$
    select user_id::text
    from public.tenant_members
    order by user_id
  $$,
  array[]::text[],
  'an authenticated role with a null subject sees no tenant memberships'
);

select results_eq(
  $$
    select id::text
    from public.marketing_workflows
    order by id
  $$,
  array[]::text[],
  'an authenticated role with a null subject sees no workflows'
);

reset role;

update public.app_users
set active = false
where id = '50000000-0000-0000-0000-000000000002';

set local role authenticated;
set local "request.jwt.claim.sub" =
  '50000000-0000-0000-0000-000000000002';

select results_eq(
  $$
    select id::text
    from public.app_users
    order by id
  $$,
  array['50000000-0000-0000-0000-000000000002'::text],
  'app_users_read preserves existing direct-self inactive behavior'
);

select results_eq(
  $$
    select id::text
    from public.managed_approval_requests
    order by id
  $$,
  array[]::text[],
  'inactive recipients cannot read managed approval requests'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" =
  '50000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    with changed as (
      update public.marketing_workflows
      set name = 'Authorized init-plan update'
      where id = '90000000-0000-0000-0000-000000000001'
      returning id::text
    )
    select id from changed
  $$,
  array['90000000-0000-0000-0000-000000000001'::text],
  'authorized tenant workflow updates still pass USING and WITH CHECK'
);

select results_eq(
  $$
    with changed as (
      update public.marketing_workflows
      set name = 'Denied cross-tenant update'
      where id = '90000000-0000-0000-0000-000000000003'
      returning id::text
    )
    select id from changed
  $$,
  array[]::text[],
  'cross-tenant workflow updates remain invisible and denied'
);

select results_eq(
  $$
    with removed as (
      delete from public.marketing_workflows
      where id = '90000000-0000-0000-0000-000000000002'
      returning id::text
    )
    select id from removed
  $$,
  array['90000000-0000-0000-0000-000000000002'::text],
  'authorized company workflow deletes remain allowed'
);

select results_eq(
  $$
    with removed as (
      delete from public.marketing_workflows
      where id = '90000000-0000-0000-0000-000000000004'
      returning id::text
    )
    select id from removed
  $$,
  array[]::text[],
  'cross-tenant workflow deletes remain invisible and denied'
);

select results_eq(
  $$
    select id::text
    from public.marketing_workflows
    where id = '90000000-0000-0000-0000-000000000005'
  $$,
  array[]::text[],
  'a null-company non-template workflow remains inaccessible'
);

reset role;

select * from finish();
rollback;
