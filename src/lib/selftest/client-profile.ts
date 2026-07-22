// Self-tests: client profile edit whitelist (ABN / legal name / strategy locked).
// Wave A — portal may only patch contact/hours.
// ABN alone is not unique; identity duplicate checks use
// (business name + ABN + postcode) — see company-identity.ts.

import {
  applyClientProfilePatch,
  clientProfilePatchFromForm,
} from "@/lib/client-profile-edit";
import {
  findDuplicateByNameAndAbn,
  normalizeAbnDigits,
  normalizeBusinessName,
  normalizePostcode,
  parseAbnInput,
} from "@/lib/company-identity";
import type { Company, CompanyProfile } from "@/lib/types";

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
    structuredAddress: {
      countryCode: "AU",
      postcode: "2000",
      suburb: "Sydney",
      streetNumber: "1",
      streetName: "Harbour",
      streetType: "St",
    },
  };
}

function stubCompany(
  id: string,
  name: string,
  abn: string,
  postcode = "2000",
  status: Company["status"] = "approved",
): Company {
  return {
    id,
    tenantId: "t1",
    name,
    status,
    profile: {
      ...baseProfile(),
      abn,
      structuredAddress: {
        ...baseProfile().structuredAddress!,
        postcode,
      },
    },
    documents: [],
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
    phone: "02 9000 1111",
    businessAddress: "1 Demo St, Sydney NSW 2000",
    googlePlaceId: "place_from_picker",
    latitude: "-33.86",
    longitude: "151.21",
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
    patch.approvalContact === "hi@demo.example" &&
    patch.phone === "02 9000 1111" &&
    patch.businessAddress === "1 Demo St, Sydney NSW 2000" &&
    patch.googlePlaceId === "place_from_picker" &&
    patch.latitude === -33.86 &&
    patch.longitude === 151.21 &&
    patch.serviceAreas?.[0] === "Sydney";
  return {
    ok,
    detail: `hasAbn=${hasAbn} hasLegal=${hasLegal} website=${patch.website} place=${patch.googlePlaceId}`,
  };
}

/** Two companies may share the same ABN when business names differ. */
export function checkAbnNotUniqueAcrossCompanies(): {
  ok: boolean;
  detail: string;
} {
  const sharedAbn = "51 824 753 556";
  const companies = [
    stubCompany("c1", "Harbour Roasters", sharedAbn, "2000"),
    stubCompany("c2", "Harbour Wholesale", sharedAbn, "2000"),
  ];
  const sameNameDup = findDuplicateByNameAndAbn(
    companies,
    "Harbour Roasters",
    sharedAbn,
    "2000",
  );
  const differentNameOk = findDuplicateByNameAndAbn(
    companies,
    "Harbour Events",
    sharedAbn,
    "2000",
  );
  const ok =
    !!sameNameDup &&
    sameNameDup.company.id === "c1" &&
    differentNameOk === null &&
    normalizeAbnDigits(sharedAbn) === "51824753556" &&
    normalizeBusinessName("  Harbour   Roasters ") === "harbour roasters";
  return {
    ok,
    detail: `dup=${sameNameDup?.company.id ?? "none"} differentName=${differentNameOk === null}`,
  };
}

/** Same name + ABN + postcode is a duplicate; different postcode is allowed. */
export function checkNameAbnIdentityDuplicate(): {
  ok: boolean;
  detail: string;
} {
  const companies = [stubCompany("c1", "Viya Imports", "51 824 753 556", "2000")];
  const hit = findDuplicateByNameAndAbn(
    companies,
    "viya   imports",
    "51824753556",
    "2000",
  );
  const otherPostcodeOk = findDuplicateByNameAndAbn(
    companies,
    "Viya Imports",
    "51 824 753 556",
    "3000",
  );
  const excludeSelf = findDuplicateByNameAndAbn(
    companies,
    "Viya Imports",
    "51 824 753 556",
    "2000",
    { excludeCompanyId: "c1" },
  );
  const parsed = parseAbnInput("51 824 753 556");
  const bad = parseAbnInput("12345");
  const ok =
    !!hit &&
    hit.company.id === "c1" &&
    otherPostcodeOk === null &&
    excludeSelf === null &&
    parsed.ok &&
    parsed.abn === "51 824 753 556" &&
    !bad.ok &&
    normalizePostcode(" 2000 ") === "2000";
  return {
    ok,
    detail: `hit=${hit?.company.id ?? "none"} otherPc=${otherPostcodeOk === null} exclude=${excludeSelf === null} parsed=${parsed.ok}`,
  };
}
