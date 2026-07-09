// Self-test helpers for V1 content repurposing (Module 5).

import { createContent } from "@/lib/db";
import {
  canRepurposeSource,
  generatePlatformVariant,
  PLATFORM_SPECS,
  repurposeForPlatforms,
  templatePlatformVariant,
} from "@/lib/content-repurposing";
import type { Company, ContentItem } from "@/lib/types";

export function stubCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_stub",
    tenantId: "tn_stub",
    name: "Stub Co",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      serviceAreas: ["Brisbane"],
      services: ["Consulting"],
      callsToAction: ["Book a free consult"],
      prohibitedClaims: [],
      approvedClaims: ["Licensed professionals"],
      requiredDisclaimers: [],
      industry: "retail",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export function stubSource(overrides: Partial<ContentItem> = {}): ContentItem {
  const t = new Date().toISOString();
  return {
    id: "ct_source",
    companyId: "co_stub",
    type: "social_post",
    title: "Summer sale — big savings",
    body: "Our summer sale is on now. Save on selected items across Brisbane. Visit us this week.",
    status: "approved",
    createdById: "u_stub",
    createdAt: t,
    updatedAt: t,
    versions: [],
    ...overrides,
  };
}

export async function checkRepurposeSourceEligibility(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const draft = stubSource({ status: "ai_draft" });
  const published = stubSource({ status: "published" });
  const ok =
    canRepurposeSource(draft) &&
    canRepurposeSource(stubSource({ status: "approved" })) &&
    !canRepurposeSource(published);
  return {
    ok,
    detail: `draft=${canRepurposeSource(draft)} published=${canRepurposeSource(published)}`,
  };
}

export async function checkPlatformVariantsDistinct(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const company = stubCompany();
  const source = stubSource();
  const fb = await templatePlatformVariant({ company, source, platform: "Facebook" });
  const tt = await templatePlatformVariant({ company, source, platform: "TikTok" });
  const ok = fb !== tt && tt.includes("[HOOK") && fb.includes("comments");
  return { ok, detail: `fbLen=${fb.length} ttHasHook=${tt.includes("[HOOK")}` };
}

export async function checkPlatformCharLimits(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCompany();
  const source = stubSource({
    body: "x".repeat(4000),
  });
  const results = await repurposeForPlatforms({
    company,
    source,
    platforms: ["Facebook", "Instagram", "Google Business Profile", "TikTok"],
  });
  const ok = results.every(
    (r) => r.body.length <= PLATFORM_SPECS[r.platform].charLimit,
  );
  return {
    ok,
    detail: results.map((r) => `${r.platform}:${r.body.length}`).join(" "),
  };
}

export async function checkRepurposeCreatesAiDraft(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const source = await createContent({
    companyId,
    type: "social_post",
    title: "Repurpose source",
    body: "Original brief for multi-platform repurpose test.",
    status: "ai_draft",
    createdById: userId,
  });
  const company = stubCompany({ id: companyId, name: "SelfTest Co" });
  const variant = await generatePlatformVariant({
    company,
    source,
    platform: "Instagram",
  });
  const child = await createContent({
    companyId,
    type: "social_post",
    title: variant.title,
    body: variant.body,
    status: "ai_draft",
    createdById: userId,
    repurposedFromId: source.id,
    variantLabel: "Instagram",
    variantGroupId: "rp_test",
  });
  const ok =
    child.status === "ai_draft" &&
    child.repurposedFromId === source.id &&
    child.variantLabel === "Instagram";
  return {
    ok,
    detail: `child=${child.id} status=${child.status} from=${child.repurposedFromId}`,
  };
}
