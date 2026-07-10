// Self-test helpers for M51 Local SEO (W7 module 11).

import {
  buildLocalLandingBriefs,
  buildLocalSeoReport,
  buildSchemaRecommendations,
} from "@/lib/local-seo";
import { localSeoLive } from "@/lib/local-seo-connectors";
import { runGbpAudit } from "@/lib/gbp-audit";
import type { Company, LocalAreaProfile } from "@/lib/types";

export function stubLocalSeoCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_local_seo_stub",
    tenantId: "tn_stub",
    name: "Riverside Kitchen",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      legalName: "Riverside Kitchen Pty Ltd",
      tradingNames: "Riverside Kitchen",
      industry: "Restaurant",
      businessType: "restaurant_cafe",
      website: "https://riversidekitchen.example",
      approvalContact: "03 5550 1234",
      serviceAreas: ["Riverside", "West End"],
      services: ["Modern Australian dining", "Functions"],
      callsToAction: ["Book a table"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      restaurant: {
        cuisineStyle: "Modern Australian",
        serviceModes: ["Dine-in"],
        dietaryOptions: ["Gluten-free options"],
        peakServicePeriods: ["Lunch Fri–Sun 12–3pm", "Dinner daily 5:30–10pm"],
      },
    },
    documents: [],
    ...overrides,
  } as Company;
}

export function stubLocalProfile(companyId: string): LocalAreaProfile {
  return {
    companyId,
    suburbs: ["Riverside", "West End", "CBD"],
    competitors: ["Harbour Bistro"],
    searchTerms: ["riverside restaurant", "function venue"],
    commonNeeds: "Waterfront dining and small events.",
    updatedAt: new Date().toISOString(),
  };
}

export async function checkLocalSeoLandingBriefs(): Promise<{ ok: boolean; detail: string }> {
  const company = stubLocalSeoCompany();
  const localProfile = stubLocalProfile(company.id);
  const briefs = buildLocalLandingBriefs(company, localProfile);
  const ok =
    briefs.length >= 2 &&
    briefs.every((b) => b.slug.length > 0 && b.title.length > 0 && b.h1.length > 0);
  return {
    ok,
    detail: `count=${briefs.length} suburbs=${briefs.map((b) => b.suburb).join(",")}`,
  };
}

export async function checkLocalSeoSchemaRecs(): Promise<{ ok: boolean; detail: string }> {
  const company = stubLocalSeoCompany();
  const localProfile = stubLocalProfile(company.id);
  const audit = await runGbpAudit({ company, localProfile });
  const recs = buildSchemaRecommendations(company, localProfile, audit);
  const restaurant = recs.find((r) => r.schemaType === "Restaurant");
  const faq = recs.find((r) => r.schemaType === "FAQPage");
  const ok =
    !!restaurant &&
    restaurant.jsonLdPreview.includes("Restaurant") &&
    !!faq &&
    faq.requiredFields.includes("mainEntity");
  return {
    ok,
    detail: `types=${recs.map((r) => r.schemaType).join("+")} restaurant=${restaurant?.readiness}`,
  };
}

export async function checkLocalSeoSimulatedWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const live = localSeoLive();
  const company = stubLocalSeoCompany();
  const localProfile = stubLocalProfile(company.id);
  const audit = await runGbpAudit({ company, localProfile });
  const report = buildLocalSeoReport({ company, localProfile, gbpAudit: audit });
  const ok = !live && report.mode === "simulated" && report.score.overall >= 0;
  return {
    ok,
    detail: `live=${live} mode=${report.mode} overall=${report.score.overall}`,
  };
}

export async function runLocalSeoSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  async function expect(
    name: string,
    fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string },
  ) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  await expect("localSeo.landingBriefs", () => checkLocalSeoLandingBriefs());
  await expect("localSeo.schemaRecs", () => checkLocalSeoSchemaRecs());
  await expect("localSeo.simulatedWhenLiveOff", () => checkLocalSeoSimulatedWhenLiveOff());
  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed: [] as string[],
    durationMs: Date.now() - start,
    checks,
  };
}
