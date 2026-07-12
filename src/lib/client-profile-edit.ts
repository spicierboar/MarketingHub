// Client portal: which company profile fields clients may edit vs view-only.
// Wave A — contact / hours only. Brand Brain strategy stays agency-only.
// ABN is locked in the portal; agency identity rule is (business name + ABN)
// — see company-identity.ts (ABN alone may appear on multiple companies).

import type { CompanyProfile } from "@/lib/types";

/** Shown to the client but never written from the portal. */
export const CLIENT_PROFILE_LOCKED_KEYS = [
  "abn",
  "legalName",
  "googlePlaceId",
  "businessType",
  "prohibitedClaims",
  "approvedClaims",
  "requiredDisclaimers",
] as const;

export type ClientProfileLockedKey = (typeof CLIENT_PROFILE_LOCKED_KEYS)[number];

/**
 * Whitelist of profile keys the portal may update (Wave A — contact/hours only).
 * Brand Brain strategy fields stay agency-only.
 */
export const CLIENT_PROFILE_EDITABLE_KEYS = [
  "website",
  "approvalContact",
  "tradingHours",
] as const;

export type ClientProfileEditableKey = (typeof CLIENT_PROFILE_EDITABLE_KEYS)[number];

export type ClientProfileEditablePatch = Partial<
  Pick<CompanyProfile, ClientProfileEditableKey>
> & {
  /** Display name on the company record (not inside profile). */
  displayName?: string;
};

/**
 * Build an editable patch from form data. Ignores ABN, legalName, and any
 * strategy / Brand Brain fields even if present in the form.
 */
export function clientProfilePatchFromForm(
  get: (key: string) => string,
): ClientProfileEditablePatch {
  const patch: ClientProfileEditablePatch = {};

  const displayName = get("displayName");
  if (displayName) patch.displayName = displayName;

  const website = get("website");
  if (website !== undefined) patch.website = website || undefined;

  const approvalContact = get("approvalContact");
  if (approvalContact !== undefined) {
    patch.approvalContact = approvalContact || undefined;
  }

  const tradingHours = get("tradingHours");
  if (tradingHours !== undefined) {
    patch.tradingHours = tradingHours || undefined;
  }

  return patch;
}

/** Merge editable patch into profile; never copies locked or strategy keys from patch. */
export function applyClientProfilePatch(
  profile: CompanyProfile,
  patch: ClientProfileEditablePatch,
): CompanyProfile {
  const next: CompanyProfile = { ...profile };

  if ("website" in patch) next.website = patch.website;
  if ("approvalContact" in patch) next.approvalContact = patch.approvalContact;
  if ("tradingHours" in patch) next.tradingHours = patch.tradingHours;

  // Locked identity — reaffirm from original (defence in depth).
  next.abn = profile.abn;
  next.legalName = profile.legalName;
  next.googlePlaceId = profile.googlePlaceId;
  next.businessType = profile.businessType;
  next.prohibitedClaims = profile.prohibitedClaims;
  next.approvedClaims = profile.approvedClaims;
  next.requiredDisclaimers = profile.requiredDisclaimers;

  // Strategy fields never change via portal patch (defence in depth).
  next.tradingNames = profile.tradingNames;
  next.industry = profile.industry;
  next.serviceAreas = profile.serviceAreas;
  next.natureOfBusiness = profile.natureOfBusiness;
  next.services = profile.services;
  next.targetCustomers = profile.targetCustomers;
  next.brandVoice = profile.brandVoice;
  next.callsToAction = profile.callsToAction;
  next.currentOffers = profile.currentOffers;
  next.localMarketNotes = profile.localMarketNotes;
  next.socialLinks = profile.socialLinks;

  return next;
}
