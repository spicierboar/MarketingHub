// Loyalty, offers & referrals engine (W4 M37).
import {
  createLoyaltyMember,
  createLoyaltyRedemption,
  createLoyaltyReferral,
  getLoyaltyMember,
  getLoyaltyProgram,
  listLoyaltyCoupons,
  listLoyaltyMembers,
  listLoyaltyRedemptions,
  listLoyaltyReferrals,
  listLoyaltyTiers,
  updateLoyaltyCoupon,
  updateLoyaltyMember,
  updateLoyaltyReferral,
  upsertLoyaltyProgram,
} from "@/lib/db";
import { dispatchLoyaltyEvent, loyaltyConfigured, loyaltyLive } from "@/lib/loyalty-connectors";
import { resolveSegmentMembers } from "@/lib/crm";
import type {
  CrmContact,
  CrmSegment,
  EmailSubscriber,
  LoyaltyCoupon,
  LoyaltyMember,
  LoyaltyProgram,
  LoyaltyRedemption,
  LoyaltyTier,
  SmsSubscriber,
} from "@/lib/types";

export { loyaltyLive, loyaltyApiKey, loyaltyConfigured } from "@/lib/loyalty-connectors";

export function normaliseCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateReferralCode(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `REF${(h % 1_000_000).toString().padStart(6, "0")}`;
}

export function resolveTierForPoints(tiers: LoyaltyTier[], points: number): LoyaltyTier | undefined {
  return [...tiers]
    .filter((t) => points >= t.thresholdPoints)
    .sort((a, b) => b.thresholdPoints - a.thresholdPoints || a.sortOrder - b.sortOrder)[0];
}

export function memberHasSegmentTag(
  member: LoyaltyMember,
  tag: string,
  contacts: CrmContact[],
  emailSubs: EmailSubscriber[],
  smsSubs: SmsSubscriber[],
): boolean {
  const needle = tag.toLowerCase();
  if (member.contactId) {
    const contact = contacts.find((c) => c.id === member.contactId);
    if (contact?.tags.some((t) => t.toLowerCase() === needle)) return true;
  }
  if (member.email) {
    const email = member.email.toLowerCase();
    if (emailSubs.some((s) => s.email.toLowerCase() === email && s.tags.some((t) => t.toLowerCase() === needle))) {
      return true;
    }
  }
  return smsSubs.some(
    (s) =>
      s.name?.toLowerCase() === member.displayName.toLowerCase() &&
      s.tags.some((t) => t.toLowerCase() === needle),
  );
}

export function filterMembersForCoupon(
  coupon: LoyaltyCoupon,
  members: LoyaltyMember[],
  contacts: CrmContact[],
  emailSubs: EmailSubscriber[],
  smsSubs: SmsSubscriber[],
): LoyaltyMember[] {
  const active = members.filter((m) => m.status === "active" && m.companyId === coupon.companyId);
  if (!coupon.segmentTag) return active;
  return active.filter((m) => memberHasSegmentTag(m, coupon.segmentTag!, contacts, emailSubs, smsSubs));
}

export function crmSegmentToLoyaltyMembers(
  segment: CrmSegment,
  contacts: CrmContact[],
  members: LoyaltyMember[],
): LoyaltyMember[] {
  const segContacts = resolveSegmentMembers(segment, contacts);
  const contactIds = new Set(segContacts.map((c) => c.id));
  const emails = new Set(segContacts.map((c) => c.email?.toLowerCase()).filter(Boolean) as string[]);
  return members.filter(
    (m) =>
      m.companyId === segment.companyId &&
      m.status === "active" &&
      ((m.contactId && contactIds.has(m.contactId)) || (m.email && emails.has(m.email.toLowerCase()))),
  );
}

export function detectRedemptionAbuse(input: {
  memberId: string;
  coupon: LoyaltyCoupon;
  redemptions: LoyaltyRedemption[];
  spendAmount?: number;
}): { allowed: boolean; reason?: string } {
  const { memberId, coupon, redemptions, spendAmount } = input;
  if (coupon.status !== "active") return { allowed: false, reason: "coupon_inactive" };
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.now()) {
    return { allowed: false, reason: "coupon_expired" };
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { allowed: false, reason: "coupon_exhausted" };
  }
  const memberUses = redemptions.filter((r) => r.memberId === memberId && r.couponId === coupon.id).length;
  if (memberUses >= coupon.perMemberLimit) return { allowed: false, reason: "member_limit" };
  if (coupon.minSpend != null && spendAmount != null && spendAmount < coupon.minSpend) {
    return { allowed: false, reason: "min_spend" };
  }
  return { allowed: true };
}

export function couponDiscountAmount(coupon: LoyaltyCoupon, spendAmount: number): number {
  if (coupon.kind === "percent_off") return Math.round(spendAmount * (coupon.value / 100) * 100) / 100;
  if (coupon.kind === "fixed_off") return coupon.value;
  return 0;
}

export function eligibleForEmailCampaign(
  member: LoyaltyMember,
  subscribers: EmailSubscriber[],
): boolean {
  if (!member.email) return false;
  const sub = subscribers.find((s) => s.email.toLowerCase() === member.email!.toLowerCase());
  return !!sub && sub.marketingConsent && !sub.unsubscribedAt;
}

export function eligibleForSmsCampaign(member: LoyaltyMember, subscribers: SmsSubscriber[]): boolean {
  const sub = subscribers.find(
    (s) => s.name?.toLowerCase() === member.displayName.toLowerCase() || s.tags.includes("loyalty"),
  );
  return !!sub && sub.consentStatus === "opted_in" && !sub.optedOutAt;
}

export async function redeemCoupon(input: {
  tenantId: string;
  memberId: string;
  couponCode: string;
  spendAmount?: number;
  channel?: string;
}): Promise<{ ok: boolean; detail: string; redemption?: LoyaltyRedemption; abuseFlagged?: boolean }> {
  const member = await getLoyaltyMember(input.memberId);
  if (!member || member.status !== "active") return { ok: false, detail: "member_not_found" };
  const coupons = await listLoyaltyCoupons(input.tenantId, member.companyId);
  const coupon = coupons.find((c) => normaliseCouponCode(c.code) === normaliseCouponCode(input.couponCode));
  if (!coupon) return { ok: false, detail: "coupon_not_found" };
  if (coupon.channels.length && input.channel && !coupon.channels.includes(input.channel)) {
    return { ok: false, detail: "channel_blocked" };
  }
  const redemptions = await listLoyaltyRedemptions(input.tenantId, member.companyId);
  const abuse = detectRedemptionAbuse({
    memberId: member.id,
    coupon,
    redemptions,
    spendAmount: input.spendAmount,
  });
  if (!abuse.allowed) {
    const flagged = await createLoyaltyRedemption({
      companyId: member.companyId,
      memberId: member.id,
      couponId: coupon.id,
      amountOff: 0,
      mode: loyaltyConfigured() ? "live" : "simulated",
      abuseFlagged: true,
      abuseReason: abuse.reason,
      redeemedAt: new Date().toISOString(),
    });
    return { ok: false, detail: abuse.reason ?? "blocked", redemption: flagged, abuseFlagged: true };
  }
  const amountOff = couponDiscountAmount(coupon, input.spendAmount ?? 0);
  const redemption = await createLoyaltyRedemption({
    companyId: member.companyId,
    memberId: member.id,
    couponId: coupon.id,
    amountOff,
    mode: loyaltyConfigured() ? "live" : "simulated",
    abuseFlagged: false,
    redeemedAt: new Date().toISOString(),
  });
  await updateLoyaltyCoupon(coupon.id, { redemptionCount: coupon.redemptionCount + 1 });
  if (coupon.kind === "bonus_points") {
    await updateLoyaltyMember(member.id, { pointsBalance: member.pointsBalance + coupon.value });
  }
  await dispatchLoyaltyEvent({ companyId: member.companyId, event: "redemption", memberId: member.id });
  return { ok: true, detail: loyaltyConfigured() ? "live_redemption_stub" : "simulated_redemption", redemption };
}

export async function recordReferral(input: {
  companyId: string;
  referrerMemberId: string;
  refereeEmail: string;
}): Promise<{ ok: boolean; detail: string }> {
  const referrer = await getLoyaltyMember(input.referrerMemberId);
  if (!referrer || referrer.companyId !== input.companyId) return { ok: false, detail: "referrer_not_found" };
  await createLoyaltyReferral({
    companyId: input.companyId,
    referrerMemberId: input.referrerMemberId,
    refereeEmail: input.refereeEmail.trim().toLowerCase(),
    status: "pending",
    bonusAwarded: 0,
    createdAt: new Date().toISOString(),
  });
  return { ok: true, detail: loyaltyConfigured() ? "live_referral_stub" : "simulated_referral" };
}

export async function completeReferral(input: {
  referralId: string;
  program: LoyaltyProgram;
}): Promise<{ ok: boolean; detail: string; bonus?: number }> {
  const referrals = await listLoyaltyReferrals("", input.program.companyId);
  const referral = referrals.find((r) => r.id === input.referralId);
  if (!referral || referral.status !== "pending") return { ok: false, detail: "referral_not_pending" };
  const bonus = input.program.referralBonusPoints;
  const referrer = await getLoyaltyMember(referral.referrerMemberId);
  if (referrer) {
    await updateLoyaltyMember(referrer.id, { pointsBalance: referrer.pointsBalance + bonus });
    const tiers = await listLoyaltyTiers("", input.program.companyId);
    const tier = resolveTierForPoints(tiers, referrer.pointsBalance + bonus);
    if (tier) await updateLoyaltyMember(referrer.id, { tierId: tier.id });
  }
  await updateLoyaltyReferral(referral.id, {
    status: "completed",
    bonusAwarded: bonus,
    completedAt: new Date().toISOString(),
  });
  await dispatchLoyaltyEvent({
    companyId: input.program.companyId,
    event: "referral_completed",
    memberId: referral.referrerMemberId,
  });
  return { ok: true, detail: loyaltyConfigured() ? "live_complete_stub" : "simulated_complete", bonus };
}

export async function ensureLoyaltyProgram(companyId: string): Promise<LoyaltyProgram> {
  const existing = await getLoyaltyProgram(companyId);
  if (existing) return existing;
  return upsertLoyaltyProgram({
    companyId,
    rewardMode: "points",
    pointsPerDollar: 1,
    stampsPerReward: 10,
    referralBonusPoints: 50,
    enabled: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function enrollMember(input: {
  companyId: string;
  displayName: string;
  email?: string;
  contactId?: string;
  referredByCode?: string;
}): Promise<LoyaltyMember> {
  await ensureLoyaltyProgram(input.companyId);
  const seed = `${input.companyId}:${input.email ?? input.displayName}:${Date.now()}`;
  return createLoyaltyMember({
    companyId: input.companyId,
    contactId: input.contactId ?? null,
    email: input.email?.trim().toLowerCase(),
    displayName: input.displayName.trim(),
    pointsBalance: 0,
    stampsBalance: 0,
    tierId: null,
    referralCode: generateReferralCode(seed),
    referredByCode: input.referredByCode ?? null,
    status: "active",
  });
}

export async function awardPurchase(input: {
  tenantId: string;
  memberId: string;
  spendAmount: number;
}): Promise<LoyaltyMember | undefined> {
  const member = await getLoyaltyMember(input.memberId);
  if (!member) return undefined;
  const program = await getLoyaltyProgram(member.companyId);
  if (!program?.enabled) return member;
  let points = member.pointsBalance;
  let stamps = member.stampsBalance;
  if (program.rewardMode === "points") {
    points += Math.floor(input.spendAmount * program.pointsPerDollar);
  } else {
    stamps += 1;
    if (stamps >= program.stampsPerReward) {
      stamps = 0;
      points += program.referralBonusPoints;
    }
  }
  const tiers = await listLoyaltyTiers(input.tenantId, member.companyId);
  const tier = resolveTierForPoints(tiers, points);
  return updateLoyaltyMember(member.id, { pointsBalance: points, stampsBalance: stamps, tierId: tier?.id ?? null });
}

export async function previewCouponAudience(
  tenantId: string,
  coupon: LoyaltyCoupon,
  contacts: CrmContact[],
  emailSubs: EmailSubscriber[],
  smsSubs: SmsSubscriber[],
): Promise<{ total: number; eligible: number }> {
  const members = await listLoyaltyMembers(tenantId, coupon.companyId);
  const eligible = filterMembersForCoupon(coupon, members, contacts, emailSubs, smsSubs);
  return { total: members.length, eligible: eligible.length };
}
