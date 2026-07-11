// Self-tests for Privacy DSR + marketing-use gate.

import {
  addMembership,
  createCompany,
  createCrmContact,
  createPrivacyRequest,
  createTenant,
  createUser,
  purgeTenant,
} from "@/lib/db";
import { assertMarketingUseAllowed, isMarketingUseAllowed } from "@/lib/privacy";
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

export async function checkOptedOutContactBlocked(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const t = await createTenant({
    name: `Privacy DSR ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `privacy-${Date.now()}@example.dev`,
    name: "Privacy Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Privacy Co",
    createdBy: user.id,
  });

  try {
    const optedOut = await createCrmContact({
      companyId: company.id,
      firstName: "Opted",
      lastName: "Out",
      email: "opted@example.dev",
      tags: [],
      consentStatus: "unsubscribed",
      source: "manual",
      createdById: user.id,
    });

    let blocked = false;
    let msg = "";
    try {
      await assertMarketingUseAllowed(optedOut);
    } catch (e) {
      blocked = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    const allowedFlag = await isMarketingUseAllowed(optedOut);

    const subscribed = await createCrmContact({
      companyId: company.id,
      firstName: "Ok",
      email: "ok@example.dev",
      tags: [],
      consentStatus: "subscribed",
      source: "manual",
      createdById: user.id,
    });
    const beforeRestrict = await isMarketingUseAllowed(subscribed);

    await createPrivacyRequest({
      tenantId: t.id,
      companyId: company.id,
      subjectRef: subscribed.id,
      requestType: "restriction",
      status: "in_progress",
      createdBy: user.id,
    });
    const afterRestrict = await isMarketingUseAllowed(subscribed);

    const ok =
      blocked &&
      !allowedFlag &&
      beforeRestrict &&
      !afterRestrict &&
      msg.toLowerCase().includes("opted out");

    return {
      ok,
      detail: `optedOutBlocked=${blocked} allowedFlag=${allowedFlag} beforeRestrict=${beforeRestrict} afterRestrict=${afterRestrict}`,
    };
  } finally {
    await purgeTenant(t.id);
  }
}
