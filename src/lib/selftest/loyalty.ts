// Self-test helpers for W4 loyalty (M37).

import {
  addMembership,
  createCompany,
  createCrmContact,
  createEmailSubscriber,
  createLoyaltyCoupon,
  createLoyaltyTier,
  createSmsSubscriber,
  createTenant,
  createUser,
  listLoyaltyRedemptions,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import { dispatchLoyaltyEvent, loyaltyConfigured, loyaltyLive } from "@/lib/loyalty-connectors";
import {
  crmSegmentToLoyaltyMembers,
  detectRedemptionAbuse,
  eligibleForEmailCampaign,
  eligibleForSmsCampaign,
  enrollMember,
  filterMembersForCoupon,
  redeemCoupon,
  recordReferral,
  resolveTierForPoints,
} from "@/lib/loyalty";
import type { CrmSegment, EmailSubscriber, LoyaltyCoupon, LoyaltyMember, LoyaltyRedemption, LoyaltyTier, SmsSubscriber } from "@/lib/types";

export function checkLoyaltySimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return { ok: !loyaltyLive() && !loyaltyConfigured(), detail: `LOYALTY_LIVE=${loyaltyLive()}` };
}

export function checkLoyaltyTierResolvesFromPoints(): { ok: boolean; detail: string } {
  const tiers: LoyaltyTier[] = [
    { id: "bronze", companyId: "c", name: "Bronze", thresholdPoints: 0, benefits: "", sortOrder: 0, createdAt: "t", updatedAt: "t" },
    { id: "gold", companyId: "c", name: "Gold", thresholdPoints: 500, benefits: "", sortOrder: 1, createdAt: "t", updatedAt: "t" },
  ];
  const tier = resolveTierForPoints(tiers, 600);
  return { ok: tier?.id === "gold", detail: tier?.name ?? "none" };
}

export function checkLoyaltySegmentTargeting(): { ok: boolean; detail: string } {
  const coupon: LoyaltyCoupon = {
    id: "cp", companyId: "c", code: "VIP10", name: "VIP", kind: "percent_off", value: 10,
    segmentTag: "vip", perMemberLimit: 1, channels: [], status: "active", redemptionCount: 0,
    createdById: "u", createdAt: "t", updatedAt: "t",
  };
  const members: LoyaltyMember[] = [
    { id: "m1", companyId: "c", displayName: "A", pointsBalance: 0, stampsBalance: 0, referralCode: "R1", status: "active", contactId: "ct1", createdAt: "t", updatedAt: "t" },
    { id: "m2", companyId: "c", displayName: "B", pointsBalance: 0, stampsBalance: 0, referralCode: "R2", status: "active", createdAt: "t", updatedAt: "t" },
  ];
  const contacts = [{ id: "ct1", companyId: "c", firstName: "A", tags: ["vip"], consentStatus: "subscribed" as const, source: "manual" as const, createdById: "u", createdAt: "t", updatedAt: "t" }];
  const eligible = filterMembersForCoupon(coupon, members, contacts, [], []);
  return { ok: eligible.length === 1 && eligible[0]?.id === "m1", detail: `eligible=${eligible.length}` };
}

export function checkLoyaltyAbuseBlocksOverLimit(): { ok: boolean; detail: string } {
  const coupon: LoyaltyCoupon = {
    id: "cp", companyId: "c", code: "ONCE", name: "Once", kind: "fixed_off", value: 5,
    perMemberLimit: 1, channels: [], status: "active", redemptionCount: 0,
    createdById: "u", createdAt: "t", updatedAt: "t",
  };
  const redemptions: LoyaltyRedemption[] = [
    { id: "r1", companyId: "c", memberId: "m1", couponId: "cp", amountOff: 5, mode: "simulated", abuseFlagged: false, redeemedAt: "t" },
  ];
  const blocked = detectRedemptionAbuse({ memberId: "m1", coupon, redemptions });
  return { ok: !blocked.allowed && blocked.reason === "member_limit", detail: blocked.reason ?? "ok" };
}

export async function checkLoyaltyReferralSimulated(): Promise<{ ok: boolean; detail: string }> {
  const result = await dispatchLoyaltyEvent({ companyId: "c_stub", event: "referral_completed", memberId: "m_stub" });
  return { ok: result.ok && result.mode === "simulated", detail: result.detail };
}

export async function checkLoyaltyCrmEmailSmsHooks(): Promise<{ ok: boolean; detail: string }> {
  const member: LoyaltyMember = {
    id: "m", companyId: "c", displayName: "Sam", email: "sam@example.dev", pointsBalance: 0, stampsBalance: 0,
    referralCode: "REF", status: "active", createdAt: "t", updatedAt: "t",
  };
  const emailSubs: EmailSubscriber[] = [
    { id: "e1", companyId: "c", email: "sam@example.dev", tags: ["loyalty"], marketingConsent: true, createdAt: "t", updatedAt: "t" },
  ];
  const smsSubs: SmsSubscriber[] = [
    { id: "s1", companyId: "c", phoneE164: "+61400111222", name: "Sam", tags: ["loyalty"], consentStatus: "opted_in", source: "manual", createdAt: "t", updatedAt: "t" },
  ];
  const segment: CrmSegment = {
    id: "seg", companyId: "c", name: "Loyalty", ruleType: "tag", ruleConfig: { tags: ["loyalty"] },
    createdById: "u", createdAt: "t", updatedAt: "t",
  };
  const contacts = [{ id: "ct", companyId: "c", firstName: "Sam", email: "sam@example.dev", tags: ["loyalty"], consentStatus: "subscribed" as const, source: "manual" as const, createdById: "u", createdAt: "t", updatedAt: "t" }];
  const mapped = crmSegmentToLoyaltyMembers(segment, contacts, [{ ...member, contactId: "ct" }]);
  const ok = eligibleForEmailCampaign(member, emailSubs) && eligibleForSmsCampaign(member, smsSubs) && mapped.length === 1;
  return { ok, detail: `email=${eligibleForEmailCampaign(member, emailSubs)} sms=${eligibleForSmsCampaign(member, smsSubs)} crm=${mapped.length}` };
}

export async function runLoyaltySelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(name: string, fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string }) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  await expect("loyalty.simulatedWhenLiveOff", () => checkLoyaltySimulatedWhenLiveOff());
  await expect("loyalty.tierResolvesFromPoints", () => checkLoyaltyTierResolvesFromPoints());
  await expect("loyalty.segmentTargeting", () => checkLoyaltySegmentTargeting());
  await expect("loyalty.abuseBlocksOverLimit", () => checkLoyaltyAbuseBlocksOverLimit());
  await expect("loyalty.referralSimulated", () => checkLoyaltyReferralSimulated());
  await expect("loyalty.crmEmailSmsHooks", () => checkLoyaltyCrmEmailSmsHooks());

  const t = await createTenant({ name: "Loyalty Test", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `loyalty-${Date.now()}@example.dev`, name: "Loyalty Tester", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "Loyalty Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  await createLoyaltyTier({ companyId: company.id, name: "Silver", thresholdPoints: 100, benefits: "5% off", sortOrder: 0 });
  const contact = await createCrmContact({ companyId: company.id, firstName: "Pat", email: "pat@example.dev", tags: ["vip"], consentStatus: "subscribed", source: "manual", createdById: user.id });
  await createEmailSubscriber({ companyId: company.id, email: "pat@example.dev", tags: ["vip"], marketingConsent: true });
  await createSmsSubscriber({ companyId: company.id, phoneE164: "+61400999888", name: "Pat", tags: ["vip"], consentStatus: "opted_in", source: "manual" });
  const member = await enrollMember({ companyId: company.id, displayName: "Pat", email: "pat@example.dev", contactId: contact.id });
  const coupon = await createLoyaltyCoupon({
    companyId: company.id, code: "VIP15", name: "VIP 15%", kind: "percent_off", value: 15,
    segmentTag: "vip", perMemberLimit: 1, channels: [], status: "active", createdById: user.id,
  });
  const redeem = await redeemCoupon({ tenantId: t.id, memberId: member.id, couponCode: coupon.code, spendAmount: 100 });
  await recordReferral({ companyId: company.id, referrerMemberId: member.id, refereeEmail: "friend@example.dev" });
  checks.push({ name: "loyalty.redemptionTracked", ok: redeem.ok && (await listLoyaltyRedemptions(t.id, company.id)).length >= 1 });
  try { await purgeTenant(t.id); } catch { purgeFailed.push(t.id); }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && !purgeFailed.length, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - start, checks };
}
