import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function readProjectFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migration = readProjectFile(
  "../supabase/migrations/20260719111346_optimize_rls_auth_initplans.sql",
);
const catalogTest = readProjectFile(
  "../supabase/tests/database/rls_initplan_catalog.test.sql",
);
const behaviorTest = readProjectFile(
  "../supabase/tests/database/rls_initplan_behavior.test.sql",
);
const advisorTest = readProjectFile(
  "../supabase/tests/database/rls_initplan_advisor_expectations.test.sql",
);
const advisorDelta = readProjectFile("./rls-initplan-advisor-delta.ts");
const documentation = readProjectFile("../docs/DATABASE_SECURITY.md");
const migrationSql = migration.replace(/--.*$/gm, "");

const expectedPolicyTargets = [
  ["members_read", "public.tenant_members"],
  ["app_users_read", "public.app_users"],
  ["access_read", "public.company_access"],
  ["terms_acceptances_own", "public.terms_acceptances"],
  ["marketing_workflows_rw", "public.marketing_workflows"],
  [
    "managed_approval_requests_client_read",
    "public.managed_approval_requests",
  ],
] as const;

const alteredPolicyTargets = Array.from(
  migrationSql.matchAll(
    /^\s*alter policy\s+([a-z0-9_]+)\s+on\s+([a-z0-9_.]+)/gim,
  ),
  ([, policy, table]) => [policy.toLowerCase(), table.toLowerCase()],
);
assert.deepEqual(
  alteredPolicyTargets.sort(),
  [...expectedPolicyTargets].sort(),
  "Migration scope must remain exactly the six approved policy/table pairs",
);

assert.equal(
  (migrationSql.match(/\(select auth\.uid\(\)\)/gi) ?? []).length,
  8,
  "Every direct auth.uid call must use a scalar init plan",
);
assert.doesNotMatch(
  migrationSql.replaceAll(/\(select auth\.uid\(\)\)/gi, ""),
  /auth\.uid\(\)/i,
  "No per-row auth.uid call may remain",
);

assert.doesNotMatch(
  migrationSql,
  /\b(?:create|drop)\s+policy\b|\balter\s+function\b|\b(?:grant|revoke)\s+execute\b/i,
  "The migration must not redesign policies or mutate function exposure",
);
assert.doesNotMatch(
  migrationSql,
  /ai_prompt_versions_read|companies_admin_write|company_reviews_scoped|managed_channel_adaptations_read|security_settings/i,
  "Deferred overlap-policy cohorts must remain untouched",
);
assert.match(migrationSql, /set local lock_timeout = '5s'/i);
assert.match(
  migrationSql,
  /alter policy marketing_workflows_rw[\s\S]*using \([\s\S]*with check \(/i,
);

for (const [policy] of expectedPolicyTargets) {
  assert.match(
    catalogTest,
    new RegExp(policy),
    `Catalog expectations must cover ${policy}`,
  );
  assert.match(
    migrationSql,
    new RegExp(`alter policy\\s+${policy}`, "i"),
    `Migration must alter ${policy}`,
  );
}

assert.match(catalogTest, /select plan\(8\)/i);
assert.equal(
  (catalogTest.match(/^select (?:is|ok)\(/gim) ?? []).length,
  8,
  "Catalog pgTAP plan must match its assertions",
);
assert.match(catalogTest, /no remaining per-row auth\.uid calls/i);
assert.match(catalogTest, /commands, permissiveness, and role targets are unchanged/i);
assert.match(catalogTest, /exact six rule-object pairs/i);
assert.match(catalogTest, /normalized USING and WITH CHECK predicates exactly match/i);

assert.match(advisorTest, /select plan\(3\)/i);
assert.equal(
  (advisorTest.match(/^select (?:is|ok)\(/gim) ?? []).length,
  3,
  "Advisor pgTAP plan must match its assertions",
);
assert.match(advisorTest, /0003_auth_rls_initplan warnings have no residual/i);
assert.match(advisorTest, /exact six approved rule-object pairs/i);

assert.match(advisorDelta, /RLS_ADVISOR_EXPECTED_BEFORE \?\? 135/i);
assert.match(advisorDelta, /expectedBefore - 6/i);
assert.match(advisorDelta, /No new advisor finding may appear/i);
assert.match(advisorDelta, /Exactly six advisor findings must disappear/i);

assert.match(behaviorTest, /select plan\(23\)/i);
assert.equal(
  (
    behaviorTest.match(
      /^select (?:throws_ok|results_eq|lives_ok|ok)\(/gim,
    ) ?? []
  ).length,
  23,
  "Behavior pgTAP plan must match its assertions",
);
for (const requiredBehavior of [
  "members_read preserves same-tenant access",
  "app_users_read preserves self and same-tenant access",
  "access_read preserves company-admin access",
  "terms_acceptances_own preserves ownership",
  "marketing_workflows_rw preserves tenant-template and company access",
  "managed approval staff access remains company-bound",
  "managed approval recipient access remains active-user and company-bound",
  "denies a cross-tenant template",
  "anonymous callers cannot execute authenticated RLS helpers",
  "authenticated role with a null subject",
  "inactive recipients cannot read managed approval requests",
  "authorized tenant workflow updates",
  "cross-tenant workflow updates",
  "authorized company workflow deletes",
  "cross-tenant workflow deletes",
  "null-company non-template workflow",
]) {
  assert.match(behaviorTest, new RegExp(requiredBehavior, "i"));
}

for (const requiredDocumentation of [
  "20260719111346_optimize_rls_auth_initplans.sql",
  "Rollback",
  "120 policy-overlap",
  "seven authenticated-only functions",
  "unapplied",
  "disposable Supabase",
  "transaction-local lock timeout",
  "low-traffic",
]) {
  assert.match(documentation, new RegExp(requiredDocumentation, "i"));
}

console.log("RLS init-plan remediation self-test passed");
