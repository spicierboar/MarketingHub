"use server";

import { revalidatePath } from "next/cache";
import { getCompany, isUnderLegalHold, updateCompany } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  applyClientProfilePatch,
  clientProfilePatchFromForm,
} from "@/lib/client-profile-edit";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

/** Save client-editable business profile fields only (ABN / legal name locked). */
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

  const patch = clientProfilePatchFromForm((key) => text(formData, key));
  const displayName = patch.displayName?.trim();
  if (!displayName) throw new Error("Business display name is required.");

  const profile = applyClientProfilePatch(company.profile, patch);
  await updateCompany(companyId, {
    name: displayName,
    profile,
  });

  await logAction(user, "client_profile.updated", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: "Client updated editable business profile fields",
  });

  revalidatePath("/client/profile");
  revalidatePath("/client");
}
