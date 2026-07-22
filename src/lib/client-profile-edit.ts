// Client portal: which company profile fields clients may edit vs view-only.
// Business info mirrors Google Business Profile contact/location fields.
// ABN / legal name / Brand Brain strategy stay agency-only.

import type {
  StructuredBusinessAddress,
  StructuredPhone,
  StructuredTradingHours,
} from "@/lib/business-info/types";
import type { CompanyProfile } from "@/lib/types";

/** Shown to the client but never written from the portal. */
export const CLIENT_PROFILE_LOCKED_KEYS = [
  "abn",
  "legalName",
  "businessType",
  "prohibitedClaims",
  "approvedClaims",
  "requiredDisclaimers",
] as const;

export type ClientProfileLockedKey = (typeof CLIENT_PROFILE_LOCKED_KEYS)[number];

export const CLIENT_PROFILE_EDITABLE_KEYS = [
  "website",
  "approvalContact",
  "tradingHours",
  "phone",
  "email",
  "businessAddress",
  "serviceAreas",
  "googlePlaceId",
  "latitude",
  "longitude",
  "placeCategory",
  "structuredAddress",
  "structuredPhone",
  "structuredHours",
] as const;

export type ClientProfileEditableKey = (typeof CLIENT_PROFILE_EDITABLE_KEYS)[number];

export type ClientProfileEditablePatch = Partial<
  Pick<CompanyProfile, ClientProfileEditableKey>
> & {
  displayName?: string;
};

function parseServiceAreas(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function optionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseJson<T>(raw: string): T | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t) as T;
  } catch {
    return undefined;
  }
}

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

  const phone = get("phone");
  if (phone !== undefined) patch.phone = phone || undefined;

  const email = get("email");
  if (email !== undefined) patch.email = email || undefined;

  const businessAddress = get("businessAddress");
  if (businessAddress !== undefined) {
    patch.businessAddress = businessAddress || undefined;
  }

  const serviceAreas = get("serviceAreas");
  if (serviceAreas !== undefined) {
    patch.serviceAreas = parseServiceAreas(serviceAreas);
  }

  const googlePlaceId = get("googlePlaceId");
  if (googlePlaceId !== undefined) {
    patch.googlePlaceId = googlePlaceId || undefined;
  }

  const placeCategory = get("placeCategory");
  if (placeCategory !== undefined) {
    patch.placeCategory = placeCategory || undefined;
  }

  if (get("latitude") !== undefined) {
    patch.latitude = optionalNumber(get("latitude") ?? "");
  }
  if (get("longitude") !== undefined) {
    patch.longitude = optionalNumber(get("longitude") ?? "");
  }

  const structuredAddress = parseJson<StructuredBusinessAddress>(
    get("structuredAddressJson") ?? "",
  );
  if (structuredAddress) patch.structuredAddress = structuredAddress;

  const structuredPhone = parseJson<StructuredPhone>(
    get("structuredPhoneJson") ?? "",
  );
  if (structuredPhone) patch.structuredPhone = structuredPhone;

  const structuredHours = parseJson<StructuredTradingHours>(
    get("structuredHoursJson") ?? "",
  );
  if (structuredHours) patch.structuredHours = structuredHours;

  return patch;
}

export function applyClientProfilePatch(
  profile: CompanyProfile,
  patch: ClientProfileEditablePatch,
): CompanyProfile {
  const next: CompanyProfile = { ...profile };

  if ("website" in patch) next.website = patch.website;
  if ("approvalContact" in patch) next.approvalContact = patch.approvalContact;
  if ("tradingHours" in patch) next.tradingHours = patch.tradingHours;
  if ("phone" in patch) next.phone = patch.phone;
  if ("email" in patch) next.email = patch.email;
  if ("businessAddress" in patch) next.businessAddress = patch.businessAddress;
  if ("serviceAreas" in patch && patch.serviceAreas) {
    next.serviceAreas = patch.serviceAreas;
  }
  if ("googlePlaceId" in patch) next.googlePlaceId = patch.googlePlaceId;
  if ("latitude" in patch) next.latitude = patch.latitude;
  if ("longitude" in patch) next.longitude = patch.longitude;
  if ("placeCategory" in patch) next.placeCategory = patch.placeCategory;
  if ("structuredAddress" in patch) {
    next.structuredAddress = patch.structuredAddress;
  }
  if ("structuredPhone" in patch) next.structuredPhone = patch.structuredPhone;
  if ("structuredHours" in patch) next.structuredHours = patch.structuredHours;

  next.abn = profile.abn;
  next.legalName = profile.legalName;
  next.businessType = profile.businessType;
  next.prohibitedClaims = profile.prohibitedClaims;
  next.approvedClaims = profile.approvedClaims;
  next.requiredDisclaimers = profile.requiredDisclaimers;

  next.tradingNames = profile.tradingNames;
  next.industry = profile.industry;
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
