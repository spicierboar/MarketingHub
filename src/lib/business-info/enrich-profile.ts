// Fill structured address / phone / hours from free-text profile fields when missing.
// Used after scrape/Places so sales + self-serve onboarding inherit precise editors.

import {
  parseAddressText,
  parsePhoneText,
  parseTradingHoursText,
} from "@/lib/business-info/format";
import type { CompanyProfile } from "@/lib/types";

/** Derive structured* from listing strings without overwriting user-confirmed structure. */
export function enrichProfileWithStructuredBusinessInfo(
  profile: CompanyProfile,
): CompanyProfile {
  const next: CompanyProfile = { ...profile };

  if (!next.structuredAddress && next.businessAddress?.trim()) {
    next.structuredAddress = parseAddressText(next.businessAddress, "AU");
  }

  if (!next.structuredPhone && next.phone?.trim()) {
    next.structuredPhone = parsePhoneText(next.phone);
  }

  if (!next.structuredHours && next.tradingHours?.trim()) {
    next.structuredHours = parseTradingHoursText(next.tradingHours);
  }

  return next;
}
