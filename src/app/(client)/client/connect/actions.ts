"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { isV1ConnectPlatform } from "@/lib/connect-invites";
import { requestSocialConnectInvites } from "@/lib/onboarding-social-connect";
import type { V1ConnectPlatform } from "@/lib/types";

/**
 * Client self-serve: request OAuth connect invites for additional SM accounts
 * and email the one-time links (email still live-gated).
 *
 * PLACEHOLDER product rule: today any v1 platform may be requested later.
 * Confirm whether later adds must stay within the paid package channels only.
 */
export async function requestClientSocialConnectAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");

  const platforms = formData
    .getAll("platform")
    .map((v) => String(v).trim())
    .filter((v): v is V1ConnectPlatform => isV1ConnectPlatform(v));

  if (platforms.length === 0) {
    throw new Error("Select at least one social account to connect.");
  }

  const recipient =
    String(formData.get("email") || "").trim() ||
    company.profile.approvalContact?.trim() ||
    user.email ||
    "";

  await requestSocialConnectInvites({
    agencyTenantId: user.tenantId,
    companyId,
    platforms,
    invitedBy: user,
    source: "client",
    recipientEmail: recipient,
    emailInvites: true,
  });

  revalidatePath("/client/connect");
  revalidatePath("/client");
}
