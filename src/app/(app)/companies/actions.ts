"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import {
  createCompany,
  getCompany,
  getTenant,
  listCompanies,
  updateCompany,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { assertCompanyQuota } from "@/lib/billing";
import { logAction } from "@/lib/audit";
import { linesFromForm } from "@/lib/business-profiles";
import { verifyBusinessNameAgainstAbr } from "@/lib/abn-lookup";
import {
  duplicateNameAbnMessage,
  findDuplicateByNameAndAbn,
  parseAbnInput,
} from "@/lib/company-identity";
import {
  enqueueManagedDeliveryForCompany,
  ensureManagedDeliveryBootstrap,
  ensureAndKickManagedDeliveryForCompany,
  supersedeOpenManagedDeliveryRuns,
  forceUnlockManagedStrategyForCompany,
  maybeProcessEligibleDeliveryForCompany,
} from "@/lib/managed-service/delivery-runner";
import { localDemoEnabled } from "@/lib/env";
import { notifyClientException } from "@/lib/managed-service/exception-notify";
import { scrapeAndApplyInitialProfile } from "@/lib/auto-onboarding";
import { onboardingScore } from "@/lib/types";
import { id, now } from "@/lib/utils";
import {
  SOCIAL_PLATFORMS,
  type BusinessType,
  type CompanyStatus,
  type CompanyProfile,
  type ManagedServiceLevel,
  type ManagedServiceSettings,
  type MarketingPackageId,
  type SocialLink,
  type UploadedAsset,
} from "@/lib/types";
import {
  customModulesEqual,
  isMarketingPackageId,
  resolveCompanyPackage,
  resolveSelectionForPackage,
} from "@/lib/marketing-packages";

const SERVICE_LEVELS: ManagedServiceLevel[] = [
  "approval",
  "managed_exceptions",
  "fully_managed",
];

const BUSINESS_TYPES: BusinessType[] = [
  "restaurant_cafe",
  "retail",
  "hotel",
  "professional",
  "other",
];

function lines(fd: FormData, key: string): string[] {
  return String(fd.get(key) || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

function businessTypeFromForm(fd: FormData): BusinessType | undefined {
  const raw = String(fd.get("businessType") || "").trim();
  return BUSINESS_TYPES.includes(raw as BusinessType)
    ? (raw as BusinessType)
    : undefined;
}

// Read one URL per platform (reference links only — publishing access is a
// separate OAuth connect storing an encrypted, revocable token, never creds).
// Keeps only valid http(s) links.
function readSocialLinks(fd: FormData): SocialLink[] {
  const out: SocialLink[] = [];
  for (const { key } of SOCIAL_PLATFORMS) {
    const raw = String(fd.get(`social_${key}`) || "").trim();
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") {
        out.push({ platform: key, url: u.toString() });
      }
    } catch {
      /* skip invalid URLs silently */
    }
  }
  return out;
}

export async function createCompanyAction(
  formData: FormData,
): Promise<{ error: string } | void> {
  const user = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Business name is required." };
  const abnParsed = parseAbnInput(String(formData.get("abn") || ""));
  if (!abnParsed.ok) return { error: abnParsed.error };
  if (!abnParsed.abn) {
    return {
      error: "ABN is required — business name + ABN identify a client account.",
    };
  }
  const websiteRaw = String(formData.get("website") || "").trim();
  const consent =
    formData.get("consent") === "on" || formData.get("consent") === "true";
  // T4: pricing is per client company — enforce the plan's company limit on
  // the acting user's tenant before creating.
  try {
    await assertCompanyQuota(user.tenantId);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Client limit reached for this plan.",
    };
  }
  if (websiteRaw && !consent) {
    return {
      error:
        "Confirm client consent to scrape public website data, or leave the website blank.",
    };
  }

  const abrGate = await verifyBusinessNameAgainstAbr(name, abnParsed.abn);
  if (!abrGate.ok) return { error: abrGate.error };

  const dup = findDuplicateByNameAndAbn(
    await listCompanies(user.tenantId),
    name,
    abnParsed.abn,
  );
  if (dup) return { error: duplicateNameAbnMessage(dup.company) };

  const company = await createCompany({ tenantId: user.tenantId, name, createdBy: user.id });
  const withAbn: CompanyProfile = { ...company.profile, abn: abnParsed.abn };
  if (abrGate.mode === "live" && abrGate.legalName && !withAbn.legalName?.trim()) {
    withAbn.legalName = abrGate.legalName;
  }
  await updateCompany(company.id, { profile: withAbn });
  await logAction(user, "company.created", {
    targetType: "company",
    targetId: company.id,
    companyId: company.id,
    detail:
      abrGate.mode === "skipped"
        ? `${name} (abr=${abrGate.warning ?? "skipped"})`
        : `${name} (abr=verified)`,
  });

  let scrapedParam = "";
  if (websiteRaw && consent) {
    const result = await scrapeAndApplyInitialProfile({
      company: { ...company, profile: withAbn },
      website: websiteRaw,
      actorId: user.id,
    });
    await updateCompany(company.id, { profile: result.profile });
    if (result.mode !== "failed") {
      await logAction(user, "auto_onboarding.scraped", {
        targetType: "company",
        targetId: company.id,
        companyId: company.id,
        detail: `mode=${result.mode} fields=${result.fieldCount} initial=1`,
      });
    }
    if (result.fieldCount > 0) {
      await logAction(user, "auto_onboarding.applied", {
        targetType: "company",
        targetId: company.id,
        companyId: company.id,
        detail: `fields=${result.fieldCount} initial=1`,
      });
    }
    scrapedParam =
      result.fieldCount > 0 ? "?scraped=1" : result.mode === "failed" ? "?scraped=0" : "?scraped=0";
  }

  // Quick-add never visited the package wizard — default Basic + enqueue strategy
  // so Strategy is not stuck on opaque "Not started". Demo: eligible immediately.
  try {
    await ensureAndKickManagedDeliveryForCompany({
      actor: user,
      tenantId: user.tenantId,
      companyId: company.id,
      reason: "signup",
      process: true,
      demoForceGenerate: localDemoEnabled(),
    });
  } catch {
    /* soft — Strategy / Overview on-read can retry */
  }

  redirect(`/companies/${company.id}${scrapedParam}`);
}

/** Form-action wrapper for `/companies/new` (must return void). */
export async function createCompanyFormAction(formData: FormData): Promise<void> {
  const result = await createCompanyAction(formData);
  if (result?.error) {
    redirect(`/companies/new?error=${encodeURIComponent(result.error)}`);
  }
}

export async function saveOnboardingAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  try {
    const user = await assertAdminCompanyAccess(companyId);
    const company = await getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const businessType =
      businessTypeFromForm(formData) ?? company.profile.businessType;

    const name = String(formData.get("name") || company.name).trim();
    if (!name) throw new Error("Business name is required");
    const abnParsed = parseAbnInput(String(formData.get("abn") || ""));
    if (!abnParsed.ok) throw new Error(abnParsed.error);

    const profilePatch: CompanyProfile = {
      ...company.profile,
      legalName: text(formData, "legalName"),
      tradingNames: text(formData, "tradingNames"),
      industry: text(formData, "industry"),
      businessType,
      website: text(formData, "website"),
      approvalContact: text(formData, "approvalContact"),
      natureOfBusiness: text(formData, "natureOfBusiness"),
      targetCustomers: text(formData, "targetCustomers"),
      brandVoice: text(formData, "brandVoice"),
      currentOffers: text(formData, "currentOffers"),
      localMarketNotes: text(formData, "localMarketNotes"),
      businessAddress: text(formData, "businessAddress"),
      phone: text(formData, "phone"),
      email: text(formData, "email"),
      serviceAreas: lines(formData, "serviceAreas"),
      services: lines(formData, "services"),
      callsToAction: lines(formData, "callsToAction"),
      prohibitedClaims: lines(formData, "prohibitedClaims"),
      approvedClaims: lines(formData, "approvedClaims"),
      requiredDisclaimers: lines(formData, "requiredDisclaimers"),
      socialLinks: readSocialLinks(formData),
      retail: company.profile.retail,
      hotel: company.profile.hotel,
      restaurant: company.profile.restaurant,
    };
    if (abnParsed.abn) profilePatch.abn = abnParsed.abn;

    const identityAbn = profilePatch.abn;
    const identityChanged =
      name !== company.name ||
      (identityAbn &&
        identityAbn.replace(/\D/g, "") !==
          String(company.profile.abn ?? "").replace(/\D/g, ""));
    if (identityAbn && identityChanged) {
      const abrGate = await verifyBusinessNameAgainstAbr(name, identityAbn);
      if (!abrGate.ok) throw new Error(abrGate.error);
      if (abrGate.mode === "live" && abrGate.legalName && !profilePatch.legalName?.trim()) {
        profilePatch.legalName = abrGate.legalName;
      }
    }
    if (identityAbn) {
      const dup = findDuplicateByNameAndAbn(
        await listCompanies(user.tenantId),
        name,
        identityAbn,
        { excludeCompanyId: companyId },
      );
      if (dup) throw new Error(duplicateNameAbnMessage(dup.company));
    }

    if (businessType === "retail") {
      profilePatch.retail = {
        productCategories: linesFromForm(String(formData.get("retail_productCategories") ?? "")),
        heroProducts: linesFromForm(String(formData.get("retail_heroProducts") ?? "")),
        promotions: linesFromForm(String(formData.get("retail_promotions") ?? "")),
        seasons: linesFromForm(String(formData.get("retail_seasons") ?? "")),
        pricePositioning: text(formData, "retail_pricePositioning"),
      };
    } else if (businessType === "hotel") {
      profilePatch.hotel = {
        roomTypes: linesFromForm(String(formData.get("hotel_roomTypes") ?? "")),
        packages: linesFromForm(String(formData.get("hotel_packages") ?? "")),
        amenities: linesFromForm(String(formData.get("hotel_amenities") ?? "")),
        occupancyLanguage: text(formData, "hotel_occupancyLanguage"),
        directBookingBenefits: text(formData, "hotel_directBookingBenefits"),
      };
    } else if (businessType === "restaurant_cafe") {
      profilePatch.restaurant = {
        cuisineStyle: text(formData, "restaurant_cuisineStyle"),
        serviceModes: linesFromForm(String(formData.get("restaurant_serviceModes") ?? "")),
        dietaryOptions: linesFromForm(String(formData.get("restaurant_dietaryOptions") ?? "")),
        peakServicePeriods: linesFromForm(
          String(formData.get("restaurant_peakServicePeriods") ?? ""),
        ),
      };
    }

    await updateCompany(companyId, {
      name,
      profile: profilePatch,
    });

    await logAction(user, "company.edited", {
      targetType: "company",
      targetId: companyId,
      companyId,
    });
    revalidatePath(`/companies/${companyId}`);
    redirect(`/companies/${companyId}?saved=1`);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Could not save profile";
    if (companyId) {
      redirect(`/companies/${companyId}?error=${encodeURIComponent(msg)}`);
    }
    throw e;
  }
}

export async function setCompanyStatusAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const status = String(formData.get("status") || "") as CompanyStatus;
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  if (status === "ai_ready") {
    const { score } = onboardingScore(company);
    if (score < 100) {
      throw new Error("Complete all minimum onboarding fields before marking AI-ready.");
    }
  }

  await updateCompany(companyId, { status });
  await logAction(user, "company.status_changed", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: status,
  });
  revalidatePath(`/companies/${companyId}`);
}

export async function addCompanyDocAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const docs: UploadedAsset[] = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .map((f) => ({
      id: id("doc"),
      name: f.name,
      contentType: f.type || "application/octet-stream",
      size: f.size,
      approvalStatus: "approved",
      consentObtained: true,
      showsCustomer: false,
      uploadedBy: user.id,
      uploadedAt: now(),
    }));

  if (docs.length) {
    await updateCompany(companyId, { documents: [...company.documents, ...docs] });
    await logAction(user, "brand_document.uploaded", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: docs.map((d) => d.name).join(", "),
    });
  }
  revalidatePath(`/companies/${companyId}`);
}

export async function saveManagedServiceLevelAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const raw = String(formData.get("serviceLevel") || "").trim();
  if (!SERVICE_LEVELS.includes(raw as ManagedServiceLevel)) {
    throw new Error("Invalid service level");
  }
  const serviceLevel = raw as ManagedServiceLevel;
  const prev = company.profile.managedService;

  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      managedService: {
        ...(prev ?? { serviceLevel }),
        serviceLevel,
      },
    },
  });

  await logAction(user, "company.managed_service_level_set", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: serviceLevel,
  });

  // Any non-archived company with a package (or after level change): ensure a
  // delivery run exists. Strategy drafts still require human approve to publish.
  if (company.status !== "archived") {
    try {
      await ensureAndKickManagedDeliveryForCompany({
        actor: user,
        tenantId: user.tenantId,
        companyId,
        reason: "service_level",
        process: localDemoEnabled(),
        demoForceGenerate: localDemoEnabled(),
      });
    } catch {
      /* soft */
    }
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/companies/${companyId}/strategy`);
}

export async function saveMarketingPackageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const idRaw = String(formData.get("marketingPackageId") || "").trim();
  if (!isMarketingPackageId(idRaw)) throw new Error("Invalid marketing package");
  const marketingPackageId = idRaw as MarketingPackageId;

  const tenant = await getTenant(user.tenantId);
  const { serviceLevel, customModules } = resolveSelectionForPackage(
    tenant,
    marketingPackageId,
    formData,
  );
  const prev = company.profile.managedService;
  const hadExplicitPackage = Boolean(prev?.marketingPackageId);
  const prevPackageId = (prev?.marketingPackageId ?? "basic") as MarketingPackageId;

  // First explicit assign counts as a change even when choosing Basic (display
  // fallback used to hide prevPackageId === "basic" and skip enqueue).
  const packageChanged =
    !hadExplicitPackage ||
    prevPackageId !== marketingPackageId ||
    (marketingPackageId === "custom" &&
      !customModulesEqual(prev?.customModules, customModules));

  const oldResolved = resolveCompanyPackage(company, tenant);
  const nextMs: ManagedServiceSettings = {
    ...(prev ?? { serviceLevel }),
    serviceLevel,
    marketingPackageId,
    customModules,
  };
  if (packageChanged) {
    // Stripe package Checkout / proration not wired — stamp for ops; no fake charges.
    nextMs.packageChangePendingBilling = true;
    delete nextMs.implementationPlanEmailedAt;
  }
  const newResolved = resolveCompanyPackage(
    { ...company, profile: { ...company.profile, managedService: nextMs } },
    tenant,
  );
  const billingDirection =
    newResolved.priceAudMonthly > oldResolved.priceAudMonthly
      ? "upgrade"
      : newResolved.priceAudMonthly < oldResolved.priceAudMonthly
        ? "downgrade"
        : "lateral";

  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      managedService: nextMs,
    },
  });

  await logAction(user, "company.marketing_package_set", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail:
      marketingPackageId === "custom"
        ? `custom · ${serviceLevel}`
        : `${marketingPackageId} · ${serviceLevel}`,
  });

  if (packageChanged) {
    await logAction(user, "company.marketing_package_changed", {
      targetType: "company",
      targetId: companyId,
      companyId,
      detail: [
        `${oldResolved.id}→${newResolved.id}`,
        `A$${oldResolved.priceAudMonthly}→A$${newResolved.priceAudMonthly}`,
        billingDirection,
        "packageChangePendingBilling",
        // Next: Stripe proration / Checkout + credit note for downgrades.
      ].join(" · "),
    });

    const anchor =
      tenant?.onboardingCompletedAt ?? (localDemoEnabled() ? now() : null);
    if (company.status !== "archived" && anchor) {
      await supersedeOpenManagedDeliveryRuns(user.tenantId, companyId);
      const run = await enqueueManagedDeliveryForCompany({
        tenantId: user.tenantId,
        companyId,
        onboardingCompletedAt: anchor,
        serviceLevel,
        reason: "package_change",
      });
      await logAction(user, "managed_delivery.enqueued", {
        targetType: "managed_delivery_run",
        targetId: run.id,
        companyId,
        detail: `package_change eligible=${run.strategyEligibleAt} due=${run.strategyDueAt}`,
      });

      if (localDemoEnabled()) {
        try {
          await maybeProcessEligibleDeliveryForCompany(
            user.tenantId,
            companyId,
            user,
          );
        } catch {
          /* soft */
        }
      }

      try {
        await notifyClientException({
          tenantId: user.tenantId,
          companyId,
          kind: "package_change",
          subject: `Your implementation plan is being updated for ${newResolved.name}`,
          body: `We've started updating your marketing implementation plan for the ${newResolved.name} package (A$${newResolved.priceAudMonthly}/mo). You'll get another email when the refreshed plan is ready — nothing publishes without your approval.`,
        });
      } catch {
        /* soft no-op */
      }
    }

    revalidatePath(`/companies/${companyId}`);
    revalidatePath(`/companies/${companyId}/strategy`);
    redirect(`/companies/${companyId}?package=updated`);
  }

  // Re-save of same package (e.g. display-fallback Basic → explicit): still
  // ensure a delivery run exists so Strategy is not left "Not started".
  if (company.status !== "archived") {
    try {
      await ensureAndKickManagedDeliveryForCompany({
        actor: user,
        tenantId: user.tenantId,
        companyId,
        reason: "manual",
        process: localDemoEnabled(),
        demoForceGenerate: localDemoEnabled(),
      });
    } catch {
      /* soft */
    }
  }

  revalidatePath(`/companies/${companyId}`);
  revalidatePath(`/companies/${companyId}/strategy`);
}

/** On-read catch-up when past strategyEligibleAt (demo / no cron). */
export async function processEligibleStrategyAction(companyId: string) {
  const user = await assertAdminCompanyAccess(companyId);
  await maybeProcessEligibleDeliveryForCompany(user.tenantId, companyId, user);
  revalidatePath(`/companies/${companyId}/strategy`);
  revalidatePath(`/companies/${companyId}`);
}

/** Agency unlock: clear the 6h floor and generate strategy drafts now. */
export async function forceUnlockManagedStrategyAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  // Ensure a run exists first (Assigned package with missing enqueue).
  await ensureManagedDeliveryBootstrap({
    actor: user,
    tenantId: user.tenantId,
    companyId,
    onboardingCompletedAt: (await getTenant(user.tenantId))?.onboardingCompletedAt,
    reason: "manual",
  });
  await forceUnlockManagedStrategyForCompany(user.tenantId, companyId, user);
  revalidatePath(`/companies/${companyId}/strategy`);
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}/strategy`);
}

/** Agency: send draft / revised detailed strategy to client review. */
export async function submitDetailedStrategyForClientReviewAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  const current = company.profile.managedService?.detailedStrategy;
  if (!current) throw new Error("No detailed strategy to submit");
  if (current.status !== "draft" && current.status !== "changes_requested") {
    throw new Error("Strategy is already with the client or approved");
  }
  const next = {
    ...current,
    status: "client_review" as const,
    clientNote: undefined,
  };
  const prev = company.profile.managedService!;
  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      managedService: { ...prev, detailedStrategy: next },
    },
  });
  await logAction(user, "managed_strategy.submitted_for_client_review", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: `v${next.version}`,
  });
  revalidatePath(`/companies/${companyId}/strategy`);
  revalidatePath("/client/strategy");
}
