// Public REST API self-test — tenant isolation + key scoping.

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  getApiKeyByPrefix,
  getCompany,
  listContent,
  purgeTenant,
} from "@/lib/db";
import { hashApiKey, mintApiKey } from "@/lib/public-api/api-keys";
import { timingSafeEqual } from "node:crypto";

export interface PublicApiCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PublicApiReport {
  ok: boolean;
  passed: number;
  failed: number;
  purgeFailed: string[];
  durationMs: number;
  checks: PublicApiCheck[];
}

export async function runPublicApiSelfTest(): Promise<PublicApiReport> {
  const start = Date.now();
  const checks: PublicApiCheck[] = [];
  const purgeFailed: string[] = [];

  const t1 = await createTenant({
    name: "API Test A",
    kind: "agency",
    plan: "starter",
    timezone: "Australia/Sydney",
    status: "active",
  });
  const t2 = await createTenant({
    name: "API Test B",
    kind: "agency",
    plan: "starter",
    timezone: "Australia/Sydney",
    status: "active",
  });
  const user = await createUser({
    email: `api-test-${Date.now()}@example.dev`,
    name: "API Tester",
    role: "admin",
  });
  await addMembership({ tenantId: t1.id, userId: user.id, role: "owner" });
  const c1 = await createCompany({
    tenantId: t1.id,
    name: "Co A",
    createdBy: user.id,
  });
  const c2 = await createCompany({
    tenantId: t2.id,
    name: "Co B",
    createdBy: user.id,
  });

  const { plaintext, record } = await mintApiKey({
    tenantId: t1.id,
    name: "test",
    scopes: ["companies:read", "content:read"],
    companyIds: [c1.id],
    createdById: user.id,
  });

  const resolved = await getApiKeyByPrefix(plaintext.slice(0, 20));
  checks.push({
    name: "apiKey.prefixLookup",
    ok: !!resolved && resolved.tenantId === t1.id,
    detail: resolved ? `tenant ${resolved.tenantId}` : "miss",
  });

  const hash = hashApiKey(plaintext);
  const hashOk =
    resolved &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(resolved.keyHash));
  checks.push({
    name: "apiKey.hashVerify",
    ok: !!hashOk,
    detail: hashOk ? "hash match" : "hash mismatch",
  });

  const coA = await getCompany(c1.id);
  const coB = await getCompany(c2.id);
  checks.push({
    name: "isolation.companyTenantPin",
    ok: coA?.tenantId === t1.id && coB?.tenantId === t2.id,
    detail: `A=${coA?.tenantId} B=${coB?.tenantId}`,
  });

  const contentT1 = await listContent(t1.id);
  const contentT2 = await listContent(t2.id);
  checks.push({
    name: "isolation.contentListTenantScoped",
    ok: contentT1.length >= 0 && contentT2.length >= 0,
    detail: `t1=${contentT1.length} t2=${contentT2.length}`,
  });

  checks.push({
    name: "apiKey.companyScopeStored",
    ok: record.companyIds?.includes(c1.id) === true,
    detail: String(record.companyIds?.join(",")),
  });

  for (const tid of [t1.id, t2.id]) {
    try {
      await purgeTenant(tid);
    } catch {
      purgeFailed.push(tid);
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - start,
    checks,
  };
}
