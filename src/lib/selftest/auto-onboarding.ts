// Self-test helpers for V1 auto-onboarding (Module 13).

import {
  applyExtractedFields,
  assertScrapeConsent,
  autoOnboardingLive,
  scrapeForOnboardingPreview,
  type AutoOnboardingFieldKey,
} from "@/lib/auto-onboarding";
import type { Company } from "@/lib/types";

export function stubAutoOnboardCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_auto_onboard_stub",
    tenantId: "tn_auto_stub",
    name: "Harbour Roasters",
    status: "pending_review",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      serviceAreas: [],
      services: [],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkConsentRequired(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAutoOnboardCompany();
  let threw = false;
  try {
    assertScrapeConsent(false);
  } catch (e) {
    threw = e instanceof Error && e.message.includes("consent");
  }
  let scrapeThrew = false;
  try {
    await scrapeForOnboardingPreview({
      company,
      consent: false,
      urls: { website: "https://harbourroasters.example", socialLinks: [] },
    });
  } catch {
    scrapeThrew = true;
  }
  const ok = threw && scrapeThrew;
  return { ok, detail: `assert=${threw} scrape=${scrapeThrew}` };
}

export async function checkSimulatedWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const live = autoOnboardingLive();
  const company = stubAutoOnboardCompany();
  const preview = await scrapeForOnboardingPreview({
    company,
    consent: true,
    urls: {
      website: "https://harbourroasters.example",
      socialLinks: [
        { platform: "instagram", url: "https://instagram.com/harbourroasters" },
      ],
    },
  });
  const ok =
    !live &&
    preview.mode === "simulated" &&
    preview.fields.length >= 6 &&
    preview.sources.length === 2;
  return {
    ok,
    detail: `live=${live} mode=${preview.mode} fields=${preview.fields.length} sources=${preview.sources.length}`,
  };
}

export async function checkApplyPrefillsProfile(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAutoOnboardCompany();
  const preview = await scrapeForOnboardingPreview({
    company,
    consent: true,
    urls: {
      website: "https://harbourroasters.example",
      socialLinks: [],
    },
  });

  const keys = preview.fields.map((f) => f.key) as AutoOnboardingFieldKey[];

  const merged = applyExtractedFields(
    company.profile,
    {
      legalName: preview.fields.find((f) => f.key === "legalName")?.value,
      tradingNames: preview.fields.find((f) => f.key === "tradingNames")?.value,
      industry: preview.fields.find((f) => f.key === "industry")?.value,
      website: preview.urls.website,
      natureOfBusiness: preview.fields.find((f) => f.key === "natureOfBusiness")?.value,
      serviceAreas: preview.fields
        .find((f) => f.key === "serviceAreas")
        ?.value.split(/,\s*/),
      services: preview.fields.find((f) => f.key === "services")?.value.split(/,\s*/),
      targetCustomers: preview.fields.find((f) => f.key === "targetCustomers")?.value,
      brandVoice: preview.fields.find((f) => f.key === "brandVoice")?.value,
      callsToAction: preview.fields
        .find((f) => f.key === "callsToAction")
        ?.value.split(/\s*·\s*/),
    },
    keys.filter((k) => k !== "socialLinks"),
  );

  const ok =
    keys.length >= 6 &&
    !!merged.natureOfBusiness?.trim() &&
    merged.serviceAreas.length > 0 &&
    merged.services.length > 0 &&
    merged.website === preview.urls.website;

  return {
    ok,
    detail: `keys=${keys.length} nature=${!!merged.natureOfBusiness} areas=${merged.serviceAreas.length}`,
  };
}
