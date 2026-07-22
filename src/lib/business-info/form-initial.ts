// Server-safe helpers to seed Business info forms from profile / draft fields.
// Keep out of "use client" modules so RSC pages can call these at render time.

import {
  parseAddressText,
  parsePhoneText,
  parseTradingHoursText,
} from "@/lib/business-info/format";
import type {
  StructuredBusinessAddress,
  StructuredPhone,
  StructuredTradingHours,
} from "@/lib/business-info/types";

export type BusinessInfoFormInitial = {
  businessName: string;
  website: string;
  serviceAreas: string;
  googlePlaceId: string;
  latitude: string;
  longitude: string;
  placeCategory: string;
  address: StructuredBusinessAddress;
  phone: StructuredPhone;
  hours: StructuredTradingHours;
  /** Legacy free-text fallbacks when structured missing */
  businessAddressText?: string;
  phoneText?: string;
  tradingHoursText?: string;
};

/** Build form initial state from profile + legacy text fields. */
export function businessInfoInitialFromProfile(args: {
  businessName: string;
  website?: string;
  serviceAreas?: string[];
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  placeCategory?: string;
  structuredAddress?: StructuredBusinessAddress;
  structuredPhone?: StructuredPhone;
  structuredHours?: StructuredTradingHours;
  businessAddress?: string;
  phone?: string;
  tradingHours?: string;
}): BusinessInfoFormInitial {
  return {
    businessName: args.businessName,
    website: args.website ?? "",
    serviceAreas: (args.serviceAreas ?? []).join(", "),
    googlePlaceId: args.googlePlaceId ?? "",
    latitude: typeof args.latitude === "number" ? String(args.latitude) : "",
    longitude: typeof args.longitude === "number" ? String(args.longitude) : "",
    placeCategory: args.placeCategory ?? "",
    address:
      args.structuredAddress ?? parseAddressText(args.businessAddress, "AU"),
    phone: args.structuredPhone ?? parsePhoneText(args.phone),
    hours: args.structuredHours ?? parseTradingHoursText(args.tradingHours),
    businessAddressText: args.businessAddress,
    phoneText: args.phone,
    tradingHoursText: args.tradingHours,
  };
}
