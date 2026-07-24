/**
 * Heavy Profile prefill after Website identity (name + ABN + postcode + optional URL).
 * Runs Google Places (GBP-style listing) in parallel with website scrape/AI so sales
 * and admin create paths get address, phone, hours, and category without retyping.
 */

import {
  scrapeAndApplyInitialProfile,
  type AutoOnboardingScrapeResult,
} from "@/lib/auto-onboarding";
import { enrichProfileWithStructuredBusinessInfo } from "@/lib/business-info/enrich-profile";
import type { StructuredBusinessAddress } from "@/lib/business-info/types";
import {
  matchPlace,
  placeMatchToProfilePatch,
  type PlaceMatch,
} from "@/lib/places-enrichment";
import { enrichExtractedWithBusinessType } from "@/lib/signup-prefill-templates";
import type {
  BusinessType,
  Company,
  CompanyProfile,
} from "@/lib/types";

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function preferExisting<T>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (existing === undefined || existing === null) return incoming;
  if (typeof existing === "string" && !existing.trim()) return incoming;
  if (Array.isArray(existing) && existing.length === 0) return incoming;
  return existing;
}

function addressIsShellOnly(addr?: StructuredBusinessAddress): boolean {
  if (!addr) return true;
  return (
    !hasText(addr.streetName) &&
    !hasText(addr.streetNumber) &&
    !hasText(addr.suburb)
  );
}

export function businessTypeFromPlaceCategory(
  category?: string,
): BusinessType | undefined {
  const c = (category ?? "").toLowerCase();
  if (!c) return undefined;
  if (
    /cafe|coffee|restaurant|meal|food|bakery|bar|pub|bistro|diner/.test(c)
  ) {
    return "restaurant_cafe";
  }
  if (/hotel|lodging|motel|resort|inn/.test(c)) return "hotel";
  if (
    /store|shop|retail|supermarket|grocery|boutique|clothing|electronics/.test(c)
  ) {
    return "retail";
  }
  if (
    /dentist|doctor|lawyer|accountant|agency|consultant|clinic|physiotherap|real.?estate|insurance/.test(
      c,
    )
  ) {
    return "professional";
  }
  return undefined;
}

/** Merge Places listing into profile without clobbering stronger scrape/identity values. */
export function mergePlaceIntoProfile(
  profile: CompanyProfile,
  place: PlaceMatch,
): CompanyProfile {
  const patch = placeMatchToProfilePatch(place);
  const next: CompanyProfile = { ...profile };

  next.businessAddress = preferExisting(
    next.businessAddress,
    patch.businessAddress,
  );
  next.phone = preferExisting(next.phone, patch.phone);
  next.tradingHours = preferExisting(next.tradingHours, patch.tradingHours);
  next.googlePlaceId = preferExisting(next.googlePlaceId, patch.googlePlaceId);
  next.latitude = preferExisting(next.latitude, patch.latitude);
  next.longitude = preferExisting(next.longitude, patch.longitude);
  next.placeCategory = preferExisting(next.placeCategory, patch.placeCategory);
  next.website = preferExisting(next.website, patch.website);
  next.structuredPhone = preferExisting(
    next.structuredPhone,
    patch.structuredPhone,
  );
  next.structuredHours = preferExisting(
    next.structuredHours,
    patch.structuredHours,
  );

  if (patch.serviceAreas?.length) {
    next.serviceAreas =
      next.serviceAreas?.length ? next.serviceAreas : patch.serviceAreas;
  }

  if (patch.structuredAddress) {
    if (addressIsShellOnly(next.structuredAddress)) {
      next.structuredAddress = {
        ...patch.structuredAddress,
        postcode:
          next.structuredAddress?.postcode ||
          patch.structuredAddress.postcode ||
          "",
        countryCode:
          next.structuredAddress?.countryCode ||
          patch.structuredAddress.countryCode ||
          "AU",
      };
    } else {
      next.structuredAddress = {
        ...patch.structuredAddress,
        ...next.structuredAddress,
        postcode:
          next.structuredAddress?.postcode ||
          patch.structuredAddress.postcode ||
          "",
      };
    }
  }

  if (!hasText(next.industry) && place.category) {
    next.industry = place.category;
  }
  if (!hasText(next.natureOfBusiness) && place.category) {
    next.natureOfBusiness = `${place.name} — ${place.category}`;
  }

  const inferred = businessTypeFromPlaceCategory(place.category);
  if (
    inferred &&
    (!next.businessType || next.businessType === "other")
  ) {
    next.businessType = inferred;
  } else if (!next.businessType || next.businessType === "other") {
    const { businessType } = enrichExtractedWithBusinessType({
      industry: next.industry || place.category,
      natureOfBusiness: next.natureOfBusiness,
    });
    if (businessType !== "other") next.businessType = businessType;
  }

  return enrichProfileWithStructuredBusinessInfo(next);
}

export function summarisePrefillSources(profile: CompanyProfile): string[] {
  const bits: string[] = [];
  if (profile.googlePlaceId) bits.push("Google Business listing");
  if (profile.website) bits.push("website");
  if (hasText(profile.legalName)) bits.push("ABN register");
  if (hasText(profile.phone)) bits.push("phone");
  if (hasText(profile.tradingHours) || profile.structuredHours)
    bits.push("hours");
  if (hasText(profile.businessAddress) || profile.structuredAddress?.streetName)
    bits.push("address");
  if (profile.services?.length) bits.push("services");
  if (hasText(profile.natureOfBusiness)) bits.push("nature of business");
  return bits;
}

export async function prefillProfileFromPublicSources(input: {
  company: Company;
  actorId: string;
  /** Trading name from Website step */
  businessName: string;
  postcode?: string;
  suburb?: string;
  region?: string;
  website?: string;
  /** Soft cap for website scrape + AI only; Places runs alongside and is kept. */
  scrapeBudgetMs?: number;
}): Promise<{
  profile: CompanyProfile;
  scraped: boolean;
  scrapeMode?: AutoOnboardingScrapeResult["mode"] | "failed";
  enrichMode?: "claude" | "template";
  placesMode?: PlaceMatch["mode"];
  sources: string[];
}> {
  const scrapeBudgetMs = input.scrapeBudgetMs ?? 14_000;
  const website = input.website?.trim();

  const placePromise = matchPlace({
    name: input.businessName,
    suburb: input.suburb,
    postcode: input.postcode,
    region: input.region ?? "Australia",
  });

  const scrapePromise = website
    ? scrapeAndApplyInitialProfile({
        company: input.company,
        website,
        actorId: input.actorId,
      })
    : Promise.resolve(null);

  const timedScrape = website
    ? Promise.race([
        scrapePromise,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), scrapeBudgetMs),
        ),
      ])
    : Promise.resolve(null);

  const [place, scrape] = await Promise.all([placePromise, timedScrape]);

  let profile: CompanyProfile = scrape?.profile ?? { ...input.company.profile };
  if (website && !hasText(profile.website)) {
    profile = { ...profile, website };
  }

  let placesMode: PlaceMatch["mode"] | undefined;
  if (place) {
    profile = mergePlaceIntoProfile(profile, place);
    placesMode = place.mode;
  } else {
    profile = enrichProfileWithStructuredBusinessInfo(profile);
  }

  const scraped = Boolean(scrape && scrape.fieldCount > 0);
  return {
    profile,
    scraped,
    scrapeMode: scrape?.mode,
    enrichMode: scrape?.enrichMode,
    placesMode,
    sources: summarisePrefillSources(profile),
  };
}
