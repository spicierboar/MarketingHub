// Self-tests: client profile edit whitelist (ABN / legal name locked).
// ABN is never a unique company key — one ABN may appear on many companies.

import {
  applyClientProfilePatch,
  clientProfilePatchFromForm,
} from "@/lib/client-profile-edit";
import type { CompanyProfile } from "@/lib/types";

function baseProfile(): CompanyProfile {
  return {
    abn: "51 824 753 556",
    legalName: "Harbour Roasters Pty Ltd",
    googlePlaceId: "place_locked",
    businessType: "restaurant_cafe",
    tradingNames: "Harbour Roasters",
    serviceAreas: ["Harbour"],
    services: ["Coffee"],
    callsToAction: ["Book a table"],
    prohibitedClaims: ["Cures disease"],
    approvedClaims: ["Fresh roast"],
    requiredDisclaimers: [],
  };
}

/** Editable fields update; ABN / legal name / place id / claims stay locked. */
export function checkClientProfileLocksAbnAndLegalName(): {
  ok: boolean;
  detail: string;
} {
  const profile = baseProfile();
  const next = applyClientProfilePatch(profile, {
    tradingNames: "New Trading",
    serviceAreas: ["Bondi"],
  });
  const ok =
    next.abn === "51 824 753 556" &&
    next.legalName === "Harbour Roasters Pty Ltd" &&
    next.googlePlaceId === "place_locked" &&
    next.businessType === "restaurant_cafe" &&
    next.tradingNames === "New Trading" &&
    next.serviceAreas[0] === "Bondi" &&
    next.prohibitedClaims[0] === "Cures disease";
  return {
    ok,
    detail: `abn=${next.abn} legal=${next.legalName} trading=${next.tradingNames}`,
  };
}

/** Form parser never maps abn/legalName into the editable patch. */
export function checkClientProfileFormIgnoresAbn(): {
  ok: boolean;
  detail: string;
} {
  const values: Record<string, string> = {
    displayName: "Demo Cafe",
    tradingNames: "Demo",
    abn: "99 999 999 999",
    legalName: "Should Not Apply Pty Ltd",
    serviceAreas: "Sydney",
    services: "Brunch",
    callsToAction: "Book",
  };
  const patch = clientProfilePatchFromForm((k) => values[k] ?? "");
  const hasAbn = Object.prototype.hasOwnProperty.call(patch, "abn");
  const hasLegal = Object.prototype.hasOwnProperty.call(patch, "legalName");
  const ok =
    !hasAbn &&
    !hasLegal &&
    patch.displayName === "Demo Cafe" &&
    patch.tradingNames === "Demo" &&
    (patch.serviceAreas ?? [])[0] === "Sydney";
  return {
    ok,
    detail: `hasAbn=${hasAbn} hasLegal=${hasLegal} areas=${patch.serviceAreas?.join(",")}`,
  };
}

/** Two companies may share the same ABN (never a unique key). */
export function checkAbnNotUniqueAcrossCompanies(): {
  ok: boolean;
  detail: string;
} {
  const sharedAbn = "51 824 753 556";
  const a = applyClientProfilePatch(
    {
      ...baseProfile(),
      abn: sharedAbn,
      tradingNames: "Site A",
    },
    { tradingNames: "Site A Cafe" },
  );
  const b = applyClientProfilePatch(
    {
      ...baseProfile(),
      abn: sharedAbn,
      tradingNames: "Site B",
      serviceAreas: ["Bondi"],
    },
    { tradingNames: "Site B Bar" },
  );
  const ok =
    a.abn === sharedAbn &&
    b.abn === sharedAbn &&
    a.tradingNames === "Site A Cafe" &&
    b.tradingNames === "Site B Bar" &&
    a.tradingNames !== b.tradingNames;
  return {
    ok,
    detail: `sharedAbn=${sharedAbn} a=${a.tradingNames} b=${b.tradingNames}`,
  };
}
