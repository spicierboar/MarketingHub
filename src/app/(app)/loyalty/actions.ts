"use server";

import { revalidatePath } from "next/cache";
import {
  createLoyaltyCoupon,
  createLoyaltyTier,
  listCrmContacts,
  listEmailSubscribers,
  listSmsSubscribers,
} from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { enrollMember, normaliseCouponCode, previewCouponAudience, recordReferral } from "@/lib/loyalty";
import type { LoyaltyCouponKind } from "@/lib/types";

export async function createTierAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await createLoyaltyTier({
    companyId,
    name: String(formData.get("name") ?? "").trim(),
    thresholdPoints: Number(formData.get("thresholdPoints") ?? 0),
    benefits: String(formData.get("benefits") ?? "").trim(),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
  });
  revalidatePath(`/loyalty?company=${companyId}`);
}

export async function enrollMemberAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  await assertAdminCompanyAccess(companyId);
  await enrollMember({
    companyId,
    displayName: String(formData.get("displayName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim() || undefined,
  });
  revalidatePath(`/loyalty?company=${companyId}`);
}

export async function createCouponAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await createLoyaltyCoupon({
    companyId,
    code: normaliseCouponCode(String(formData.get("code") ?? "")),
    name: String(formData.get("name") ?? "").trim(),
    kind: (String(formData.get("kind") ?? "percent_off") as LoyaltyCouponKind),
    value: Number(formData.get("value") ?? 0),
    segmentTag: String(formData.get("segmentTag") ?? "").trim() || null,
    perMemberLimit: Number(formData.get("perMemberLimit") ?? 1),
    channels: [],
    status: "active",
    createdById: user.id,
  });
  revalidatePath(`/loyalty?company=${companyId}`);
}

export async function recordReferralAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  await assertAdminCompanyAccess(companyId);
  await recordReferral({
    companyId,
    referrerMemberId: String(formData.get("memberId") ?? ""),
    refereeEmail: String(formData.get("refereeEmail") ?? ""),
  });
  revalidatePath(`/loyalty?company=${companyId}`);
}

export async function previewAudienceAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const segmentTag = String(formData.get("segmentTag") ?? "").trim() || null;
  const coupon = {
    id: "preview",
    companyId,
    code: "PREVIEW",
    name: "Preview",
    kind: "percent_off" as const,
    value: 10,
    segmentTag,
    perMemberLimit: 1,
    channels: [],
    status: "active" as const,
    redemptionCount: 0,
    createdById: user.id,
    createdAt: "",
    updatedAt: "",
  };
  const [contacts, emailSubs, smsSubs] = await Promise.all([
    listCrmContacts(user.tenantId, companyId),
    listEmailSubscribers(companyId),
    listSmsSubscribers(companyId),
  ]);
  return previewCouponAudience(user.tenantId, coupon, contacts, emailSubs, smsSubs);
}
