"use server";

import { getCompany, listCompanies, updateCompany } from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  abnResultToProfilePatch,
  lookupAbn,
  type AbnLookupResult,
} from "@/lib/abn-lookup";
import {
  duplicateNameAbnMessage,
  findDuplicateByNameAndAbn,
} from "@/lib/company-identity";
import {
  matchPlace,
  placeMatchToExtractedHints,
  type PlaceMatch,
} from "@/lib/places-enrichment";
import type { CompanyProfile } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function previewAbnAction(
  formData: FormData,
): Promise<
  | { ok: true; result: AbnLookupResult; profilePatch: ReturnType<typeof abnResultToProfilePatch> }
  | { ok: false; error: string }
> {
  try {
    const companyId = text(formData, "companyId");
    const user = await assertAdminCompanyAccess(companyId);
    const abnOrName = text(formData, "abnOrName");
    if (!abnOrName) throw new Error("Enter an ABN or business name to look up.");

    const result = await lookupAbn(abnOrName);
    if (!result) throw new Error("No ABN match found.");

    await logAction(user, "enrichment.abn_previewed", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `mode=${result.mode} abn=${result.abn} name=${result.legalName}`,
    });

    return {
      ok: true,
      result,
      profilePatch: abnResultToProfilePatch(result),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ABN preview failed",
    };
  }
}

export async function previewPlaceMatchAction(
  formData: FormData,
): Promise<
  | {
      ok: true;
      match: PlaceMatch;
      hints: ReturnType<typeof placeMatchToExtractedHints>;
    }
  | { ok: false; error: string }
> {
  try {
    const companyId = text(formData, "companyId");
    const user = await assertAdminCompanyAccess(companyId);
    const name = text(formData, "name");
    if (!name) throw new Error("Business name is required for Places match.");

    const match = await matchPlace({
      name,
      suburb: text(formData, "suburb") || undefined,
      region: text(formData, "region") || undefined,
    });
    if (!match) throw new Error("No Places match found.");

    await logAction(user, "enrichment.places_previewed", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `mode=${match.mode} placeId=${match.placeId} address=${match.formattedAddress}`,
    });

    return {
      ok: true,
      match,
      hints: placeMatchToExtractedHints(match),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Places preview failed",
    };
  }
}

/** Apply ABN / Places profile patches (abn, googlePlaceId, tradingHours, legalName). */
export async function applyEnrichmentProfileAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const companyId = text(formData, "companyId");
    const user = await assertAdminCompanyAccess(companyId);
    const raw = text(formData, "enrichmentPatchJson");
    if (!raw) return { ok: true };

    let patch: Partial<{
      abn: string;
      legalName: string;
      googlePlaceId: string;
      tradingHours: string;
      website: string;
      industry: string;
      serviceAreas: string[];
      tradingNames: string;
    }>;
    try {
      patch = JSON.parse(raw) as typeof patch;
    } catch {
      throw new Error("Invalid enrichment patch.");
    }

    const company = await getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const profile: CompanyProfile = { ...company.profile };
    if (patch.abn?.trim()) profile.abn = patch.abn.trim();
    if (patch.legalName?.trim()) profile.legalName = patch.legalName.trim();
    if (patch.tradingNames?.trim()) profile.tradingNames = patch.tradingNames.trim();
    if (patch.googlePlaceId?.trim()) profile.googlePlaceId = patch.googlePlaceId.trim();
    if (patch.tradingHours?.trim()) profile.tradingHours = patch.tradingHours.trim();
    if (patch.website?.trim()) profile.website = patch.website.trim();
    if (patch.industry?.trim()) profile.industry = patch.industry.trim();
    if (patch.serviceAreas?.length) profile.serviceAreas = patch.serviceAreas;

    if (profile.abn?.trim()) {
      const dup = findDuplicateByNameAndAbn(
        await listCompanies(user.tenantId),
        company.name,
        profile.abn,
        { excludeCompanyId: companyId },
      );
      if (dup) throw new Error(duplicateNameAbnMessage(dup.company));
    }

    await updateCompany(companyId, { profile });
    await logAction(user, "enrichment.profile_applied", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `keys=${Object.keys(patch).join(",")}`,
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Enrichment apply failed",
    };
  }
}
