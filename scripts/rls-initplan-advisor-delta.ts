import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type AdvisorFinding = Record<string, unknown>;

const expectedRemovedTargets = [
  ["tenant_members", "members_read"],
  ["app_users", "app_users_read"],
  ["company_access", "access_read"],
  ["terms_acceptances", "terms_acceptances_own"],
  ["marketing_workflows", "marketing_workflows_rw"],
  [
    "managed_approval_requests",
    "managed_approval_requests_client_read",
  ],
] as const;

function readFindings(path: string): AdvisorFinding[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  let findings: unknown = null;

  if (Array.isArray(parsed)) {
    findings = parsed;
  } else if (parsed && typeof parsed === "object" && "results" in parsed) {
    findings = (parsed as { results: unknown }).results;
  }

  assert.ok(Array.isArray(findings), `${path} must contain an advisor result array`);
  return findings as AdvisorFinding[];
}

function value(finding: AdvisorFinding, key: keyof AdvisorFinding): string {
  const candidate = finding[key];
  return typeof candidate === "string" ? candidate : "";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    );
  }
  return value;
}

function fingerprint(finding: AdvisorFinding): string {
  return JSON.stringify(canonicalize(finding));
}

function multiset(findings: AdvisorFinding[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const finding of findings) {
    const key = fingerprint(finding);
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function subtract(
  minuend: Map<string, number>,
  subtrahend: Map<string, number>,
): string[] {
  const difference: string[] = [];
  for (const [key, count] of minuend) {
    const remaining = count - (subtrahend.get(key) ?? 0);
    for (let index = 0; index < remaining; index += 1) {
      difference.push(key);
    }
  }
  return difference;
}

function findingFromFingerprint(serialized: string): AdvisorFinding {
  return JSON.parse(serialized) as AdvisorFinding;
}

function findingDetailPrefix(table: string, policy: string): string {
  return (
    `Table \`public.${table}\` has a row level security policy \`${policy}\` that `
  );
}

function verifyDelta(before: AdvisorFinding[], after: AdvisorFinding[]): void {
  const expectedBefore = Number(process.env.RLS_ADVISOR_EXPECTED_BEFORE ?? 135);
  assert.ok(Number.isInteger(expectedBefore) && expectedBefore >= 6);
  assert.equal(
    before.length,
    expectedBefore,
    `Advisor baseline must contain ${expectedBefore} findings`,
  );
  assert.equal(
    after.length,
    expectedBefore - 6,
    `Post-migration advisors must contain ${expectedBefore - 6} findings`,
  );
  assert.equal(
    before.filter((finding) => value(finding, "level") === "ERROR").length,
    0,
    "Advisor baseline must contain zero errors",
  );
  assert.equal(
    after.filter((finding) => value(finding, "level") === "ERROR").length,
    0,
    "Post-migration advisors must contain zero errors",
  );

  const beforeSet = multiset(before);
  const afterSet = multiset(after);
  const removed = subtract(beforeSet, afterSet).map(findingFromFingerprint);
  const added = subtract(afterSet, beforeSet).map(findingFromFingerprint);

  assert.equal(added.length, 0, "No new advisor finding may appear");
  assert.equal(removed.length, 6, "Exactly six advisor findings must disappear");

  for (const [table, policy] of expectedRemovedTargets) {
    const matches = removed.filter((finding) => {
      return (
        value(finding, "name") === "auth_rls_initplan" &&
        value(finding, "detail").startsWith(findingDetailPrefix(table, policy))
      );
    });
    assert.equal(
      matches.length,
      1,
      `Expected one removed init-plan finding for ${table}.${policy}`,
    );
  }
}

const [beforePath, afterPath] = process.argv.slice(2);
if (beforePath === "--self-test") {
  const unchanged = Array.from({ length: 129 }, (_, index) => ({
    level: "WARN",
    name: "unchanged_finding",
    title: "Unchanged finding",
    detail: `unchanged-${index}`,
  }));
  const resolved = expectedRemovedTargets.map(([table, policy]) => ({
    level: "WARN",
    name: "auth_rls_initplan",
    title: "Slow security policy detected",
    detail: `${findingDetailPrefix(table, policy)}re-evaluates auth.uid()`,
  }));
  verifyDelta([...unchanged, ...resolved], unchanged);
} else {
  assert.ok(
    beforePath && afterPath,
    "Usage: rls-initplan-advisor-delta.ts <before.json> <after.json>",
  );
  verifyDelta(readFindings(beforePath), readFindings(afterPath));
}

console.log(
  "Advisor delta verified: only the six approved init-plan findings changed.",
);
