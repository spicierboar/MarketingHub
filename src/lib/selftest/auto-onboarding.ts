// Self-test helpers for V1 auto-onboarding (Module 13).

import {
  applyExtractedFields,
  assertScrapeConsent,
  autoOnboardingLive,
  parseHtmlForOnboarding,
  scrapeForOnboardingPreview,
  type AutoOnboardingFieldKey,
} from "@/lib/auto-onboarding";
import type { Company } from "@/lib/types";

/** Fixture HTML with schema.org LocalBusiness + nav + footer social (no network). */
export const SCHEMA_FIXTURE_HTML = `<!DOCTYPE html>
<html><head>
  <meta property="og:site_name" content="Harbour Roasters">
  <meta property="og:title" content="Harbour Roasters — Cafe &amp; Restaurant">
  <meta property="og:description" content="Specialty coffee in Harbour precinct.">
  <meta property="og:image" content="https://harbourroasters.example/logo.png">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "Harbour Roasters",
    "description": "Specialty coffee roastery and cafe.",
    "telephone": "+61 2 5555 0100",
    "email": "hello@harbourroasters.example",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Harbour precinct"
    },
    "sameAs": [
      "https://instagram.com/harbourroasters",
      "https://facebook.com/harbourroasters"
    ]
  }
  </script>
</head><body>
  <nav class="menu"><a href="/espresso">Espresso</a><a href="/brunch">Weekend Brunch</a></nav>
  <footer><a href="https://instagram.com/harbourroasters">Instagram</a></footer>
  <a href="tel:+61255550100">Call</a>
  <a href="mailto:hello@harbourroasters.example">Email</a>
</body></html>`;

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

export async function checkSchemaOrgExtraction(): Promise<{ ok: boolean; detail: string }> {
  const parsed = parseHtmlForOnboarding(
    SCHEMA_FIXTURE_HTML,
    "https://harbourroasters.example",
  );
  const ok =
    parsed.schemaName === "Harbour Roasters" &&
    parsed.schemaDescription?.includes("Specialty coffee") === true &&
    parsed.schemaLocality === "Harbour precinct" &&
    parsed.schemaTelephone === "+61 2 5555 0100" &&
    parsed.schemaEmail === "hello@harbourroasters.example" &&
    parsed.meta["og:site_name"] === "Harbour Roasters" &&
    parsed.navServices.includes("Espresso") &&
    parsed.logoUrl?.includes("logo.png") === true;
  return {
    ok,
    detail: `name=${parsed.schemaName} locality=${parsed.schemaLocality} nav=${parsed.navServices.length}`,
  };
}

export async function checkSocialSameAsDetection(): Promise<{ ok: boolean; detail: string }> {
  const parsed = parseHtmlForOnboarding(
    SCHEMA_FIXTURE_HTML,
    "https://harbourroasters.example",
  );
  const platforms = parsed.socialLinks.map((l) => l.platform).sort();
  const ok =
    parsed.schemaSameAs.length >= 2 &&
    platforms.includes("facebook") &&
    platforms.includes("instagram");
  return {
    ok,
    detail: `sameAs=${parsed.schemaSameAs.length} platforms=${platforms.join(",")}`,
  };
}

export async function checkSchemaSimulatedScrape(): Promise<{ ok: boolean; detail: string }> {
  const company = stubAutoOnboardCompany();
  const preview = await scrapeForOnboardingPreview({
    company,
    consent: true,
    urls: {
      website: "https://harbourroasters.example",
      socialLinks: [],
    },
  });

  const trading = preview.fields.find((f) => f.key === "tradingNames");
  const areas = preview.fields.find((f) => f.key === "serviceAreas");
  const services = preview.fields.find((f) => f.key === "services");
  const industry = preview.fields.find((f) => f.key === "industry");
  const websiteSource = preview.sources.find((s) => s.kind === "website");

  const ok =
    preview.mode === "simulated" &&
    trading?.value === "Harbour Roasters" &&
    trading?.confidence === "high" &&
    areas?.value.includes("Harbour precinct") === true &&
    areas?.confidence === "high" &&
    services?.value.includes("Espresso") === true &&
    industry?.value.includes("Cafe") === true &&
    (websiteSource?.snippet.includes("Logo URL:") === true ||
      websiteSource?.snippet.includes("Telephone:") === true);

  return {
    ok,
    detail: `trading=${trading?.value}@${trading?.confidence} areas=${areas?.value} services=${services?.value}`,
  };
}
