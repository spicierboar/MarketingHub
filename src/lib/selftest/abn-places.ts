// Self-test helpers for ABN lookup + Google Places enrichment (signup pre-fill).

import {
  abnLookupConfigured,
  abnResultToProfilePatch,
  businessNameMatchesAbrNames,
  isAbnLookupLive,
  lookupAbn,
  normalizeNameForAbrMatch,
  verifyBusinessNameAgainstAbr,
} from "@/lib/abn-lookup";
import {
  matchPlace,
  placeMatchToExtractedHints,
  placesEnrichmentConfigured,
} from "@/lib/places-enrichment";

export async function checkAbnSimulatedWhenUnconfigured(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const configured = abnLookupConfigured();
  const byAbn = await lookupAbn("51824753556");
  const byName = await lookupAbn("Harbour Roasters");
  const ok =
    !configured &&
    !!byAbn &&
    byAbn.mode === "simulated" &&
    !!byAbn.legalName &&
    !!byName &&
    byName.mode === "simulated" &&
    byAbn.abn.includes("51");
  return {
    ok,
    detail: `configured=${configured} abnMode=${byAbn?.mode} nameMode=${byName?.mode}`,
  };
}

export async function checkAbnResultToProfilePatch(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const result = await lookupAbn("53004085616");
  if (!result) return { ok: false, detail: "lookup returned null" };
  const patch = abnResultToProfilePatch(result);
  const ok =
    patch.abn === result.abn &&
    patch.legalName === result.legalName &&
    !!patch.legalName?.includes("Riverside");
  return {
    ok,
    detail: `abn=${patch.abn} legal=${patch.legalName}`,
  };
}

/** Pure ABR name-match helpers (case / punctuation / Pty Ltd tolerant). */
export function checkAbrNameMatchingHelpers(): {
  ok: boolean;
  detail: string;
} {
  const normOk =
    normalizeNameForAbrMatch("  Harbour-Roasters,  Pty. Ltd. ") ===
    "harbour roasters";
  const entityMatch = businessNameMatchesAbrNames(
    "Harbour Roasters",
    "Harbour Roasters Pty Ltd",
    [],
  );
  const tradingMatch = businessNameMatchesAbrNames(
    "Grinders Coffee House",
    "COCA-COLA AMATIL (AUST) PTY LTD",
    ["AMATIL X", "Grinders Coffee House", "CAFE DIRECT"],
  );
  const mismatch = businessNameMatchesAbrNames(
    "Totally Unrelated Cafe",
    "Harbour Roasters Pty Ltd",
    ["Harbour Roasters"],
  );
  const ok =
    normOk &&
    entityMatch.match &&
    entityMatch.matchedAs === "entity" &&
    tradingMatch.match &&
    tradingMatch.matchedAs === "business_name" &&
    !mismatch.match;
  return {
    ok,
    detail: `norm=${normOk} entity=${entityMatch.matchedAs} trading=${tradingMatch.matchedAs} mismatch=${!mismatch.match}`,
  };
}

/** Soft-skip gate when ABR is not live (demos without GUID). */
export async function checkAbrIdentityGateSoftSkipsWhenNotLive(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const live = isAbnLookupLive();
  const gate = await verifyBusinessNameAgainstAbr(
    "Any Trading Name",
    "51 824 753 556",
  );
  if (live) {
    // Live env: don't assert skip; just ensure the call returns a shaped result.
    const shaped = gate.ok === true || (gate.ok === false && !!gate.error);
    return {
      ok: shaped,
      detail: `live=true ok=${gate.ok} mode=${gate.ok ? gate.mode : gate.code}`,
    };
  }
  const ok = gate.ok === true && gate.mode === "skipped" && !!gate.warning;
  return {
    ok,
    detail: `live=false ok=${gate.ok} mode=${gate.ok ? gate.mode : "err"} warn=${gate.ok ? !!gate.warning : false}`,
  };
}

export async function checkPlaceSimulatedWhenUnconfigured(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const configured = placesEnrichmentConfigured();
  const match = await matchPlace({
    name: "Harbour Roasters",
    suburb: "Darling Harbour",
    region: "NSW",
  });
  const ok =
    !configured &&
    !!match &&
    match.mode === "simulated" &&
    match.placeId.startsWith("sim_place_") &&
    !!match.formattedAddress &&
    (match.openingHoursText?.length ?? 0) >= 5;
  return {
    ok,
    detail: `configured=${configured} mode=${match?.mode} hours=${match?.openingHoursText?.length ?? 0}`,
  };
}

export async function checkPlaceMatchToExtractedHints(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const match = await matchPlace({
    name: "Riverside Kitchen",
    suburb: "Riverside",
    region: "QLD",
  });
  if (!match) return { ok: false, detail: "match returned null" };
  const hints = placeMatchToExtractedHints(match);
  const ok =
    hints.googlePlaceId === match.placeId &&
    hints.legalName === match.name &&
    !!hints.website &&
    !!hints.tradingHours &&
    (hints.serviceAreas?.length ?? 0) > 0;
  return {
    ok,
    detail: `placeId=${hints.googlePlaceId} areas=${hints.serviceAreas?.join(",")} hours=${!!hints.tradingHours}`,
  };
}
