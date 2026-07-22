"use server";

import { requireUserRaw } from "@/lib/auth/rbac";
import {
  getPlaceDetails,
  searchPlaces,
  type PlaceMatch,
  type PlaceSuggestion,
} from "@/lib/places-enrichment";

/**
 * Places autocomplete for Business info — portal, self-serve onboarding,
 * and field-sales. Simulated on staging; live only when Places enrichment is on.
 */
export async function searchBusinessPlacesAction(
  query: string,
): Promise<PlaceSuggestion[]> {
  await requireUserRaw();
  return searchPlaces(query);
}

export async function resolvePlaceDetailsAction(
  placeId: string,
  hintName?: string,
): Promise<PlaceMatch | null> {
  await requireUserRaw();
  return getPlaceDetails(placeId, hintName);
}
