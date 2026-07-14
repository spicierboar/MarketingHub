"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  createCompany,
  currentTerms,
  getCompany,
  getTenant,
  hasAcceptedTerms,
  listCompanies,
  recordTermsAcceptance,
  updateCompany,
  updateTenant,
} from "@/lib/db";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import { clientIp } from "@/lib/ratelimit";
import { logAction } from "@/lib/audit";
import { enqueueManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import {
  isMarketingPackageId,
  resolveSelectionForPackage,
} from "@/lib/marketing-packages";
import { now } from "@/lib/utils";
import { parseAbnInput } from "@/lib/company-identity";
import { verifyAbnStatusAgainstAbr } from "@/lib/abn-lookup";
import {
  validateDemoCardFields,
  validateOnboardingDetailsFields,
  validateOptionalPhone,
  validateOptionalWebsite,
  validateRequiredEmail,
} from "@/lib/form-validation";
import {
  businessTypeFromOnboardingIndustry,
  industryLabel,
  isValidOnboardingIndustry,
  mapIndustryFromText,
  mapNatureIdFromText,
  resolveNatureLabel,
} from "@/lib/onboarding-industries";
import {
  normaliseHttpUrl,
  scrapeAndApplyInitialProfile,
} from "@/lib/auto-onboarding";
import { lookupAbn } from "@/lib/abn-lookup";
import { matchPlace, placeMatchToExtractedHints } from "@/lib/places-enrichment";
import type {
  Company,
  CompanyProfile,
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
  TenantOnboarding,
} from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function emptyProfile(): CompanyProfile {
  return {
    serviceAreas: [],
    services: [],
    callsToAction: [],
    prohibitedClaims: [],
    approvedClaims: [],
    requiredDisclaimers: [],
  };
}

/** Workspace/company display name when legal name is not collected. */
function deriveCompanyName(input: {
  abrLegalName?: string;
  tenantName?: string;
  contactName?: string;
}): string {
  const abr = input.abrLegalName?.trim();
  if (abr) return abr;
  const tenant = input.tenantName?.trim();
  if (tenant) return tenant;
  const contact = input.contactName?.trim();
  if (contact) return `${contact}'s workspace`;
  return "Workspace";
}

/**
 * Prefill details from website scrape + enrich + Google Places (GBP-style listing).
 * Stays on the details step so the owner can review filled fields.
 */
function prefillErrorRedirect(message: string): never {
  redirect(
    `/onboarding?step=details&prefilled=err&msg=${encodeURIComponent(message)}`,
  );
}

function detailsErrorRedirect(message: string): never {
  redirect(`/onboarding?step=details&err=${encodeURIComponent(message)}`);
}

function paymentErrorRedirect(message: string): never {
  redirect(`/onboarding?step=payment&payError=${encodeURIComponent(message)}`);
}

export async function prefillOnboardingFromWebsiteAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) prefillErrorRedirect("Tenant not found.");

  const websiteRaw = text(formData, "website");
  const consent =
    formData.get("consent") === "on" || formData.get("consent") === "true";
  if (!websiteRaw) prefillErrorRedirect("Enter a website URL to prefill.");
  if (!consent) {
    prefillErrorRedirect("Confirm consent before scraping the website.");
  }
  const website = normaliseHttpUrl(websiteRaw);
  if (!website) {
    prefillErrorRedirect("Enter a valid website URL (e.g. example.com).");
  }

  const prev = tenant.onboarding ?? {};
  const seedName =
    prev.companyName?.trim() ||
    tenant.name?.trim() ||
    text(formData, "contactName") ||
    "Business";

  try {
    const synthetic: Company = {
      id: `onboarding_${tenant.id}`,
      tenantId: tenant.id,
      name: seedName,
      status: "draft_onboarding",
      profile: { ...emptyProfile(), website },
      documents: [],
      createdBy: user.id,
      createdAt: now(),
      updatedAt: now(),
    };

    const scrape = await scrapeAndApplyInitialProfile({
      company: synthetic,
      website,
      actorId: user.id,
    });

    const profile = scrape.profile;
    const place = await matchPlace({
      name:
        profile.legalName?.trim() ||
        profile.tradingNames?.trim() ||
        seedName,
      suburb: profile.serviceAreas?.[0],
      region: "Australia",
    });
    const placeHints = place ? placeMatchToExtractedHints(place) : null;

    const industryId =
      (prev.industry && isValidOnboardingIndustry(prev.industry)
        ? prev.industry
        : undefined) ||
      mapIndustryFromText(
        profile.industry,
        placeHints?.industry,
        place?.category,
        profile.natureOfBusiness,
      );

    const natureSignal =
      profile.natureOfBusiness ||
      placeHints?.industry ||
      place?.category ||
      undefined;
    const natureId = industryId
      ? mapNatureIdFromText(industryId, natureSignal, profile.industry)
      : undefined;
    const natureOfBusiness =
      (industryId && natureId
        ? resolveNatureLabel(industryId, natureId)
        : undefined) ||
      profile.natureOfBusiness?.trim() ||
      prev.natureOfBusiness;

    let abn = prev.abn;
    if (!abn) {
      const abrName =
        profile.legalName?.trim() ||
        profile.tradingNames?.trim() ||
        seedName;
      try {
        const abr = await lookupAbn(abrName);
        if (abr?.abn) abn = abr.abn;
      } catch {
        /* ABN soft-fill only */
      }
    }

    const noteBits = [
      profile.natureOfBusiness?.trim(),
      place?.formattedAddress
        ? `Address (public listing): ${place.formattedAddress}`
        : undefined,
      place?.openingHoursText?.length
        ? `Hours: ${place.openingHoursText.slice(0, 3).join("; ")}`
        : profile.tradingHours
          ? `Hours: ${profile.tradingHours}`
          : undefined,
    ].filter(Boolean);

    const onboarding: TenantOnboarding = {
      ...prev,
      website,
      scrapeConsentAt: prev.scrapeConsentAt ?? now(),
      companyName:
        profile.legalName?.trim() ||
        profile.tradingNames?.trim() ||
        prev.companyName ||
        seedName,
      abn: abn || prev.abn,
      industry: industryId || prev.industry,
      natureOfBusiness: natureOfBusiness || prev.natureOfBusiness,
      contactPhone:
        profile.phone?.trim() ||
        place?.phone?.trim() ||
        prev.contactPhone ||
        text(formData, "contactPhone") ||
        undefined,
      contactEmail:
        profile.email?.trim() ||
        prev.contactEmail ||
        text(formData, "contactEmail") ||
        user.email,
      contactName:
        prev.contactName ||
        text(formData, "contactName") ||
        user.name,
      notes:
        prev.notes ||
        (noteBits.length ? noteBits.join(" · ") : undefined),
    };

    await updateTenant(user.tenantId, {
      kind: "business_group",
      onboarding,
      ...(onboarding.companyName && onboarding.companyName !== tenant.name
        ? { name: onboarding.companyName }
        : {}),
    });

    const filled = [
      onboarding.abn && "ABN",
      onboarding.industry && "industry",
      onboarding.natureOfBusiness && "nature",
      onboarding.contactPhone && "phone",
      onboarding.contactEmail && "email",
      place && "Google listing",
    ].filter(Boolean);

    await logAction(user, "onboarding.website_prefill", {
      detail: `scrape=${scrape.mode} fields=${scrape.fieldCount} places=${place?.mode ?? "none"} filled=${filled.join(",") || "none"}`,
    });

    const status =
      scrape.mode === "failed" && !place
        ? "0"
        : scrape.fieldCount > 0 || place
          ? "1"
          : "partial";
    redirect(`/onboarding?step=details&prefilled=${status}`);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const message =
      e instanceof Error && e.message
        ? e.message
        : "Could not prefill from that website. Try again or fill fields manually.";
    prefillErrorRedirect(message);
  }
}

/**
 * Step 1 — business (client) details.
 * For now every self-serve signup is our client — never an agency SaaS tenant.
 * Multi-agency / white-label signup is parked.
 */
export async function saveOnboardingDetailsAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);

  const fieldCheck = validateOnboardingDetailsFields({
    website: text(formData, "website"),
    abn: text(formData, "abn"),
    contactName: text(formData, "contactName"),
    contactEmail: text(formData, "contactEmail"),
    contactPhone: text(formData, "contactPhone"),
    industry: text(formData, "industry"),
    natureOfBusiness: text(formData, "natureOfBusiness"),
  });
  if (!fieldCheck.ok) {
    const first =
      fieldCheck.errors.abn ||
      fieldCheck.errors.contactEmail ||
      fieldCheck.errors.contactName ||
      fieldCheck.errors.website ||
      fieldCheck.errors.contactPhone ||
      fieldCheck.errors.industry ||
      fieldCheck.errors.natureOfBusiness ||
      "Check the highlighted fields.";
    detailsErrorRedirect(first);
  }

  const abnParsed = parseAbnInput(text(formData, "abn"));
  if (!abnParsed.ok) detailsErrorRedirect(abnParsed.error);
  if (!abnParsed.abn) detailsErrorRedirect("ABN is required.");

  const industry = text(formData, "industry");
  if (!isValidOnboardingIndustry(industry)) {
    detailsErrorRedirect("Choose a valid industry.");
  }
  const natureRaw = text(formData, "natureOfBusiness");
  const natureOfBusiness = resolveNatureLabel(industry, natureRaw);
  if (!natureOfBusiness) detailsErrorRedirect("Nature of business is required.");

  const contactName = text(formData, "contactName");
  const contactEmail = text(formData, "contactEmail");
  const emailErr = validateRequiredEmail(contactEmail);
  if (!contactName || emailErr) {
    detailsErrorRedirect(emailErr || "Contact name and contact email are required.");
  }
  const phoneErr = validateOptionalPhone(text(formData, "contactPhone"));
  if (phoneErr) detailsErrorRedirect(phoneErr);

  const abrGate = await verifyAbnStatusAgainstAbr(abnParsed.abn);
  if (!abrGate.ok) detailsErrorRedirect(abrGate.error);

  const companyName = deriveCompanyName({
    abrLegalName: abrGate.mode === "live" ? abrGate.legalName : undefined,
    tenantName: tenant?.name,
    contactName,
  });

  const websiteRaw = text(formData, "website");
  const consent =
    formData.get("consent") === "on" || formData.get("consent") === "true";
  if (websiteRaw && !consent) {
    detailsErrorRedirect(
      "Confirm consent to scrape public website data, or leave the website blank.",
    );
  }
  let website: string | undefined;
  if (websiteRaw) {
    const websiteErr = validateOptionalWebsite(websiteRaw);
    if (websiteErr) detailsErrorRedirect(websiteErr);
    const normalised = normaliseHttpUrl(websiteRaw);
    if (!normalised) {
      detailsErrorRedirect("Enter a valid website URL (e.g. example.com).");
    }
    website = normalised;
  }

  const prev = tenant?.onboarding ?? {};
  const onboarding: TenantOnboarding = {
    ...prev,
    companyName,
    abn: abnParsed.abn,
    industry,
    natureOfBusiness,
    contactName,
    contactEmail,
    contactPhone: text(formData, "contactPhone") || undefined,
    notes: text(formData, "notes") || undefined,
    website,
    scrapeConsentAt: website
      ? prev.scrapeConsentAt && prev.website === website
        ? prev.scrapeConsentAt
        : now()
      : undefined,
  };

  // Force client workspace — we are the agency; signup = client.
  await updateTenant(user.tenantId, {
    kind: "business_group",
    onboarding,
  });
  await logAction(user, "onboarding.details_saved", {
    detail:
      abrGate.mode === "skipped"
        ? `${companyName} · ABN ${abnParsed.abn} (abr=${abrGate.warning ?? "skipped"})${website ? ` · site=${website}` : ""}`
        : `${companyName} · ABN ${abnParsed.abn} (abr=verified)${website ? ` · site=${website}` : ""}`,
  });
  redirect("/onboarding?step=package");
}

/** Client marketing package (Basic / Pro / Blast / Custom). */
export async function selectOnboardingPackageAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Tenant not found.");

  const idRaw = text(formData, "marketingPackageId");
  if (!isMarketingPackageId(idRaw)) throw new Error("Unknown marketing package.");
  const marketingPackageId = idRaw as MarketingPackageId;

  const { serviceLevel, customModules } = resolveSelectionForPackage(
    tenant,
    marketingPackageId,
    formData,
  );

  const onboarding: TenantOnboarding = {
    ...(tenant.onboarding ?? {}),
    marketingPackageId,
    customModules,
  };
  await updateTenant(user.tenantId, {
    kind: "business_group",
    onboarding,
  });
  await logAction(user, "onboarding.marketing_package_selected", {
    detail:
      marketingPackageId === "custom"
        ? `custom · ${serviceLevel}`
        : `${marketingPackageId} · ${serviceLevel}`,
  });
  redirect("/onboarding?step=terms");
}

/** Step 3 — accept terms, then continue to payment (client path only). */
export async function acceptOnboardingTermsAction() {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Tenant not found.");

  if (!tenant.onboarding?.marketingPackageId) {
    redirect("/onboarding?step=package");
  }

  // Ensure client kind even if provisioned as agency earlier.
  if (tenant.kind !== "business_group") {
    await updateTenant(user.tenantId, { kind: "business_group" });
  }

  const terms = await currentTerms();
  if (terms && !(await hasAcceptedTerms(user.id, terms.version))) {
    await recordTermsAcceptance({
      userId: user.id,
      tenantId: user.tenantId,
      version: terms.version,
      ip: await clientIp(),
    });
    await logAction(user, "terms.accepted", {
      detail: `Accepted Terms v${terms.version} (onboarding)`,
    });
  }

  redirect("/onboarding?step=payment");
}

/**
 * Step 4 — demo/mock card (no live charge), then finish onboarding.
 * Ads media is always extra; card fields are never persisted.
 */
export async function completeOnboardingPaymentAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Tenant not found.");

  if (!tenant.onboarding?.marketingPackageId) {
    redirect("/onboarding?step=package");
  }

  const terms = await currentTerms();
  if (terms && !(await hasAcceptedTerms(user.id, terms.version))) {
    redirect("/onboarding?step=terms");
  }

  const cardName = text(formData, "cardName");
  const cardNumber = text(formData, "cardNumber");
  const cardExpiry = text(formData, "cardExpiry");
  const cardCvc = text(formData, "cardCvc");
  const cardCheck = validateDemoCardFields({
    cardName,
    cardNumber,
    cardExpiry,
    cardCvc,
  });
  if (!cardCheck.ok) {
    const first =
      cardCheck.errors.cardName ||
      cardCheck.errors.cardNumber ||
      cardCheck.errors.cardExpiry ||
      cardCheck.errors.cardCvc ||
      "Check the card details.";
    paymentErrorRedirect(first);
  }

  // Ensure client kind even if provisioned as agency earlier.
  if (tenant.kind !== "business_group") {
    await updateTenant(user.tenantId, { kind: "business_group" });
  }

  const paymentMockAt = now();
  const onboarding: TenantOnboarding = {
    ...(tenant.onboarding ?? {}),
    paymentMockAt,
  };
  await updateTenant(user.tenantId, {
    kind: "business_group",
    onboarding,
  });
  await logAction(user, "onboarding.package_payment_mock", {
    detail: `${tenant.onboarding.marketingPackageId}${cardName ? ` · ${cardName}` : ""} (demo — no charge; ads media extra)`,
  });

  const completedAt = now();
  await updateTenant(user.tenantId, { onboardingCompletedAt: completedAt });
  await logAction(user, "onboarding.completed", {
    detail: tenant.onboarding.marketingPackageId ?? "done",
  });

  const packageId = tenant.onboarding?.marketingPackageId;
  const draft = onboarding;
  const primaryName =
    draft.companyName?.trim() ||
    deriveCompanyName({
      tenantName: tenant.name,
      contactName: draft.contactName,
    });

  let companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );

  if (companies.length === 0) {
    const company = await createCompany({
      tenantId: user.tenantId,
      name: primaryName,
      createdBy: user.id,
    });
    await logAction(user, "company.created", {
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail: `${company.name} (onboarding)`,
    });
    companies = [company];
  }

  const industryId = draft.industry;
  const industryDisplay =
    industryLabel(industryId) ?? industryId ?? undefined;
  const businessType = businessTypeFromOnboardingIndustry(industryId);

  let selection:
    | ReturnType<typeof resolveSelectionForPackage>
    | undefined;
  let customModules: MarketingPackageCustomModules | undefined;
  let serviceLevel: ManagedServiceLevel = defaultServiceLevel();

  if (packageId) {
    selection = resolveSelectionForPackage(tenant, packageId);
    customModules =
      packageId === "custom"
        ? (draft.customModules ?? selection.customModules)
        : undefined;
    serviceLevel =
      packageId === "custom" && customModules
        ? customModules.serviceLevel
        : selection.serviceLevel;
  }

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i]!;
    const isPrimary = i === 0;
    const prev = company.profile.managedService;
    const level = isPrimary
      ? serviceLevel
      : (prev?.serviceLevel ?? defaultServiceLevel());

    await updateCompany(company.id, {
      ...(isPrimary && primaryName && company.name !== primaryName
        ? { name: primaryName }
        : {}),
      profile: {
        ...company.profile,
        ...(isPrimary
          ? {
              ...(draft.abn ? { abn: draft.abn } : {}),
              ...(industryDisplay ? { industry: industryDisplay } : {}),
              ...(draft.natureOfBusiness
                ? { natureOfBusiness: draft.natureOfBusiness }
                : {}),
              businessType,
              ...(draft.contactPhone && !company.profile.phone
                ? { phone: draft.contactPhone }
                : {}),
              ...(draft.contactEmail && !company.profile.email
                ? { email: draft.contactEmail }
                : {}),
              ...(draft.website ? { website: draft.website } : {}),
            }
          : {}),
        managedService: isPrimary
          ? packageId
            ? {
                ...(prev ?? { serviceLevel: level }),
                serviceLevel: level,
                marketingPackageId: packageId,
                customModules,
              }
            : prev
              ? prev
              : { serviceLevel: level }
          : prev
            ? prev
            : { serviceLevel: level },
      },
    });

    if (isPrimary && draft.website && draft.scrapeConsentAt) {
      const fresh = await getCompany(company.id);
      if (fresh) {
        const result = await scrapeAndApplyInitialProfile({
          company: fresh,
          website: draft.website,
          actorId: user.id,
        });
        await updateCompany(company.id, { profile: result.profile });
        if (result.mode !== "failed") {
          await logAction(user, "auto_onboarding.scraped", {
            targetType: "company",
            targetId: company.id,
            companyId: company.id,
            detail: `mode=${result.mode} fields=${result.fieldCount} onboarding=1`,
          });
        }
        if (result.fieldCount > 0) {
          await logAction(user, "auto_onboarding.applied", {
            targetType: "company",
            targetId: company.id,
            companyId: company.id,
            detail: `fields=${result.fieldCount} onboarding=1`,
          });
        }
      }
    }

    if (isPrimary && packageId) {
      await logAction(user, "company.marketing_package_set", {
        targetType: "company",
        targetId: company.id,
        companyId: company.id,
        detail:
          packageId === "custom"
            ? `custom · ${level} (onboarding)`
            : `${packageId} · ${level} (onboarding)`,
      });
    }

    const run = await enqueueManagedDeliveryForCompany({
      tenantId: user.tenantId,
      companyId: company.id,
      onboardingCompletedAt: completedAt,
      serviceLevel: level,
    });
    await logAction(user, "managed_delivery.enqueued", {
      targetType: "managed_delivery_run",
      targetId: run.id,
      companyId: company.id,
      detail: `due=${run.strategyDueAt}`,
    });
  }

  redirect("/dashboard");
}
