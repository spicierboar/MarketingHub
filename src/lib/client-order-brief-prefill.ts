// Prefill Extras order brief fields from a company's Business info / profile
// so clients don't retype known facts. Pure and read-only — never invents
// prices, offers, or claims; simply omits anything the profile lacks.

import type { Company } from "@/lib/types";
import type { OrderBriefFieldId } from "@/lib/client-order-brief";
import {
  formatStructuredAddress,
  formatStructuredHours,
  formatStructuredPhone,
} from "@/lib/business-info/format";

/** Plain-text seed per brief field — client can edit or clear any of it. */
export type OrderBriefPrefill = Partial<Record<OrderBriefFieldId, string>>;

/**
 * Build brief prefill values from company profile facts.
 * Only touches free-text fields (mustIncludeFacts, audienceNotes, roleLocation)
 * — never sets audience/tone/cta/timing or other choice fields, since those
 * are a judgement call for the client, not a known fact.
 */
export function buildOrderBriefPrefill(
  company: Pick<Company, "name" | "profile"> | undefined,
): OrderBriefPrefill {
  const prefill: OrderBriefPrefill = {};
  if (!company) return prefill;

  const profile = company.profile;
  const name = company.name?.trim();
  const suburb = profile.structuredAddress?.suburb?.trim();
  const postcode = profile.structuredAddress?.postcode?.trim();
  const location = [suburb, postcode].filter(Boolean).join(" ");

  const address = profile.structuredAddress
    ? formatStructuredAddress(profile.structuredAddress)
    : profile.businessAddress?.trim();
  const phone = profile.structuredPhone
    ? formatStructuredPhone(profile.structuredPhone)
    : profile.phone?.trim();
  const hours = profile.structuredHours
    ? formatStructuredHours(profile.structuredHours)
    : profile.tradingHours?.trim();
  const website = profile.website?.trim();

  const factLines: string[] = [];
  if (name) factLines.push(`Business name: ${name}`);
  if (address) factLines.push(`Location: ${address}`);
  else if (location) factLines.push(`Location: ${location}`);
  if (phone) factLines.push(`Phone: ${phone}`);
  if (website) factLines.push(`Website: ${website}`);
  if (hours) factLines.push(`Hours: ${hours}`);
  if (factLines.length) prefill.mustIncludeFacts = factLines.join("\n");

  if (location) prefill.audienceNotes = `Customers near ${location}`;

  // Job ads / vacancies ask for "Location & work pattern" — seed the location
  // half only; work pattern is order-specific and shouldn't be guessed.
  if (suburb) prefill.roleLocation = suburb;

  return prefill;
}
