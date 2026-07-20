"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant } from "@/lib/db";
import { isV1ConnectPlatform } from "@/lib/connect-invites";
import {
  assertConnectPlatformsEntitled,
  requestSocialConnectInvites,
} from "@/lib/onboarding-social-connect";
import type { V1ConnectPlatform } from "@/lib/types";

function connectErrorRedirect(message: string): never {
  redirect(`/client/connect?err=${encodeURIComponent(message)}`);
}

/**
 * Client self-serve (trigger B): request OAuth connect invites for chosen
 * platforms. Tier must include each platform or client must upgrade first.
 */
export async function requestClientSocialConnectAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const [company, tenant] = await Promise.all([
    getCompany(companyId),
    getTenant(user.tenantId),
  ]);
  if (!company) connectErrorRedirect("Company not found.");

  const platforms = formData
    .getAll("platform")
    .map((v) => String(v).trim())
    .filter((v): v is V1ConnectPlatform => isV1ConnectPlatform(v));

  if (platforms.length === 0) {
    connectErrorRedirect("Select at least one social account to connect.");
  }

  try {
    assertConnectPlatformsEntitled(company, tenant, platforms);
  } catch (error) {
    connectErrorRedirect(
      error instanceof Error ? error.message : "Upgrade required for that platform.",
    );
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
  redirect("/client/connect?sent=1");
}
