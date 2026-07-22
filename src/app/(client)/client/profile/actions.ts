"use server";

import { revalidatePath } from "next/cache";
import { getCompany, isUnderLegalHold, updateCompany } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { validateOptionalPhone, validateOptionalWebsite } from "@/lib/form-validation";
import {
  applyClientProfilePatch,
  clientProfilePatchFromForm,
} from "@/lib/client-profile-edit";
import {
  getPlaceDetails,
  searchPlaces,
  type PlaceMatch,
  type PlaceSuggestion,
} from "@/lib/places-enrichment";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

/** Portal Places autocomplete — simulated on staging; live only when Places flag is on. */
export async function searchBusinessPlacesAction(
  query: string,
): Promise<PlaceSuggestion[]> {
  await requirePortalUser();
  return searchPlaces(query);
}

/** Resolve a suggestion into full place details for form fill. */
export async function resolvePlaceDetailsAction(
  placeId: string,
  hintName?: string,
): Promise<PlaceMatch | null> {
  await requirePortalUser();
  return getPlaceDetails(placeId, hintName);
}

/**
 * Clients may correct Google-profile-shaped contact / location / hours fields
 * plus Places pin. Strategy Brand Brain fields stay agency-only.
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

  const patch = clientProfilePatchFromForm((key) => text(formData, key));
  if (!patch.displayName) throw new Error("Business display name is required.");

  const phoneErr = validateOptionalPhone(patch.phone);
  if (phoneErr) throw new Error(phoneErr);

  const websiteErr = validateOptionalWebsite(patch.website);
  if (websiteErr) throw new Error(websiteErr);

  if (patch.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email)) {
    throw new Error("Enter a valid public email, or leave it blank.");
  }

  const profile = applyClientProfilePatch(company.profile, patch);

  await updateCompany(companyId, {
    name: patch.displayName,
    profile,
  });

  await logAction(user, "client_profile.updated", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: profile.googlePlaceId
      ? `Client updated business info (place ${profile.googlePlaceId})`
      : "Client updated business info / contact / hours",
  });

  revalidatePath("/client/profile");
  revalidatePath("/client/account");
  revalidatePath("/client");
}
