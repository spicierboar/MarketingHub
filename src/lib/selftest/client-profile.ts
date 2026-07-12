// Self-tests: client profile edit whitelist (ABN / legal name / strategy locked).
// Wave A — portal may only patch contact/hours. ABN is never a unique company key.

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
    website: "https://harbour.example",
    approvalContact: "owner@harbour.example",
    tradingHours: "Mon–Fri 7–3",
    serviceAreas: ["Harbour"],
    services: ["Coffee"],
    callsToAction: ["Book a table"],
    brandVoice: "Warm and local",
    prohibitedClaims: ["Cures disease"],
    approvedClaims: ["Fresh roast"],
    requiredDisclaimers: [],
  };
}

/** Contact/hours update; ABN / legal name / Brand Brain stay locked. */
export function checkClientProfileLocksAbnAndLegalName(): {
  ok: boolean;
  detail: string;
} {
  const profile = baseProfile();
  const next = applyClientProfilePatch(profile, {
    website: "https://new.example",
    tradingHours: "Sat–Sun 8–2",
  });
  const ok =
    next.abn === "51 824 753 556" &&
    next.legalName === "Harbour Roasters Pty Ltd" &&
    next.googlePlaceId === "place_locked" &&
    next.businessType === "restaurant_cafe" &&
    next.website === "https://new.example" &&
    next.tradingHours === "Sat–Sun 8–2" &&
    next.tradingNames === "Harbour Roasters" &&
    next.brandVoice === "Warm and local" &&
    next.prohibitedClaims[0] === "Cures disease";
  return {
    ok,
    detail: `abn=${next.abn} legal=${next.legalName} website=${next.website}`,
  };
}

/** Form parser never maps abn/legalName/strategy into the editable patch. */
export function checkClientProfileFormIgnoresAbn(): {
  ok: boolean;
  detail: string;
} {
  const values: Record<string, string> = {
    displayName: "Demo Cafe",
    website: "https://demo.example",
    approvalContact: "hi@demo.example",
    tradingHours: "Daily 9–5",
    tradingNames: "Should Ignore",
    abn: "99 999 999 999",
    legalName: "Should Not Apply Pty Ltd",
    brandVoice: "Should Ignore",
    serviceAreas: "Sydney",
  };
  const patch = clientProfilePatchFromForm((k) => values[k] ?? "");
  const hasAbn = Object.prototype.hasOwnProperty.call(patch, "abn");
  const hasLegal = Object.prototype.hasOwnProperty.call(patch, "legalName");
  const hasTrading = Object.prototype.hasOwnProperty.call(patch, "tradingNames");
  const hasVoice = Object.prototype.hasOwnProperty.call(patch, "brandVoice");
  const ok =
    !hasAbn &&
    !hasLegal &&
    !hasTrading &&
    !hasVoice &&
    patch.displayName === "Demo Cafe" &&
    patch.website === "https://demo.example" &&
    patch.approvalContact === "hi@demo.example";
  return {
    ok,
    detail: `hasAbn=${hasAbn} hasLegal=${hasLegal} website=${patch.website}`,
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
      website: "https://a.example",
    },
    { website: "https://site-a.example" },
  );
  const b = applyClientProfilePatch(
    {
      ...baseProfile(),
      abn: sharedAbn,
      website: "https://b.example",
      serviceAreas: ["Bondi"],
    },
    { website: "https://site-b.example" },
  );
  const aWeb = a.website ?? "";
  const bWeb = b.website ?? "";
  const ok =
    a.abn === sharedAbn &&
    b.abn === sharedAbn &&
    aWeb === "https://site-a.example" &&
    bWeb === "https://site-b.example";
  return {
    ok,
    detail: `sharedAbn=${sharedAbn} a=${a.website} b=${b.website}`,
  };
}
