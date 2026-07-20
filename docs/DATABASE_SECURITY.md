# Database security controls

## 2026-07-19 RLS init-plan optimization

Migration `20260719111346_optimize_rls_auth_initplans.sql` is intentionally
unapplied. It changes only these advisor-approved rule/object pairs:

- `public.tenant_members` / `members_read`
- `public.app_users` / `app_users_read`
- `public.company_access` / `access_read`
- `public.terms_acceptances` / `terms_acceptances_own`
- `public.marketing_workflows` / `marketing_workflows_rw`
- `public.managed_approval_requests` /
  `managed_approval_requests_client_read`

Each `ALTER POLICY` replaces direct `auth.uid()` evaluation with
`(select auth.uid())`. Commands, permissiveness, role targets, `USING` versus
`WITH CHECK`, ownership/admin/membership branches, recipient matching, and
tenant/company boundaries are unchanged. No policy is dropped or split.

### Validation and advisor expectation

`supabase/tests/database/rls_initplan_catalog.test.sql` verifies the exact
six-policy catalog inventory, metadata, predicate branches, and scalar
subqueries. `rls_initplan_behavior.test.sql` verifies authorized self,
same-tenant, company-admin, company-recipient, agency-template, and company
workflow access while denying cross-tenant rows and writes.
`rls_initplan_advisor_expectations.test.sql` verifies that the exact six
`0003_auth_rls_initplan` targets have no residual direct session calls.
`npm run test:rls-initplans` statically verifies the migration's exact six
policy/table targets, scalar subqueries, test plans, and rollback documentation.

Full validation requires a disposable Supabase/PostgreSQL 17 project with every
active migration replayed in timestamp order. Capture advisor JSON before and
after the target migration, then run the executable delta gate:

```text
npx --yes supabase@2.109.1 db reset --db-url <disposable-url> --version 20260719070000 --no-seed
npx --yes supabase@2.109.1 db advisors --db-url <disposable-url> --type all --level warn --fail-on none --output-format json > before.json
npx --yes supabase@2.109.1 db reset --db-url <disposable-url> --version 20260719111346 --no-seed
npx --yes supabase@2.109.1 test db supabase/tests/database --db-url <disposable-url>
npx --yes supabase@2.109.1 db advisors --db-url <disposable-url> --type all --level warn --fail-on none --output-format json > after.json
npm run test:rls-initplans:advisors -- before.json after.json
```

The advisor gate is that the six `0003_auth_rls_initplan` rule/object pairs
disappear, total warning count moves from the refreshed 135 baseline to 129,
and no new rule/object pair appears. The comparator treats every other finding
as an exact multiset, proving the 120 deferred overlap findings and accepted
function findings are unchanged. Keep the disposable URL and JSON evidence out
of Git and terminal output. Never use staging or `--linked` for this validation.

Fresh disposable projects can report fewer overlap/function findings because
their Supabase-managed role inventory differs from staging. For that secondary
gate, set `RLS_ADVISOR_EXPECTED_BEFORE` to the independently verified disposable
baseline; the comparator still requires an exact six-finding reduction and an
unchanged multiset for every non-target finding.

The 19 July 2026 PostgreSQL 17 disposable validation replayed all five active
migrations, passed all five pgTAP files and both concurrency suites, and
produced an exact 107 → 101 disposable advisor delta with zero errors and no
non-target change. A separate read-only staging refresh confirmed the
authoritative 135 baseline contains exactly the six approved targets, yielding
the executable 135 → 129 projection. The disposable project was then deleted
and staging remained linked and unapplied.

### Rollback

Rollback in a new reviewed migration by restoring only the six pre-migration
predicates below. This removes only the scalar `select auth.uid()` wrappers; it
must not recreate policies, change roles, alter functions, or reset migration
history. Run the rollback as one transaction during a reviewed low-traffic
window. Set a transaction-local lock timeout before the first `ALTER POLICY`;
if any lock cannot be acquired, let the entire transaction fail and roll back.
Do not increase the timeout while traffic is active.

```sql
begin;

set local lock_timeout = '5s';

alter policy members_read on public.tenant_members
using (user_id = auth.uid() or is_tenant_member(tenant_id));

alter policy app_users_read on public.app_users
using (
  id = auth.uid()
  or is_platform_admin()
  or exists (
    select 1
    from public.tenant_members as mine
    join public.tenant_members as theirs
      on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid()
      and theirs.user_id = app_users.id
  )
);

alter policy access_read on public.company_access
using (user_id = auth.uid() or is_admin_of_company(company_id));

alter policy terms_acceptances_own on public.terms_acceptances
using (user_id = auth.uid());

alter policy marketing_workflows_rw on public.marketing_workflows
using (
  (
    is_agency_template
    and tenant_id in (
      select tenant_members.tenant_id
      from public.tenant_members
      where tenant_members.user_id = auth.uid()
    )
  )
  or (company_id is not null and has_company_access(company_id))
)
with check (
  (
    is_agency_template
    and tenant_id in (
      select tenant_members.tenant_id
      from public.tenant_members
      where tenant_members.user_id = auth.uid()
    )
  )
  or (company_id is not null and has_company_access(company_id))
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
      where u.id = auth.uid()
        and u.active
    )
  )
);

commit;
```

### Explicitly deferred and accepted findings

The 120 policy-overlap findings remain deferred because safely replacing
`FOR ALL` policies requires separate role/action and null/global-row behavior
matrices. This migration does not alter any policy in those cohorts beyond the
six init-plan expressions above.

The seven authenticated-only functions in the refreshed plan remain accepted:
the approval RPC and six RLS helpers are required signed-in interfaces with
pinned trusted search paths and caller-bound authorization. This migration
does not alter function definitions, ownership, search paths, or grants. The
anonymous token approval RPC and its two accepted grant warnings are also out
of scope.

## 2026-07-19 focused remediation

Migration `20260719063533_remediate_database_security.sql` addresses the
material findings from the read-only staging advisor audit without changing
the canonical baseline or replay-ledger history.

### Tenant write model

- Tenant creation and deletion are service operations. `anon` and
  `authenticated` have no direct table- or column-level `INSERT` privilege,
  and no direct `DELETE` privilege, on `public.tenants`.
- Neither browser role has table- or column-level tenant `UPDATE` privilege.
  Tenant columns include service-controlled billing, plan, status, onboarding,
  and branding state, so no browser update subset is retained without a proven
  application requirement.
- `anon` has no tenant table or column privileges. `authenticated` retains only
  `SELECT`; baseline `REFERENCES` and `TRIGGER` privileges are also removed.
- `tenants_owner_write` remains as defense in depth for any future reviewed
  column grant. It applies active-owner membership to both the old row
  (`USING`) and resulting row (`WITH CHECK`), but is currently unreachable
  because `authenticated` has no effective `UPDATE`.
- Application repository tenant create, update, and delete operations use the
  service-role client.

### SECURITY DEFINER inventory

All eleven inventoried functions pin `search_path = pg_catalog, public`.
The remediation explicitly revokes `CREATE ON SCHEMA public` from `PUBLIC`,
`anon`, and `authenticated`, and tests both direct `PUBLIC` ACLs and effective
browser-role privileges.

- Service only: `claim_managed_approval_reminder`,
  `claim_managed_content_job_event`, and
  `consume_content_desk_delegation`. Only `service_role` receives `EXECUTE`.
- Authenticated RPC: `client_respond_managed_approval`. Its existing body binds
  `auth.uid()` to an active app user, tenant membership, recipient email, and
  company access. Only `authenticated` and `service_role` receive `EXECUTE`.
- Auth-bound RLS helpers: `has_company_access`, `is_admin_of_company`,
  `is_company_staff`, `is_platform_admin`, `is_tenant_admin`, and
  `is_tenant_member`. They retain explicit `authenticated` and `service_role`
  execution so authenticated RLS policies continue to work. Implicit `PUBLIC`
  and `anon` execution is revoked.
- Intentional passwordless RPC: `respond_managed_approval_with_token` remains
  executable by `anon`, `authenticated`, and `service_role`. Removing anonymous
  execution would break the public approval link. Its authorization contract
  remains token-hash plus company binding, pending/expiry/superseded checks,
  idempotent same-decision replay, revision limits, and paid-approval
  disclosure checks. Invalid token/company input returns `false`.

No policy or definer authorization in this remediation uses user-editable
`user_metadata` or deprecated `auth.role()`.

### Tests

- `supabase/tests/database/database_security_catalog.test.sql` checks the policy
  definition, table and column privileges, schema `CREATE`, the complete
  11-signature × 4-role effective function ACL matrix, and pinned search paths.
- `supabase/tests/database/database_security_behavior.test.sql` checks the
  denial of all browser tenant writes, the service-role repository path, and
  anonymous approval-token validity, company binding, expiry, supersession,
  revision cap, disclosure, idempotent replay, conflicting replay, and
  row-lock/uniqueness atomicity contracts.
- `scripts/database-security-concurrency.integration.ts` provides the real
  two-session serialization check described below.
- `npm run test:database-security` provides an offline structural check when a
  local Supabase stack is unavailable, including assertions that the
  concurrency harness retains its safety controls.

Run the full database suite only against a disposable local stack:

```text
npx supabase start
npx supabase test db supabase/tests/database --local
npm run test:database-security:concurrency
npx supabase db advisors --local
```

Never substitute `--linked` for `--local` during routine development.

### Two-session token concurrency test

Set `DATABASE_SECURITY_TEST_URL` to a session-capable direct PostgreSQL
connection for a disposable Supabase/PostgreSQL 17 database after all three
active migrations have replayed. Do not print or place the URL in command
arguments, shell history, test output, or committed files. The harness accepts
loopback hosts by default. A non-loopback disposable database additionally
requires `ALLOW_DISPOSABLE_DATABASE_SECURITY_TESTS=true`; never set that opt-in
for staging or production.

The harness opens three sessions:

1. An observer session creates UUID-randomized tenant, company, and approval
   fixtures in a bounded setup transaction.
2. Two separate transactions each `SET LOCAL ROLE anon` and invoke
   `respond_managed_approval_with_token`.
3. The first session holds the request row lock. The observer verifies through
   `pg_stat_activity` that the second session is genuinely waiting on a
   PostgreSQL lock before allowing the first commit.

It runs two cases. Identical `approved` decisions serialize to `true`/`true`,
with the replay leaving the first payload untouched. An `approved` decision
racing `changes_requested` serializes to `true`/`false`, with the deterministic
loser making no status, revision, or payload change. Session-level and
transaction-local statement/lock timeouts bound hangs. `finally` rolls back any
open decision transaction and deletes the fixture tenant (cascading all child
fixtures) in an explicit cleanup transaction. Test output contains no
connection string or credentials.

The migration sets transaction-local `lock_timeout = '5s'` before replacing
the tenant policy. If the policy DDL cannot acquire its lock, allow the
migration transaction to fail and roll back; do not increase the timeout while
traffic is active. Investigate long transactions and retry the complete
migration during a reviewed low-traffic window.

## Advisor baseline expectations

After local replay and migration:

- `tenants_owner_write` must not report an unconstrained `WITH CHECK`.
- `anon` and `authenticated` must have no effective tenant write privilege at
  table or column level; `service_role` retains the repository write path.
- `PUBLIC`, `anon`, and `authenticated` must have no effective
  `CREATE ON SCHEMA public`.
- The six auth-bound helpers must not have implicit `PUBLIC` or `anon`
  execution.
- The three service-only functions must expose only `service_role`.
- The authenticated approval RPC must expose only `authenticated` and
  `service_role`.
- The anonymous token RPC remains an intentional, tested public exception and
  may remain visible to grant-oriented advisor inventory.
- The five no-policy service tables documented by the audit remain intentional:
  RLS is enabled and browser table privileges are denied.
- Existing performance findings are not part of this focused remediation and
  should not be treated as regressions unless their rule/object pair is new.
- The leaked-password warning remains expected until the dashboard action
  below is completed and independently verified.

Remote application remains blocked until the baseline, replay-ledger, and
security successor migration replay successfully in a disposable Supabase
stack and both pgTAP files plus local advisors pass.

## Manual leaked-password protection step

This is a hosted Supabase Auth setting, not SQL. For the staging project, open
Supabase Dashboard, then go to **Authentication → Sign In / Providers → Email**,
enable **Prevent use of leaked passwords**, and save. The setting uses the
HaveIBeenPwned Pwned Passwords service and requires the Pro plan or the
corresponding project entitlement.

After enabling it, verify in staging with a controlled sign-up or password
change using a known-leaked test password and confirm Supabase returns the
expected weak-password response. Do not test with a real user's credentials.
