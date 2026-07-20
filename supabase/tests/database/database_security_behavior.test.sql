begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'security-owner@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'security-other@example.test');

insert into public.app_users (id, email, name, active)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'security-owner@example.test',
    'Security Owner',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'security-other@example.test',
    'Security Other',
    true
  );

insert into public.tenants (id, name)
values
  ('20000000-0000-0000-0000-000000000001', 'Owner tenant'),
  ('20000000-0000-0000-0000-000000000002', 'Other tenant');

insert into public.tenant_members (tenant_id, user_id, role)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'owner'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'owner'
  );

insert into public.companies (id, tenant_id, name)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Approval company'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Wrong company'
  );

insert into public.managed_approval_requests (
  id,
  tenant_id,
  company_id,
  scope,
  recipient_email,
  token_hash,
  status,
  due_at,
  revision_round
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'content',
    'client@example.test',
    'token-valid',
    'pending',
    now() + interval '1 day',
    0
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'content',
    'client@example.test',
    'token-expired',
    'pending',
    now() - interval '1 minute',
    0
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'content',
    'client@example.test',
    'token-successor',
    'pending',
    now() + interval '1 day',
    0
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'content',
    'client@example.test',
    'token-revision-cap',
    'pending',
    now() + interval '1 day',
    2
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'paid_budget_targeting',
    'client@example.test',
    'token-disclosure',
    'pending',
    now() + interval '1 day',
    0
  );

insert into public.managed_approval_requests (
  id,
  tenant_id,
  company_id,
  scope,
  recipient_email,
  token_hash,
  status,
  due_at,
  revision_round,
  superseded_by_id
)
values (
  '40000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'content',
  'client@example.test',
  'token-superseded',
  'pending',
  now() + interval '1 day',
  0,
  '40000000-0000-0000-0000-000000000003'
);

set local role authenticated;
set local "request.jwt.claim.sub" =
  '10000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    update public.tenants
    set name = 'Browser owner overwrite'
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501'
);

select throws_ok(
  $$
    update public.tenants
    set name = 'Cross-tenant overwrite'
    where id = '20000000-0000-0000-0000-000000000002'
  $$,
  '42501'
);

select throws_ok(
  $$
    insert into public.tenants (name)
    values ('Browser-created tenant')
  $$,
  '42501'
);

select throws_ok(
  $$
    delete from public.tenants
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501'
);

reset role;
set local role service_role;

select lives_ok(
  $$
    update public.tenants
    set name = 'Service-managed tenant'
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  'service_role retains the repository tenant update path'
);

reset role;

select results_eq(
  $$
    select name
    from public.tenants
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  array['Service-managed tenant'],
  'the service-role tenant update persisted'
);

set local role anon;

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'not-a-real-token-hash',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'a nonexistent token returns false without enumeration'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-valid',
      '30000000-0000-0000-0000-000000000002',
      'approved',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'a valid token bound to another company returns false'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-expired',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'an expired token cannot approve'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-superseded',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'a superseded token cannot approve'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-revision-cap',
      '30000000-0000-0000-0000-000000000001',
      'changes_requested',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'a token cannot request changes beyond the revision cap'
);

select throws_ok(
  $$
    select public.respond_managed_approval_with_token(
      'token-disclosure',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{}'::jsonb,
      false
    )
  $$,
  'P0001',
  'Direct platform charge disclosure acceptance is required',
  'paid approval requires explicit disclosure acceptance'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-disclosure',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{}'::jsonb,
      true
    )
  $$,
  array[true],
  'paid approval succeeds after disclosure acceptance'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-valid',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{"source":"first"}'::jsonb,
      false
    )
  $$,
  array[true],
  'a valid anonymous token can approve'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-valid',
      '30000000-0000-0000-0000-000000000001',
      'approved',
      '{"source":"replay"}'::jsonb,
      false
    )
  $$,
  array[true],
  'same-decision replay is safely idempotent'
);

select results_eq(
  $$
    select public.respond_managed_approval_with_token(
      'token-valid',
      '30000000-0000-0000-0000-000000000001',
      'changes_requested',
      '{}'::jsonb,
      false
    )
  $$,
  array[false],
  'a conflicting replay is rejected'
);

reset role;

select results_eq(
  $$
    select token_hash, status
    from public.managed_approval_requests
    where token_hash in (
      'token-expired',
      'token-revision-cap',
      'token-superseded',
      'token-valid'
    )
    order by token_hash
  $$,
  $$
    values
      ('token-expired'::text, 'pending'::text),
      ('token-revision-cap'::text, 'pending'::text),
      ('token-superseded'::text, 'pending'::text),
      ('token-valid'::text, 'approved'::text)
  $$,
  'failed decisions are atomic and valid approval changes exactly one row'
);

select ok(
  (
    select status = 'approved'
      and direct_charge_disclosure_accepted_at is not null
    from public.managed_approval_requests
    where token_hash = 'token-disclosure'
  ),
  'disclosure approval records acceptance atomically'
);

select ok(
  (
    select pg_get_functiondef(
      'public.respond_managed_approval_with_token(text,uuid,text,jsonb,boolean)'::regprocedure
    ) ~* 'for[[:space:]]+update'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.managed_approval_requests'::regclass
      and conname = 'managed_approval_requests_token_hash_key'
      and contype = 'u'
  ),
  'token uniqueness plus row locking serializes concurrent decisions'
);

select * from finish();
rollback;
