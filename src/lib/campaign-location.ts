// Location context from company profile for AI campaigns and insights.
// Prefers Places-backed address + lat/lng when present.

import type { CompanyProfile } from "@/lib/types";

/** Human-readable location lines for prompts, seasonal inputs, and reports. */
export function campaignLocationLines(profile: CompanyProfile): string[] {
  const lines: string[] = [];
  const address = profile.businessAddress?.trim();
  if (address) lines.push(`Business address: ${address}`);

  const areas = (profile.serviceAreas ?? []).map((s) => s.trim()).filter(Boolean);
  if (areas.length) lines.push(`Service areas: ${areas.join("; ")}`);

  if (
    typeof profile.latitude === "number" &&
    typeof profile.longitude === "number" &&
    Number.isFinite(profile.latitude) &&
    Number.isFinite(profile.longitude)
  ) {
    lines.push(
      `Map pin: ${profile.latitude.toFixed(5)}, ${profile.longitude.toFixed(5)}`,
    );
  }

  const phone = profile.phone?.trim();
  if (phone) lines.push(`Public phone: ${phone}`);

  const hours = profile.tradingHours?.trim();
  if (hours) lines.push(`Trading hours: ${hours}`);

  const category = profile.placeCategory?.trim();
  if (category) lines.push(`Place category: ${category}`);

  const placeId = profile.googlePlaceId?.trim();
  if (placeId) lines.push(`Google Place ID: ${placeId}`);

  const notes = profile.localMarketNotes?.trim();
  if (notes) lines.push(`Local market notes: ${notes}`);

  return lines;
}

/** Compact single string for seasonal / brief injection. */
export function campaignLocationBrief(profile: CompanyProfile): string | undefined {
  const lines = campaignLocationLines(profile);
  return lines.length ? lines.join(" · ") : undefined;
}
