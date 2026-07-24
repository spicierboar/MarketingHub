// Google Places read-only enrichment for onboarding pre-fill.
// Find Place / Text Search + Details — NO GBP OAuth, NO publish, no *_LIVE
// flips for ads or publishing. Deterministic simulation on staging or when the
// API key is unset.

import {
  appEnv,
  liveIntegrationsAllowed,
  providerLiveFlagEnabled,
  type AppEnv,
} from "@/lib/env";
import type { AutoOnboardingExtractedFields } from "@/lib/auto-onboarding";
import {
  parseAddressText,
  parsePhoneText,
  parseTradingHoursText,
} from "@/lib/business-info/format";
import type { CompanyProfile } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export interface PlaceMatchQuery {
  name: string;
  suburb?: string;
  /** AU postcode — improves Text Search / simulated address accuracy. */
  postcode?: string;
  region?: string;
}

export interface PlaceMatch {
  placeId: string;
  name: string;
  formattedAddress: string;
  phone?: string;
  website?: string;
  types?: string[];
  category?: string;
  latitude?: number;
  longitude?: number;
  openingHoursText?: string[];
  mode: "live" | "simulated";
}

/** Lightweight row for address / business autocomplete dropdowns. */
export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  mode: "live" | "simulated";
}

export type PlaceExtractedHints = Partial<AutoOnboardingExtractedFields> &
  Pick<
    Partial<CompanyProfile>,
    "googlePlaceId" | "tradingHours" | "businessAddress" | "latitude" | "longitude" | "placeCategory"
  >;

// ---- env gate ----------------------------------------------------------------

function placesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.PLACES_API_KEY?.trim() ||
    undefined
  );
}

/** True only when Google Places is effectively activated for outbound calls. */
export function placesEnrichmentConfigured(): boolean {
  return (
    providerLiveFlagEnabled(process.env.PLACES_ENRICHMENT_LIVE) &&
    liveIntegrationsAllowed() &&
    Boolean(placesApiKey())
  );
}

export function placesEnrichmentLiveFor(
  env: AppEnv,
  configured: boolean,
  liveFlag = false,
): boolean {
  return configured && env === "production" && liveFlag;
}

function placesEnrichmentLive(): boolean {
  return placesEnrichmentLiveFor(
    appEnv(),
    placesEnrichmentConfigured(),
    providerLiveFlagEnabled(process.env.PLACES_ENRICHMENT_LIVE),
  );
}

// ---- helpers -----------------------------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildSearchQuery(query: PlaceMatchQuery): string {
  return [query.name, query.suburb, query.postcode, query.region]
    .filter(Boolean)
    .join(", ")
    .trim();
}

const CATEGORY_BY_HASH = [
  "Cafe",
  "Restaurant",
  "Dentist",
  "Retail store",
  "Professional services",
  "Hotel",
];

function primaryCategory(types?: string[]): string | undefined {
  if (!types?.length) return undefined;
  const skip = new Set([
    "point_of_interest",
    "establishment",
    "food",
    "store",
    "health",
  ]);
  const hit = types.find((t) => !skip.has(t));
  if (!hit) return types[0]?.replace(/_/g, " ");
  return hit.replace(/_/g, " ");
}

// ---- deterministic simulation ------------------------------------------------

function simulatePlaceMatch(query: PlaceMatchQuery): PlaceMatch {
  const q = buildSearchQuery(query);
  const h = simpleHash(q.toLowerCase());
  const suburb = query.suburb?.trim() || "CBD";
  const region = query.region?.trim() || "NSW";
  const postcode = query.postcode?.trim() || "2000";
  const streetNo = 10 + (h % 180);
  const category = CATEGORY_BY_HASH[h % CATEGORY_BY_HASH.length];

  return {
    placeId: `sim_place_${h.toString(16)}`,
    name: query.name.trim(),
    formattedAddress: `${streetNo} Example St, ${suburb} ${region} ${postcode}, Australia`,
    phone: `+61 2 ${9000 + (h % 999)} ${1000 + (h % 8999)}`,
    website: `https://${query.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
    types: [category.toLowerCase().replace(/\s+/g, "_"), "establishment", "point_of_interest"],
    category,
    latitude: -33.86 + (h % 100) / 1000,
    longitude: 151.2 + (h % 100) / 1000,
    openingHoursText: [
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: 9:00 AM – 5:00 PM",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 5:00 PM",
      "Friday: 9:00 AM – 5:00 PM",
      "Saturday: 10:00 AM – 2:00 PM",
      "Sunday: Closed",
    ],
    mode: "simulated",
  };
}

// ---- live Google Places API --------------------------------------------------

interface PlacesTextSearchResponse {
  status?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
}

interface PlacesDetailsResponse {
  status?: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    website?: string;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number } };
    opening_hours?: { weekday_text?: string[] };
  };
}

async function googlePlacesFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  if (!placesEnrichmentConfigured()) return null;
  const key = placesApiKey();
  if (!key) return null;

  const qs = new URLSearchParams({ ...params, key });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/${path}?${qs}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapDetailsToMatch(details: PlacesDetailsResponse["result"]): PlaceMatch | null {
  if (!details?.place_id || !details.name || !details.formatted_address) return null;
  const types = details.types;
  return {
    placeId: details.place_id,
    name: details.name,
    formattedAddress: details.formatted_address,
    phone: details.formatted_phone_number,
    website: details.website,
    types,
    category: primaryCategory(types),
    latitude: details.geometry?.location?.lat,
    longitude: details.geometry?.location?.lng,
    openingHoursText: details.opening_hours?.weekday_text,
    mode: "live",
  };
}

async function matchPlaceLive(query: PlaceMatchQuery): Promise<PlaceMatch | null> {
  const text = buildSearchQuery(query);
  if (!text) return null;

  const search = await googlePlacesFetch<PlacesTextSearchResponse>("textsearch/json", {
    query: text,
  });
  if (search?.status !== "OK" || !search.results?.length) return null;

  const top = search.results[0];
  if (!top?.place_id) return null;

  const details = await googlePlacesFetch<PlacesDetailsResponse>("details/json", {
    place_id: top.place_id,
    fields:
      "place_id,name,formatted_address,formatted_phone_number,website,opening_hours,types,geometry",
  });
  if (details?.status === "OK" && details.result) {
    return mapDetailsToMatch(details.result);
  }

  if (top.place_id && top.name && top.formatted_address) {
    return {
      placeId: top.place_id,
      name: top.name,
      formattedAddress: top.formatted_address,
      types: top.types,
      category: primaryCategory(top.types),
      latitude: top.geometry?.location?.lat,
      longitude: top.geometry?.location?.lng,
      mode: "live",
    };
  }

  return null;
}

// ---- public API --------------------------------------------------------------

/** Match a business by name + optional suburb/region. Read-only lookup. */
export async function matchPlace(query: PlaceMatchQuery): Promise<PlaceMatch | null> {
  const name = query.name?.trim();
  if (!name) return null;

  if (placesEnrichmentLive()) {
    try {
      const live = await matchPlaceLive({ ...query, name });
      if (live) return live;
    } catch {
      /* fall through to simulated */
    }
  }

  return simulatePlaceMatch({ ...query, name });
}

function simulatePlaceSuggestions(query: string): PlaceSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const h = simpleHash(q.toLowerCase());
  const suburbs = ["Surry Hills", "Fitzroy", "West End", "Newtown", "Paddington"];
  return [0, 1, 2].map((i) => {
    const suburb = suburbs[(h + i) % suburbs.length];
    const streetNo = 10 + ((h + i * 17) % 180);
    const placeId = `sim_place_${(h + i).toString(16)}`;
    return {
      placeId,
      primaryText: i === 0 ? q : `${q} (${suburb})`,
      secondaryText: `${streetNo} Example St, ${suburb} NSW ${2000 + (i % 80)}, Australia`,
      mode: "simulated" as const,
    };
  });
}

async function searchPlacesLive(query: string): Promise<PlaceSuggestion[]> {
  const search = await googlePlacesFetch<PlacesTextSearchResponse>("textsearch/json", {
    query,
  });
  if (search?.status !== "OK" || !search.results?.length) return [];
  return search.results.slice(0, 6).flatMap((r) => {
    if (!r.place_id || !r.name) return [];
    return [
      {
        placeId: r.place_id,
        primaryText: r.name,
        secondaryText: r.formatted_address ?? "",
        mode: "live" as const,
      },
    ];
  });
}

/**
 * Autocomplete-style place search for Business info.
 * Live Places only when enrichment is production-gated; otherwise simulated.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  if (placesEnrichmentLive()) {
    try {
      const live = await searchPlacesLive(q);
      if (live.length) return live;
    } catch {
      /* fall through */
    }
  }

  return simulatePlaceSuggestions(q);
}

async function getPlaceDetailsLive(placeId: string): Promise<PlaceMatch | null> {
  const details = await googlePlacesFetch<PlacesDetailsResponse>("details/json", {
    place_id: placeId,
    fields:
      "place_id,name,formatted_address,formatted_phone_number,website,opening_hours,types,geometry",
  });
  if (details?.status === "OK" && details.result) {
    return mapDetailsToMatch(details.result);
  }
  return null;
}

function simulatePlaceFromId(placeId: string, hintName?: string): PlaceMatch {
  const h = simpleHash(placeId.toLowerCase());
  const suburbs = ["Surry Hills", "Fitzroy", "West End", "Newtown", "Paddington"];
  const suburb = suburbs[h % suburbs.length];
  const streetNo = 10 + (h % 180);
  const name = hintName?.trim() || "Local business";
  return {
    placeId,
    name,
    formattedAddress: `${streetNo} Example St, ${suburb} NSW ${2000 + (h % 80)}, Australia`,
    phone: `+61 2 ${9000 + (h % 999)} ${1000 + (h % 8999)}`,
    website: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "business"}.example`,
    types: ["restaurant", "establishment", "point_of_interest"],
    category: "Restaurant",
    latitude: -33.86 + (h % 100) / 1000,
    longitude: 151.2 + (h % 100) / 1000,
    openingHoursText: [
      "Monday: 5:00 – 10:00 PM",
      "Tuesday: 5:00 – 10:00 PM",
      "Wednesday: 5:00 – 10:00 PM",
      "Thursday: 5:00 – 10:00 PM",
      "Friday: 5:00 – 11:00 PM",
      "Saturday: 5:00 – 11:00 PM",
      "Sunday: 5:00 – 9:30 PM",
    ],
    mode: "simulated",
  };
}

/** Resolve a place id to full details (live or simulated). */
export async function getPlaceDetails(
  placeId: string,
  hintName?: string,
): Promise<PlaceMatch | null> {
  const id = placeId.trim();
  if (!id) return null;

  if (placesEnrichmentLive() && !id.startsWith("sim_place_")) {
    try {
      const live = await getPlaceDetailsLive(id);
      if (live) return live;
    } catch {
      /* fall through */
    }
  }

  return simulatePlaceFromId(id, hintName);
}

/** Map a Places match into onboarding extract / profile hint fields. */
export function placeMatchToExtractedHints(match: PlaceMatch): PlaceExtractedHints {
  const suburb =
    match.formattedAddress.split(",")[1]?.trim() ||
    match.formattedAddress.split(" ")[0];

  const hints: PlaceExtractedHints = {
    legalName: match.name,
    tradingNames: match.name,
    website: match.website,
    industry: match.category,
    serviceAreas: suburb ? [suburb] : undefined,
    googlePlaceId: match.placeId,
    businessAddress: match.formattedAddress,
  };

  if (match.openingHoursText?.length) {
    hints.tradingHours = match.openingHoursText.join("; ");
  }

  return hints;
}

/** Profile fields filled when a client picks a Places suggestion. */
export function placeMatchToProfilePatch(
  match: PlaceMatch,
): Partial<
  Pick<
    CompanyProfile,
    | "businessAddress"
    | "phone"
    | "website"
    | "tradingHours"
    | "googlePlaceId"
    | "latitude"
    | "longitude"
    | "placeCategory"
    | "serviceAreas"
    | "structuredAddress"
    | "structuredPhone"
    | "structuredHours"
  >
> {
  const suburb =
    match.formattedAddress.split(",")[1]?.trim().replace(/\s+[A-Z]{2,3}\s+\d{4}.*$/, "").trim() ||
    undefined;
  const tradingHours = match.openingHoursText?.length
    ? match.openingHoursText.join("; ")
    : undefined;
  return {
    businessAddress: match.formattedAddress,
    phone: match.phone,
    website: match.website,
    tradingHours,
    googlePlaceId: match.placeId,
    latitude: match.latitude,
    longitude: match.longitude,
    placeCategory: match.category,
    structuredAddress: parseAddressText(match.formattedAddress, "AU"),
    structuredPhone: match.phone ? parsePhoneText(match.phone) : undefined,
    structuredHours: tradingHours
      ? parseTradingHoursText(tradingHours)
      : undefined,
    ...(suburb ? { serviceAreas: [suburb] } : {}),
  };
}
