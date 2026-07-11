// Self-tests for approval-gated spend changes (in-memory).

import {
  addMembership,
  createAdAccount,
  createCompany,
  createTenant,
  createUser,
  getAdBudget,
  purgeTenant,
  updateAiCampaignRecommendation,
  upsertAdBudget,
} from "@/lib/db";
import {
  applySpendChange,
  proposeAllocationSpendChange,
} from "@/lib/spend-approval";
import { encryptToken } from "@/lib/crypto";
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

export async function checkSpendApplyRequiresApproval(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Spend Gate ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `spend-${Date.now()}@example.dev`,
    name: "Spend Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Spend Co",
    createdBy: user.id,
  });

  try {
    await upsertAdBudget({
      companyId: company.id,
      monthlyBudgetUsd: 1000,
      allocation: { meta_ads: 0.5, google_ads: 0.5 },
      feeModel: "percent_of_spend",
      feePercent: 0.15,
      feeFlatUsd: 0,
      updatedById: user.id,
    });
    await createAdAccount({
      companyId: company.id,
      platform: "meta_ads",
      accountName: "act_test",
      externalAccountId: "act_123",
      status: "connected",
      encryptedToken: encryptToken("tok_test"),
      tokenLastFour: "test",
      connectedById: user.id,
    });

    let blockedWithoutApproval = false;
    let blockMsg = "";
    try {
      await applySpendChange({
        user,
        companyId: company.id,
        allocation: { meta_ads: 0.7, google_ads: 0.3 },
      });
    } catch (e) {
      blockedWithoutApproval = true;
      blockMsg = e instanceof Error ? e.message : String(e);
    }

    const rec = await proposeAllocationSpendChange({
      user,
      company,
      budget: (await getAdBudget(company.id))!,
      campaigns: [],
    });

    let blockedPending = false;
    try {
      await applySpendChange({
        user,
        companyId: company.id,
        recommendationId: rec.id,
      });
    } catch {
      blockedPending = true;
    }

    await updateAiCampaignRecommendation(rec.id, {
      humanDecision: "accepted",
      humanDecisionAt: new Date().toISOString(),
    });

    await applySpendChange({
      user,
      companyId: company.id,
      recommendationId: rec.id,
    });
    const after = await getAdBudget(company.id);
    const appliedOk = !!after && Object.keys(after.allocation).length > 0;

    const ok =
      blockedWithoutApproval &&
      /approval/i.test(blockMsg) &&
      blockedPending &&
      appliedOk;

    return {
      ok,
      detail: `noApproval=${blockedWithoutApproval} pending=${blockedPending} applied=${appliedOk} msg=${blockMsg.slice(0, 100)}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}
