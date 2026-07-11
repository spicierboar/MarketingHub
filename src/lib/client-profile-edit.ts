// Client portal: which company profile fields clients may edit vs view-only.
// Identity / compliance / agency-managed settings stay locked.
// ABN is an attribute only — never a primary or unique key (1 ABN → N companies).

import type { CompanyProfile, SocialLink } from "@/lib/types";
import { SOCIAL_PLATFORMS } from "@/lib/types";

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

/** Whitelist of profile keys the portal save action may update. */
export const CLIENT_PROFILE_EDITABLE_KEYS = [
  "tradingNames",
  "industry",
  "website",
  "approvalContact",
  "serviceAreas",
  "natureOfBusiness",
  "services",
  "targetCustomers",
  "brandVoice",
  "callsToAction",
  "currentOffers",
  "localMarketNotes",
  "tradingHours",
  "socialLinks",
] as const;

export type ClientProfileEditableKey = (typeof CLIENT_PROFILE_EDITABLE_KEYS)[number];

export type ClientProfileEditablePatch = Partial<
  Pick<CompanyProfile, ClientProfileEditableKey>
> & {
  /** Display name on the company record (not inside profile). */
  displayName?: string;
};

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function socialLinksFromForm(get: (key: string) => string): SocialLink[] {
  const links: SocialLink[] = [];
  for (const { key } of SOCIAL_PLATFORMS) {
    const url = get(`social_${key}`);
    if (url) links.push({ platform: key, url });
  }
  return links;
}

/**
 * Build an editable patch from form data. Ignores ABN, legalName, and any
 * other locked keys even if present in the form.
 */
export function clientProfilePatchFromForm(
  get: (key: string) => string,
): ClientProfileEditablePatch {
  const patch: ClientProfileEditablePatch = {};

  const displayName = get("displayName");
  if (displayName) patch.displayName = displayName;

  const tradingNames = get("tradingNames");
  if (tradingNames !== undefined) patch.tradingNames = tradingNames || undefined;

  const industry = get("industry");
  if (industry !== undefined) patch.industry = industry || undefined;

  const website = get("website");
  if (website !== undefined) patch.website = website || undefined;

  const approvalContact = get("approvalContact");
  if (approvalContact !== undefined) {
    patch.approvalContact = approvalContact || undefined;
  }

  const natureOfBusiness = get("natureOfBusiness");
  if (natureOfBusiness !== undefined) {
    patch.natureOfBusiness = natureOfBusiness || undefined;
  }

  const targetCustomers = get("targetCustomers");
  if (targetCustomers !== undefined) {
    patch.targetCustomers = targetCustomers || undefined;
  }

  const brandVoice = get("brandVoice");
  if (brandVoice !== undefined) patch.brandVoice = brandVoice || undefined;

  const currentOffers = get("currentOffers");
  if (currentOffers !== undefined) {
    patch.currentOffers = currentOffers || undefined;
  }

  const localMarketNotes = get("localMarketNotes");
  if (localMarketNotes !== undefined) {
    patch.localMarketNotes = localMarketNotes || undefined;
  }

  const tradingHours = get("tradingHours");
  if (tradingHours !== undefined) {
    patch.tradingHours = tradingHours || undefined;
  }

  // Lists always applied from the form (empty clears).
  patch.serviceAreas = splitList(get("serviceAreas"));
  patch.services = splitList(get("services"));
  patch.callsToAction = splitList(get("callsToAction"));
  patch.socialLinks = socialLinksFromForm(get);

  return patch;
}

/** Merge editable patch into profile; never copies locked keys from patch. */
export function applyClientProfilePatch(
  profile: CompanyProfile,
  patch: ClientProfileEditablePatch,
): CompanyProfile {
  const next: CompanyProfile = { ...profile };

  if ("tradingNames" in patch) next.tradingNames = patch.tradingNames;
  if ("industry" in patch) next.industry = patch.industry;
  if ("website" in patch) next.website = patch.website;
  if ("approvalContact" in patch) next.approvalContact = patch.approvalContact;
  if ("natureOfBusiness" in patch) next.natureOfBusiness = patch.natureOfBusiness;
  if ("targetCustomers" in patch) next.targetCustomers = patch.targetCustomers;
  if ("brandVoice" in patch) next.brandVoice = patch.brandVoice;
  if ("currentOffers" in patch) next.currentOffers = patch.currentOffers;
  if ("localMarketNotes" in patch) next.localMarketNotes = patch.localMarketNotes;
  if ("tradingHours" in patch) next.tradingHours = patch.tradingHours;
  if (patch.serviceAreas) next.serviceAreas = patch.serviceAreas;
  if (patch.services) next.services = patch.services;
  if (patch.callsToAction) next.callsToAction = patch.callsToAction;
  if (patch.socialLinks) next.socialLinks = patch.socialLinks;

  // Locked identity — reaffirm from original (defence in depth).
  next.abn = profile.abn;
  next.legalName = profile.legalName;
  next.googlePlaceId = profile.googlePlaceId;
  next.businessType = profile.businessType;
  next.prohibitedClaims = profile.prohibitedClaims;
  next.approvedClaims = profile.approvedClaims;
  next.requiredDisclaimers = profile.requiredDisclaimers;

  return next;
}
