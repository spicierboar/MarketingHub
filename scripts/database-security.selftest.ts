import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migration = readProjectFile(
  "../supabase/migrations/20260719063533_remediate_database_security.sql",
);
const catalogTest = readProjectFile(
  "../supabase/tests/database/database_security_catalog.test.sql",
);
const behaviorTest = readProjectFile(
  "../supabase/tests/database/database_security_behavior.test.sql",
);
const concurrencyTest = readProjectFile(
  "./database-security-concurrency.integration.ts",
);

assert.match(
  migration,
  /create policy tenants_owner_write[\s\S]*for update[\s\S]*to authenticated/i,
);
assert.match(
  migration,
  /using \([\s\S]*membership\.role = 'owner'[\s\S]*actor\.active[\s\S]*\)[\s\S]*with check \([\s\S]*membership\.role = 'owner'[\s\S]*actor\.active/i,
);
assert.doesNotMatch(migration, /auth\.role|user_metadata/i);
assert.match(
  migration,
  /revoke all privileges on table public\.tenants from anon, authenticated/i,
);
assert.match(
  migration,
  /grant select on table public\.tenants to authenticated/i,
);
assert.match(
  migration,
  /revoke insert \([\s\S]*\) on table public\.tenants from anon, authenticated/i,
);
assert.match(
  migration,
  /revoke update \([\s\S]*\) on table public\.tenants from anon, authenticated/i,
);
assert.match(
  migration,
  /revoke references \([\s\S]*\) on table public\.tenants from anon, authenticated/i,
);
assert.match(
  migration,
  /revoke select \([\s\S]*\) on table public\.tenants from anon/i,
);
assert.match(
  migration,
  /set local lock_timeout = '5s'/i,
);
assert.match(
  migration,
  /revoke create on schema public from public, anon, authenticated/i,
);

const normalizedMigration = migration.toLowerCase().replace(/\s+/g, " ");
assert.ok(
  normalizedMigration.includes(
    "revoke all privileges on table public.tenants from anon, authenticated;",
  ),
);

const expectedFunctionAcl = [
  [
    "public.claim_managed_approval_reminder( uuid, text, text, timestamptz, integer )",
    "service_role",
  ],
  [
    "public.claim_managed_content_job_event( text, text, uuid, uuid, text, text, text, timestamptz, integer )",
    "service_role",
  ],
  [
    "public.client_respond_managed_approval( uuid, text, boolean )",
    "authenticated, service_role",
  ],
  [
    "public.consume_content_desk_delegation( text, text, uuid, uuid, timestamptz )",
    "service_role",
  ],
  ["public.has_company_access(uuid)", "authenticated, service_role"],
  ["public.is_admin_of_company(uuid)", "authenticated, service_role"],
  ["public.is_company_staff(uuid)", "authenticated, service_role"],
  ["public.is_platform_admin()", "authenticated, service_role"],
  ["public.is_tenant_admin(uuid)", "authenticated, service_role"],
  ["public.is_tenant_member(uuid)", "authenticated, service_role"],
  [
    "public.respond_managed_approval_with_token( text, uuid, text, jsonb, boolean )",
    "anon, authenticated, service_role",
  ],
] as const;

for (const [signature, roles] of expectedFunctionAcl) {
  assert.ok(
    normalizedMigration.includes(
      `revoke all on function ${signature} from public, anon, authenticated, service_role;`,
    ),
    `Missing complete revoke for ${signature}`,
  );
  assert.ok(
    normalizedMigration.includes(
      `grant execute on function ${signature} to ${roles};`,
    ),
    `Unexpected grant matrix for ${signature}`,
  );
}

assert.doesNotMatch(normalizedMigration, /grant execute on function .* to public/);

const pinnedSearchPaths =
  migration.match(/set search_path = pg_catalog, public;/gi) ?? [];
assert.equal(
  pinnedSearchPaths.length,
  11,
  "Every inventoried SECURITY DEFINER function must pin its search_path",
);

for (const helper of [
  "has_company_access",
  "is_admin_of_company",
  "is_company_staff",
  "is_platform_admin",
  "is_tenant_admin",
  "is_tenant_member",
]) {
  assert.match(
    migration,
    new RegExp(
      `revoke all on function public\\.${helper}\\([\\s\\S]*?from public, anon, authenticated, service_role;[\\s\\S]*?grant execute on function public\\.${helper}`,
      "i",
    ),
  );
}

assert.match(catalogTest, /expected_security_definer_acl/i);
assert.match(catalogTest, /claim_managed_content_job_event/i);
assert.match(catalogTest, /complete effective role ACL matrix/i);
for (const matrixRole of [
  "public_execute",
  "anon_execute",
  "authenticated_execute",
  "service_role_execute",
]) {
  assert.match(catalogTest, new RegExp(matrixRole, "i"));
}
assert.match(catalogTest, /PUBLIC has no direct CREATE grant on public schema/i);
assert.match(catalogTest, /anon has no effective CREATE privilege/i);
assert.match(catalogTest, /authenticated has no effective CREATE privilege/i);
assert.match(catalogTest, /anon has no tenant column privileges/i);
assert.match(
  catalogTest,
  /authenticated has no tenant column update privileges/i,
);
assert.match(behaviorTest, /Browser owner overwrite/i);
assert.match(behaviorTest, /service_role retains the repository tenant update path/i);
for (const tokenCase of [
  "valid token bound to another company",
  "expired token cannot approve",
  "superseded token cannot approve",
  "beyond the revision cap",
  "requires explicit disclosure acceptance",
  "valid anonymous token can approve",
  "same-decision replay is safely idempotent",
  "conflicting replay is rejected",
  "row locking serializes concurrent decisions",
]) {
  assert.match(behaviorTest, new RegExp(tokenCase, "i"));
}

assert.match(catalogTest, /select plan\(20\)/i);
assert.equal(
  (catalogTest.match(/^select (?:is|ok)\(/gim) ?? []).length,
  20,
  "Catalog pgTAP plan must match its assertions",
);
assert.match(behaviorTest, /select plan\(19\)/i);
assert.equal(
  (
    behaviorTest.match(
      /^select (?:throws_ok|results_eq|lives_ok|ok)\(/gim,
    ) ?? []
  ).length,
  19,
  "Behavior pgTAP plan must match its assertions",
);

for (const requiredConcurrencyControl of [
  "set local role anon",
  "set local statement_timeout",
  "set local lock_timeout",
  "idle_in_transaction_session_timeout",
  "pg_catalog.pg_stat_activity",
  'wait_event_type === "Lock"',
  "rollbackQuietly",
  "delete from public.tenants",
  "ALLOW_DISPOSABLE_DATABASE_SECURITY_TESTS",
]) {
  assert.match(
    concurrencyTest,
    new RegExp(requiredConcurrencyControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}
assert.equal(
  (concurrencyTest.match(/runSerializedScenario\(/g) ?? []).length,
  3,
  "Harness must define and run both serialized scenarios",
);
assert.match(
  concurrencyTest,
  /secondDecision,[\s\S]*"approved"[\s\S]*"changes_requested"/,
);
assert.match(
  concurrencyTest,
  /firstResult: true,[\s\S]*secondResult: true/,
);
assert.match(
  concurrencyTest,
  /firstResult: true,[\s\S]*secondResult: false/,
);
assert.doesNotMatch(concurrencyTest, /console\.(?:log|error)\([^)]*connectionString/);

console.log("database security remediation self-test passed");
