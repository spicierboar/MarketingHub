// Google Places read-only enrichment for onboarding pre-fill.
// Find Place / Text Search + Details — NO GBP OAuth, NO publish, no *_LIVE
// flips for ads or publishing. Deterministic simulation when API key unset.

import { appEnv } from "@/lib/env";
import type { AutoOnboardingExtractedFields } from "@/lib/auto-onboarding";
import type { CompanyProfile } from "@/lib/types";

// ---- types -------------------------------------------------------------------

export interface PlaceMatchQuery {
  name: string;
  suburb?: string;
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

export type PlaceExtractedHints = Partial<AutoOnboardingExtractedFields> &
  Pick<Partial<CompanyProfile>, "googlePlaceId" | "tradingHours">;

// ---- env gate ----------------------------------------------------------------

function placesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.PLACES_API_KEY?.trim() ||
    undefined
  );
}

/** True when a Google Places API key is configured. */
export function placesEnrichmentConfigured(): boolean {
  return !!placesApiKey();
}

function placesEnrichmentLive(): boolean {
  if (!placesEnrichmentConfigured()) return false;
  const env = appEnv();
  if (env === "development" || env === "staging") return true;
  return process.env.PLACES_ENRICHMENT_LIVE === "true";
}

// ---- helpers -----------------------------------------------------------------

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildSearchQuery(query: PlaceMatchQuery): string {
  return [query.name, query.suburb, query.region].filter(Boolean).join(", ").trim();
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
  const streetNo = 10 + (h % 180);
  const category = CATEGORY_BY_HASH[h % CATEGORY_BY_HASH.length];

  return {
    placeId: `sim_place_${h.toString(16)}`,
    name: query.name.trim(),
    formattedAddress: `${streetNo} Example St, ${suburb} ${region} 2000, Australia`,
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
  };

  if (match.openingHoursText?.length) {
    hints.tradingHours = match.openingHoursText.join("; ");
  }

  return hints;
}
