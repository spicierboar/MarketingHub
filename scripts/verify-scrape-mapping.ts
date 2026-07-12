import {
  parseHtmlForOnboarding,
  scrapeForOnboardingPreview,
  autoOnboardingLive,
  stripUiChrome,
  filterServiceLabels,
  partitionServicesAndProductCategories,
  synthesizeNatureOfBusiness,
  synthesizeTargetCustomers,
  isWeakNatureText,
  isWeakTargetCustomers,
  isChromeServiceLabel,
  applyExtractedFields,
  extractedFromPreview,
  looksLikeSeoTagline,
  resolveTradingName,
} from "../src/lib/auto-onboarding";
import { suggestProfileFields } from "../src/lib/profile-suggestions";
import { inferBusinessTypeFromIndustry } from "../src/lib/business-profiles";
import {
  stubAutoOnboardCompany,
  checkSimulatedWhenLiveOff,
  checkSchemaOrgExtraction,
  checkSchemaSimulatedScrape,
  checkApplyPrefillsProfile,
} from "../src/lib/selftest/auto-onboarding";
import { enrichOnboardingPreview } from "../src/lib/ai/onboarding-enrich";

async function main() {
  let failed = 0;
  const assert = (label: string, ok: boolean, detail?: string) => {
    console.log(`${ok ? "OK" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
  };

  const sug = suggestProfileFields({
    businessType: "retail",
    companyName: "Viya Imports",
    industry: "Retail",
    areas: ["Northside"],
  });
  assert("no retail retailer", !/retail retailer/i.test(sug.natureOfBusiness), sug.natureOfBusiness);
  assert(
    "nature ends cleanly",
    /\.$/.test(sug.natureOfBusiness) && !/with friendly/i.test(sug.natureOfBusiness),
    sug.natureOfBusiness,
  );

  // Regression: area must not swallow "with friendly" from simulation fluff
  {
    const badAreaSug = suggestProfileFields({
      businessType: "retail",
      companyName: "Viya Imports",
      industry: "Retail",
      areas: ["Northside with friendly"],
    });
    assert("no retail retailer even with bad area", !/retail retailer/i.test(badAreaSug.natureOfBusiness));
  }

  // Chrome stripping + service filter unit checks
  {
    const dirty =
      "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia Toggle menu Welcome to Viya!";
    const cleaned = stripUiChrome(dirty);
    assert("chrome stripped toggle/welcome", !/toggle\s+menu|welcome\s+to/i.test(cleaned), cleaned);
    assert(
      "Register is chrome service",
      isChromeServiceLabel("Register") && isChromeServiceLabel("Cart"),
    );
    assert(
      "chrome filter keeps product labels",
      filterServiceLabels(["Register", "Rice", "Indian Snacks", "Cart", "Ready to use/Gravies"]).join(
        "|",
      ) === "Rice|Indian Snacks|Ready to use/Gravies",
    );
    const partitioned = partitionServicesAndProductCategories(
      ["Register", "Rice", "Indian Snacks", "Cart", "Ready to use/Gravies", "Oil / Ghee / Butter"],
      "Online Indian grocery store · Retail and Wholesale",
    );
    assert(
      "retail partition: categories not services",
      partitioned.services.every((s) => !/rice|snacks|gravies|ghee|oil/i.test(s)) &&
        partitioned.productCategories.includes("Rice") &&
        partitioned.productCategories.includes("Indian Snacks") &&
        partitioned.productCategories.some((c) => /gravies/i.test(c)),
      `services=${partitioned.services.join("|")} cats=${partitioned.productCategories.join("|")}`,
    );
    assert(
      "retail grocery suggest services are fulfilment",
      suggestProfileFields({
        businessType: "retail",
        companyName: "Viya Imports",
        industry: "Indian grocery retail",
        areas: ["Australia"],
      }).services.every((s) => !/rice|snacks|lentils/i.test(s)),
    );
    const nature = synthesizeNatureOfBusiness({
      title: dirty,
      tradingName: "Viya Imports",
      industry: "Indian grocery retail",
    });
    assert(
      "nature cleaned no chrome",
      !!nature &&
        !isWeakNatureText(nature) &&
        !/toggle|welcome to|delivering all over/i.test(nature!),
      nature,
    );
    assert("nature has grocery signal", !!nature && /grocery/i.test(nature!), nature);
    const audience = synthesizeTargetCustomers({
      natureOfBusiness: nature,
      industry: "Indian grocery retail",
      tradingName: "Viya Imports",
      serviceAreas: ["Australia"],
      title: dirty,
    });
    assert(
      "audience not tautological",
      !!audience && !isWeakTargetCustomers(audience) && !/need what .+ offers/i.test(audience!),
      audience,
    );
    assert(
      "audience diaspora/grocery",
      !!audience && /indian diaspora|indian groceries/i.test(audience!),
      audience,
    );
    assert(
      "grocery+imports → retail",
      inferBusinessTypeFromIndustry(
        "Online Indian Grocery Store · Viya Imports · Indian grocery retail",
      ) === "retail",
    );
    assert(
      "pure wholesale imports still other",
      inferBusinessTypeFromIndustry("Wholesale importer serving retailers") === "other",
    );
    const indianSug = suggestProfileFields({
      businessType: "retail",
      companyName: "Viya Imports",
      industry: "Indian grocery retail",
      areas: ["Australia"],
    });
    assert(
      "retail indian grocery audience",
      /indian diaspora/i.test(indianSug.targetCustomers),
      indianSug.targetCustomers,
    );
    assert(
      "indian grocery prohibited health claims",
      indianSug.prohibitedClaims.some((c) => /health|cures/i.test(c)),
      indianSug.prohibitedClaims.join(" | "),
    );
    assert(
      "indian grocery approved starters present",
      indianSug.approvedClaims.length > 0 &&
        indianSug.requiredDisclaimers.some((d) => /stocks?\s+last|labelled/i.test(d)),
      `approved=${indianSug.approvedClaims.join("|")} disc=${indianSug.requiredDisclaimers.join("|")}`,
    );
  }

  // Live gate: development should allow live without FETCH_KEY
  {
    const prevLive = process.env.AUTO_ONBOARDING_LIVE;
    const prevKey = process.env.AUTO_ONBOARDING_FETCH_KEY;
    delete process.env.AUTO_ONBOARDING_FETCH_KEY;
    delete process.env.AUTO_ONBOARDING_LIVE;
    assert("live on by default in non-prod (no fetch key)", autoOnboardingLive() === true);
    process.env.AUTO_ONBOARDING_LIVE = "false";
    assert("live can be forced off", autoOnboardingLive() === false);
    if (prevLive === undefined) delete process.env.AUTO_ONBOARDING_LIVE;
    else process.env.AUTO_ONBOARDING_LIVE = prevLive;
    if (prevKey === undefined) delete process.env.AUTO_ONBOARDING_FETCH_KEY;
    else process.env.AUTO_ONBOARDING_FETCH_KEY = prevKey;
  }

  const prev = process.env.AUTO_ONBOARDING_LIVE;
  process.env.AUTO_ONBOARDING_LIVE = "false";
  const company = stubAutoOnboardCompany({ name: "Viya Imports" });
  const preview = await scrapeForOnboardingPreview({
    company,
    consent: true,
    urls: { website: "https://viyaimports.example", socialLinks: [] },
  });
  const services = preview.fields.find((f) => f.key === "services");
  assert("soft sim mode", preview.mode === "simulated" && !autoOnboardingLive());
  assert(
    "soft sim no placeholder services",
    !/Consultation|Core service|Premium package/i.test(services?.value ?? ""),
    services?.value ?? "(none)",
  );

  // Viya-like HTML: title tagline + nav chrome + product categories + socials in header/footer
  const viyaHtml = `<!DOCTYPE html><html><head>
    <meta property="og:site_name" content="Viya Imports">
    <meta property="og:title" content="Online Indian Grocery Store in Australia - Viya Delivering All Over Australia">
    <title>Online Indian Grocery Store in Australia - Viya Delivering All Over Australia</title>
  </head><body>
    <header class="site-header">
      <a href="https://www.facebook.com/viyaimports" aria-label="Facebook"><svg></svg></a>
      <a href="https://www.instagram.com/viya_imports/" aria-label="Instagram"><svg></svg></a>
      <a href="https://g.page/viya-imports-australia" aria-label="Google"><svg></svg></a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=https://viya.com.au">Share</a>
    </header>
    <nav class="main-menu">
      <a href="/account/register">Register</a>
      <a href="/cart">Cart</a>
      <a href="/rice">Rice</a>
      <a href="/snacks">Indian Snacks</a>
      <a href="/gravies">Ready to use/Gravies</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
    <button>Toggle menu</button>
    <h1>Welcome to Viya!</h1>
    <p>Online Indian Grocery Store in Australia - Viya Delivering All Over Australia Toggle menu Welcome to Viya!</p>
    <footer class="site-footer">
      <a href="https://www.facebook.com/viyaimports">Facebook</a>
      <a href="https://www.instagram.com/viya_imports/">Instagram</a>
    </footer>
  </body></html>`;
  const viyaParsed = parseHtmlForOnboarding(viyaHtml, "https://viyaimports.example");
  assert(
    "viya nav filters Register/Cart",
    !viyaParsed.navServices.some((s) => /register|cart|about|contact/i.test(s)) &&
      viyaParsed.navServices.includes("Rice"),
    viyaParsed.navServices.join(","),
  );
  assert(
    "viya socials from header/footer (not share)",
    viyaParsed.socialLinks.some((l) => l.platform === "facebook") &&
      viyaParsed.socialLinks.some((l) => l.platform === "instagram") &&
      viyaParsed.socialLinks.some((l) => l.platform === "google_business") &&
      !viyaParsed.socialLinks.some((l) => /sharer/i.test(l.url)),
    viyaParsed.socialLinks.map((l) => `${l.platform}:${l.url}`).join("|"),
  );

  {
    assert(
      "seo title is tagline",
      looksLikeSeoTagline("Online Indian Grocery Store in Australia", "Viya Imports"),
    );
    assert(
      "trading prefers og:site_name / company over title",
      resolveTradingName({
        ogSiteName: "Viya Imports",
        pageTitle: "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia",
        companyName: "Viya Imports",
      }) === "Viya Imports",
    );
    assert(
      "trading falls back to company when title is SEO junk",
      resolveTradingName({
        pageTitle: "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia",
        companyName: "Viya Imports",
      }) === "Viya Imports",
    );

    const companyForMerge = stubAutoOnboardCompany({ name: "Viya Imports" });
    const appliedSocial = applyExtractedFields(
      companyForMerge.profile,
      {
        tradingNames: resolveTradingName({
          ogSiteName: "Viya Imports",
          pageTitle:
            "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia",
          companyName: "Viya Imports",
        }),
        socialLinks: viyaParsed.socialLinks,
      },
      ["tradingNames", "socialLinks"],
      { overwrite: true },
    );
    assert(
      "apply maps socials into profile.socialLinks",
      (appliedSocial.socialLinks ?? []).some((l) => l.platform === "facebook") &&
        (appliedSocial.socialLinks ?? []).some((l) => l.platform === "instagram") &&
        appliedSocial.tradingNames === "Viya Imports",
      `trading=${appliedSocial.tradingNames} socials=${(appliedSocial.socialLinks ?? []).map((l) => l.platform).join(",")}`,
    );
    assert(
      "apply does not invent legalName Pty Ltd",
      !appliedSocial.legalName?.trim(),
      appliedSocial.legalName,
    );
  }

  {
    const fromNav = partitionServicesAndProductCategories(
      viyaParsed.navServices,
      "Online Indian Grocery Store in Australia · Indian grocery retail",
    );
    assert(
      "viya nav → product categories",
      fromNav.productCategories.includes("Rice") &&
        fromNav.productCategories.includes("Indian Snacks") &&
        !fromNav.services.some((s) => /rice|snacks|gravies/i.test(s)),
      `services=${fromNav.services.join("|")} cats=${fromNav.productCategories.join("|")}`,
    );
  }

  // Enrich path on polluted preview (template mode when AI off)
  const pollutedPreview = {
    companyId: company.id,
    ranAt: new Date().toISOString(),
    mode: "simulated" as const,
    consent: true,
    urls: { website: "https://viyaimports.example", socialLinks: [] },
    sources: [
      {
        url: "https://viyaimports.example",
        kind: "website" as const,
        title: "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia",
        snippet:
          "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia Toggle menu Welcome to Viya!",
      },
    ],
    fields: [
      {
        key: "natureOfBusiness" as const,
        label: "Nature of business",
        value:
          "Online Indian Grocery Store in Australia - Viya Delivering All Over Australia Toggle menu Welcome to Viya!",
        confidence: "medium" as const,
        alreadySet: false,
      },
      {
        key: "industry" as const,
        label: "Industry",
        value: "Indian grocery retail",
        confidence: "medium" as const,
        alreadySet: false,
      },
      {
        key: "services" as const,
        label: "Services",
        value: "Register, Rice, Indian Snacks, Ready to use/Gravies",
        confidence: "medium" as const,
        alreadySet: false,
      },
      {
        key: "targetCustomers" as const,
        label: "Target customers",
        value: "People who live, work, or visit Australia and need what Viya Imports offers.",
        confidence: "medium" as const,
        alreadySet: false,
      },
      {
        key: "serviceAreas" as const,
        label: "Service areas",
        value: "Australia",
        confidence: "medium" as const,
        alreadySet: false,
      },
    ],
  };
  const { preview: enriched, enrichment } = await enrichOnboardingPreview({
    company,
    preview: pollutedPreview,
    actorId: "u_verify",
  });
  const enNature = enriched.fields.find((f) => f.key === "natureOfBusiness")?.value ?? "";
  const enServices = enriched.fields.find((f) => f.key === "services")?.value ?? "";
  const enAudience = enriched.fields.find((f) => f.key === "targetCustomers")?.value ?? "";
  const enCats = enriched.extras?.productCategories ?? enrichment.fields.productCategories ?? [];
  assert(
    "enrich strips chrome from nature",
    !/toggle\s+menu|welcome\s+to\s+viya|delivering all over/i.test(enNature) &&
      /grocery/i.test(enNature),
    enNature,
  );
  assert(
    "enrich services are not product categories",
    !/\b(Rice|Indian Snacks|Gravies|Register)\b/i.test(enServices) &&
      (enServices === "" ||
        /\b(delivery|online|click|collect|grocery|shipping|wholesale)\b/i.test(enServices)),
    enServices || "(empty)",
  );
  assert(
    "enrich moves categories to productCategories",
    Array.isArray(enCats) &&
      enCats.some((c) => /rice/i.test(String(c))) &&
      enCats.some((c) => /snacks/i.test(String(c))),
    Array.isArray(enCats) ? enCats.join("|") : String(enCats),
  );
  assert(
    "enrich audience not tautology",
    !/need what .+ offers/i.test(enAudience) && /indian|grocery|household/i.test(enAudience),
    enAudience,
  );

  // Apply persists categories on retail profile, not services
  {
    const extracted = extractedFromPreview(enriched);
    if (!extracted.productCategories?.length && Array.isArray(enCats)) {
      extracted.productCategories = enCats.map(String);
    }
    const applied = applyExtractedFields(
      company.profile,
      extracted,
      enriched.fields.map((f) => f.key),
      { overwrite: true },
    );
    assert(
      "apply: services exclude Rice/Snacks",
      !applied.services.some((s) => /rice|snacks|gravies/i.test(s)),
      applied.services.join("|"),
    );
    assert(
      "apply: retail.productCategories set",
      (applied.retail?.productCategories ?? []).some((c) => /rice/i.test(c)),
      (applied.retail?.productCategories ?? []).join("|"),
    );
  }

  const html = `<!DOCTYPE html><html><head>
    <meta property="og:site_name" content="Viya Imports">
    <meta property="og:title" content="Viya Imports — Wholesale Specialty Foods">
    <meta property="og:description" content="Viya Imports is a wholesale importer of specialty Mediterranean foods for retailers and hospitality across Sydney.">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Viya Imports","description":"Wholesale importer of specialty Mediterranean foods for retailers and hospitality."}</script>
  </head><body>
    <nav class="main-menu"><a href="/oils">Olive oils</a><a href="/pasta">Pasta & grains</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
    <p>Viya Imports specialises in sourcing premium Mediterranean pantry staples for independent retailers and chefs across metropolitan Sydney.</p>
  </body></html>`;
  const parsed = parseHtmlForOnboarding(html, "https://viyaimports.example");
  assert("nav services from HTML", parsed.navServices.includes("Olive oils"), parsed.navServices.join(","));
  assert(
    "schema description",
    !!parsed.schemaDescription?.includes("Wholesale importer"),
    parsed.schemaDescription,
  );
  assert(
    "wholesale specialty → other (B2B)",
    inferBusinessTypeFromIndustry("Wholesale Specialty Foods") === "other",
  );
  // Wholesale specialty foods: catalogue lines → product categories
  {
    const b2b = partitionServicesAndProductCategories(
      parsed.navServices,
      "Wholesale Specialty Foods · Mediterranean pantry",
    );
    assert(
      "wholesale food nav → product categories",
      b2b.productCategories.includes("Olive oils") &&
        !b2b.services.some((s) => /olive|pasta/i.test(s)),
      `services=${b2b.services.join("|")} cats=${b2b.productCategories.join("|")}`,
    );
  }

  for (const [name, fn] of [
    ["selftest.simulatedWhenLiveOff", checkSimulatedWhenLiveOff],
    ["selftest.schemaOrgExtraction", checkSchemaOrgExtraction],
    ["selftest.schemaSimulatedScrape", checkSchemaSimulatedScrape],
    ["selftest.applyPrefillsProfile", checkApplyPrefillsProfile],
  ] as const) {
    const r = await fn();
    assert(name, r.ok, r.detail);
  }

  if (prev === undefined) delete process.env.AUTO_ONBOARDING_LIVE;
  else process.env.AUTO_ONBOARDING_LIVE = prev;

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll scrape-mapping checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
