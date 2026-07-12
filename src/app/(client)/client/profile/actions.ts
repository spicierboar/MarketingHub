"use server";

import { revalidatePath } from "next/cache";
import { getCompany, isUnderLegalHold, updateCompany } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

/**
 * Wave A — clients may only correct contact / hours / display name / website.
 * Strategy Brand Brain fields are never written from the portal.
 */
export async function saveClientProfileAction(formData: FormData) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  const companyId = text(formData, "companyId");
  if (!companyId || companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }
  if (await isUnderLegalHold("company", companyId, companyId)) {
    throw new Error("This company is under a legal hold — profile cannot be edited.");
  }

  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const displayName = text(formData, "displayName");
  if (!displayName) throw new Error("Business display name is required.");

  const profile = {
    ...company.profile,
    website: text(formData, "website") || undefined,
    approvalContact: text(formData, "approvalContact") || undefined,
    tradingHours: text(formData, "tradingHours") || undefined,
  };

  await updateCompany(companyId, {
    name: displayName,
    profile,
  });

  await logAction(user, "client_profile.updated", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: "Client updated contact / hours",
  });

  revalidatePath("/client/profile");
  revalidatePath("/client/account");
  revalidatePath("/client");
}
