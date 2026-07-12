"use server";

import { revalidatePath } from "next/cache";
import { getCompany, updateCompany } from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  applyExtractedFields,
  assertScrapeConsent,
  assertScrapeUrls,
  buildAutoOnboardingMeta,
  extractedFromPreview,
  parseAutoOnboardingUrls,
  scrapeForOnboardingPreview,
  type AutoOnboardingFieldKey,
  type AutoOnboardingScrapeResult,
} from "@/lib/auto-onboarding";
import { SOCIAL_PLATFORMS } from "@/lib/types";

// TODO(Agent C): optional enrichment apply — merge enrichment patches into preview
// or extend applyExtractedFields when enrichment-actions.ts ships.

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function consentFromForm(fd: FormData): boolean {
  return fd.get("consent") === "on" || fd.get("consent") === "true";
}

function readUrlsFromForm(fd: FormData) {
  const socialLinks = SOCIAL_PLATFORMS.map(({ key }) => {
    const url = text(fd, `social_${key}`);
    return url ? { platform: key, url } : null;
  }).filter((l): l is { platform: string; url: string } => l !== null);

  return parseAutoOnboardingUrls({
    website: text(fd, "website"),
    socialLinks,
  });
}

function selectedKeysFromForm(fd: FormData): AutoOnboardingFieldKey[] {
  const raw = text(fd, "selectedFields");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return parsed.filter(Boolean) as AutoOnboardingFieldKey[];
  } catch {
    return [];
  }
}

export async function previewAutoOnboardingAction(
  formData: FormData,
): Promise<{ ok: true; preview: AutoOnboardingScrapeResult } | { ok: false; error: string }> {
  try {
    const companyId = text(formData, "companyId");
    const user = await assertAdminCompanyAccess(companyId);
    const company = await getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const consent = consentFromForm(formData);
    assertScrapeConsent(consent);
    const urls = readUrlsFromForm(formData);
    assertScrapeUrls(urls);

    let preview = await scrapeForOnboardingPreview({
      company,
      consent,
      urls,
    });

    const { enrichOnboardingPreview } = await import("@/lib/ai/onboarding-enrich");
    const enriched = await enrichOnboardingPreview({
      company,
      preview,
      actorId: user.id,
    });
    preview = enriched.preview;

    await logAction(user, "auto_onboarding.scraped", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `mode=${preview.mode} enrich=${enriched.enrichment.mode} fields=${preview.fields.length} urls=${preview.sources.length}`,
    });

    return { ok: true, preview };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Scrape preview failed",
    };
  }
}

export async function applyAutoOnboardingAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const companyId = text(formData, "companyId");
    const user = await assertAdminCompanyAccess(companyId);
    const company = await getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const consent = consentFromForm(formData);
    assertScrapeConsent(consent);

    const previewRaw = text(formData, "previewJson");
    if (!previewRaw) throw new Error("Missing scrape preview — run preview first.");
    const preview = JSON.parse(previewRaw) as AutoOnboardingScrapeResult;

    const selectedKeys = selectedKeysFromForm(formData);
    if (selectedKeys.length === 0) {
      throw new Error("Select at least one field to apply.");
    }

    const extracted = extractedFromPreview(preview);
    const overwrite = formData.get("overwrite") === "on";
    let profile = applyExtractedFields(
      company.profile,
      extracted,
      selectedKeys,
      { overwrite },
    );

    const { applyContactAndNotesToProfile } = await import("@/lib/ai/onboarding-enrich");
    if (preview.extras) {
      profile = applyContactAndNotesToProfile(profile, {
        fields: {
          localMarketNotes: preview.extras.localMarketNotes,
          businessAddress: preview.extras.businessAddress,
          phone: preview.extras.phone,
          email: preview.extras.email,
          productCategories: preview.extras.productCategories,
        },
        inferredKeys: [],
        mode: preview.extras.enrichMode ?? "template",
      });
    }

    const meta = buildAutoOnboardingMeta(preview, user.id, true);
    profile.autoOnboarding = {
      ...company.profile.autoOnboarding,
      ...meta,
    };

    await updateCompany(companyId, { profile });
    await logAction(user, "auto_onboarding.applied", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: `fields=${selectedKeys.join(",")} mode=${preview.mode} enrich=${preview.extras?.enrichMode ?? "none"} overwrite=${overwrite}`,
    });

    revalidatePath(`/companies/${companyId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Apply failed",
    };
  }
}
