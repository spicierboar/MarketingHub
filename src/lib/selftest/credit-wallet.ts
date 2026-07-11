// Self-tests for prepaid company credit wallet (C2, $50 floor).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  purgeTenant,
} from "@/lib/db";
import {
  assertPrepaidCredit,
  getCreditBalance,
  getOrCreateCreditWallet,
  maybeAutoTopUp,
  MIN_CREDIT_FLOOR_USD,
  topUpCredit,
  updateCreditAutoTopUpSettings,
} from "@/lib/credit-wallet";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, User } from "@/lib/types";

function acting(user: User, tenantId: string): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole: "owner",
    role: TENANT_ROLE_TIER.owner,
  };
}

async function withCompany(
  run: (ctx: {
    user: ActingUser;
    companyId: string;
    tenantId: string;
  }) => Promise<{ ok: boolean; detail: string }>,
): Promise<{ ok: boolean; detail: string }> {
  const t = await createTenant({
    name: `Credit Wallet ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `credit-${Date.now()}@example.dev`,
    name: "Credit Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Credit Co",
    createdBy: user.id,
  });
  try {
    return await run({ user, companyId: company.id, tenantId: t.id });
  } finally {
    await purgeTenant(t.id);
  }
}

/** Floor blocks when balance < 50. */
export async function checkCreditFloorBlocksBelowMin(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ companyId }) => {
    const wallet = await getOrCreateCreditWallet(companyId);
    const balance = await getCreditBalance(companyId);
    let blocked = false;
    let msg = "";
    try {
      await assertPrepaidCredit(companyId);
    } catch (e) {
      blocked = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    const ok =
      wallet.minFloorUsd === MIN_CREDIT_FLOOR_USD &&
      balance < MIN_CREDIT_FLOOR_USD &&
      blocked &&
      /\$50 minimum/i.test(msg);
    return {
      ok,
      detail: `floor=${wallet.minFloorUsd} bal=${balance} blocked=${blocked} msg=${msg.slice(0, 80)}`,
    };
  });
}

/** Top-up then assert passes. */
export async function checkCreditTopUpThenAssertPasses(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId }) => {
    await topUpCredit({
      companyId,
      amountUsd: 100,
      user,
      reason: "Self-test top-up",
    });
    const balance = await getCreditBalance(companyId);
    let passed = false;
    try {
      await assertPrepaidCredit(companyId);
      passed = true;
    } catch {
      passed = false;
    }
    const ok = balance >= MIN_CREDIT_FLOOR_USD && passed;
    return { ok, detail: `bal=${balance} assertOk=${passed}` };
  });
}

/** Auto top-up when enabled and below trigger. */
export async function checkCreditAutoTopUpWhenBelowTrigger(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId }) => {
    await updateCreditAutoTopUpSettings(companyId, user, {
      autoTopUpEnabled: true,
      topUpTriggerBalanceUsd: 50,
      topUpAmountUsd: 100,
      maxTopUpAmountUsd: 500,
      maxTopUpPerDay: 3,
    });
    const before = await getCreditBalance(companyId);
    const result = await maybeAutoTopUp(companyId, user);
    const after = await getCreditBalance(companyId);
    const ok =
      before <= 50 &&
      result != null &&
      after === before + 100 &&
      after >= MIN_CREDIT_FLOOR_USD;
    return {
      ok,
      detail: `before=${before} after=${after} auto=${!!result}`,
    };
  });
}
