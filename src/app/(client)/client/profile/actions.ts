"use server";

import { revalidatePath } from "next/cache";
import { getCompany, isUnderLegalHold, updateCompany } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { validateOptionalPhone, validateOptionalWebsite } from "@/lib/form-validation";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function parseServiceAreas(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Clients may correct Google-profile-shaped contact / hours / location fields
 * plus the primary approval contact. Strategy Brand Brain fields stay agency-only.
 * Portal login seats are not changed here — Ask us to transfer access.
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

  const phone = text(formData, "phone");
  const phoneErr = validateOptionalPhone(phone || undefined);
  if (phoneErr) throw new Error(phoneErr);

  const website = text(formData, "website");
  const websiteErr = validateOptionalWebsite(website || undefined);
  if (websiteErr) throw new Error(websiteErr);

  const email = text(formData, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid public email, or leave it blank.");
  }

  const profile = {
    ...company.profile,
    website: website || undefined,
    phone: phone || undefined,
    email: email || undefined,
    businessAddress: text(formData, "businessAddress") || undefined,
    serviceAreas: parseServiceAreas(text(formData, "serviceAreas")),
    tradingHours: text(formData, "tradingHours") || undefined,
    approvalContact: text(formData, "approvalContact") || undefined,
  };

  await updateCompany(companyId, {
    name: displayName,
    profile,
  });

  await logAction(user, "client_profile.updated", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: "Client updated business info / contact / hours",
  });

  revalidatePath("/client/profile");
  revalidatePath("/client/account");
  revalidatePath("/client");
}
