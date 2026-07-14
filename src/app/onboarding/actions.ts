"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addMembership,
  createCompany,
  currentTerms,
  getCompany,
  getMembership,
  getTenant,
  grantAccess,
  hasAcceptedTerms,
  listCompanies,
  listTenants,
  recordTermsAcceptance,
  updateCompany,
  updateMembership,
  updateTenant,
} from "@/lib/db";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import { setActiveTenant } from "@/lib/auth/session";
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
import {
  platformAgencyCanonicalName,
  resolvePlatformAgencyTenant,
} from "@/lib/platform-agency";
import { assertCompanyQuota } from "@/lib/billing";
import { appEnv } from "@/lib/env";
import type {
  ActingUser,
  Company,
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
  Tenant,
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

/**
 * Persist wizard draft on the user's current tenant without turning the
 * platform agency into a client workspace (no kind flip / rename).
 */
async function saveOnboardingDraft(
  tenant: Tenant,
  onboarding: TenantOnboarding,
): Promise<void> {
  // Agency seat (or the sole staging active tenant, which is that seat even if
  // a prior bug renamed it) — store draft only; never flip kind / rename here.
  if (tenant.kind === "agency") {
    await updateTenant(tenant.id, { onboarding });
    return;
  }
  if (appEnv() === "staging") {
    const active = (await listTenants()).filter((t) => t.status === "active");
    if (active.length === 1 && active[0]!.id === tenant.id) {
      await updateTenant(tenant.id, { onboarding });
      return;
    }
  }
  await updateTenant(tenant.id, {
    kind: "business_group",
    onboarding,
  });
}

/**
 * Ensure signup user is a portal member of the platform agency for one company.
 * Never demotes an existing agency owner/admin (ops seats stay ops).
 */
async function ensureClientPortalOnAgency(
  agencyId: string,
  userId: string,
  companyId: string,
): Promise<"portal" | "ops"> {
  const existing = await getMembership(agencyId, userId);
  if (existing?.role === "owner" || existing?.role === "admin") {
    await grantAccess(userId, companyId);
    return "ops";
  }
  if (existing) {
    await updateMembership(agencyId, userId, {
      role: "member",
      portalOnly: true,
    });
  } else {
    await addMembership({
      tenantId: agencyId,
      userId,
      role: "member",
      portalOnly: true,
    });
  }
  await grantAccess(userId, companyId);
  return "portal";
}

async function applyPrimaryCompanyProfile(args: {
  company: Company;
  primaryName: string;
  draft: TenantOnboarding;
  packageId: MarketingPackageId | undefined;
  serviceLevel: ManagedServiceLevel;
  customModules: MarketingPackageCustomModules | undefined;
  actor: ActingUser;
}): Promise<Company> {
  const {
    company,
    primaryName,
    draft,
    packageId,
    serviceLevel,
    customModules,
    actor,
  } = args;
  const industryId = draft.industry;
  const industryDisplay =
    industryLabel(industryId) ?? industryId ?? undefined;
  const businessType = businessTypeFromOnboardingIndustry(industryId);
  const prev = company.profile.managedService;

  await updateCompany(company.id, {
    ...(primaryName && company.name !== primaryName
      ? { name: primaryName }
      : {}),
    profile: {
      ...company.profile,
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
      managedService: packageId
        ? {
            ...(prev ?? { serviceLevel }),
            serviceLevel,
            marketingPackageId: packageId,
            customModules,
          }
        : prev
          ? prev
          : { serviceLevel },
    },
  });

  if (draft.website && draft.scrapeConsentAt) {
    const fresh = await getCompany(company.id);
    if (fresh) {
      const result = await scrapeAndApplyInitialProfile({
        company: fresh,
        website: draft.website,
        actorId: actor.id,
      });
      await updateCompany(company.id, { profile: result.profile });
      if (result.mode !== "failed") {
        await logAction(actor, "auto_onboarding.scraped", {
          targetType: "company",
          targetId: company.id,
          companyId: company.id,
          detail: `mode=${result.mode} fields=${result.fieldCount} onboarding=1`,
        });
      }
      if (result.fieldCount > 0) {
        await logAction(actor, "auto_onboarding.applied", {
          targetType: "company",
          targetId: company.id,
          companyId: company.id,
          detail: `fields=${result.fieldCount} onboarding=1`,
        });
      }
    }
  }

  if (packageId) {
    await logAction(actor, "company.marketing_package_set", {
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail:
        packageId === "custom"
          ? `custom · ${serviceLevel} (onboarding)`
          : `${packageId} · ${serviceLevel} (onboarding)`,
    });
  }

  return (await getCompany(company.id)) ?? company;
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

    await saveOnboardingDraft(tenant, onboarding);

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

  // Force client workspace draft — we are the agency; signup = client.
  // Never rename/re-kind the platform agency seat while drafting.
  await saveOnboardingDraft(tenant!, onboarding);
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
  await saveOnboardingDraft(tenant, onboarding);
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

  // Client wizard only — do not flip the platform agency to business_group.
  const agency = await resolvePlatformAgencyTenant();
  if (tenant.id !== agency.id && tenant.kind !== "business_group") {
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

  const agency = await resolvePlatformAgencyTenant();
  const onAgencySeat = tenant.id === agency.id;

  // Holding (signup) tenants stay business_group; never re-kind the agency seat.
  if (!onAgencySeat && tenant.kind !== "business_group") {
    await updateTenant(user.tenantId, { kind: "business_group" });
  }

  const paymentMockAt = now();
  const onboarding: TenantOnboarding = {
    ...(tenant.onboarding ?? {}),
    paymentMockAt,
  };
  await saveOnboardingDraft(tenant, onboarding);
  await logAction(user, "onboarding.package_payment_mock", {
    detail: `${tenant.onboarding.marketingPackageId}${cardName ? ` · ${cardName}` : ""} (demo — no charge; ads media extra)`,
  });

  const completedAt = now();
  const packageId = tenant.onboarding?.marketingPackageId;
  const draft = onboarding;
  const primaryName =
    draft.companyName?.trim() ||
    deriveCompanyName({
      tenantName: tenant.name,
      contactName: draft.contactName,
    });

  let selection: ReturnType<typeof resolveSelectionForPackage> | undefined;
  let customModules: MarketingPackageCustomModules | undefined;
  let serviceLevel: ManagedServiceLevel = defaultServiceLevel();
  if (packageId) {
    // Package catalogue lives on the agency (overrides); resolve against agency.
    selection = resolveSelectionForPackage(agency, packageId);
    customModules =
      packageId === "custom"
        ? (draft.customModules ?? selection.customModules)
        : undefined;
    serviceLevel =
      packageId === "custom" && customModules
        ? customModules.serviceLevel
        : selection.serviceLevel;
  }

  // Client company always lands on the platform agency — never a parallel tenant shell.
  await assertCompanyQuota(agency.id);
  let company: Company | undefined;
  const agencyCompanies = (await listCompanies(agency.id)).filter(
    (c) => c.status !== "archived",
  );
  company = agencyCompanies.find(
    (c) =>
      c.name.trim().toLowerCase() === primaryName.trim().toLowerCase() ||
      (draft.abn && c.profile.abn === draft.abn),
  );
  if (!company) {
    company = await createCompany({
      tenantId: agency.id,
      name: primaryName,
      createdBy: user.id,
    });
    await logAction(user, "company.created", {
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail: `${company.name} (onboarding → ${platformAgencyCanonicalName()})`,
    });
  }

  company = await applyPrimaryCompanyProfile({
    company,
    primaryName,
    draft,
    packageId,
    serviceLevel,
    customModules,
    actor: user,
  });

  const run = await enqueueManagedDeliveryForCompany({
    tenantId: agency.id,
    companyId: company.id,
    onboardingCompletedAt: completedAt,
    serviceLevel,
  });
  await logAction(user, "managed_delivery.enqueued", {
    targetType: "managed_delivery_run",
    targetId: run.id,
    companyId: company.id,
    detail: `due=${run.strategyDueAt}`,
  });

  const seat = await ensureClientPortalOnAgency(agency.id, user.id, company.id);

  if (onAgencySeat) {
    // Ops account finished the client wizard while sitting on the agency —
    // restore agency invariants and keep them as agency owner.
    await updateTenant(agency.id, {
      kind: "agency",
      name: platformAgencyCanonicalName(),
      onboardingCompletedAt: agency.onboardingCompletedAt ?? completedAt,
      // Clear client draft from the agency row (explicit null → DB).
      onboarding: null as unknown as undefined,
    });
    await logAction(user, "onboarding.completed", {
      detail: `${packageId ?? "done"} · company=${company.id} on ${platformAgencyCanonicalName()} (ops seat)`,
    });
    redirect("/companies");
  }

  // Self-serve holding tenant: mark complete + suspend (orphan — safe to ignore/clean later).
  await updateTenant(tenant.id, {
    kind: "business_group",
    onboarding,
    onboardingCompletedAt: completedAt,
    status: "suspended",
  });
  await setActiveTenant(user.id, agency.id);
  await logAction(user, "onboarding.completed", {
    detail: `${packageId ?? "done"} · company=${company.id} portal on ${platformAgencyCanonicalName()} (holding=${tenant.id} suspended)`,
  });

  if (seat === "portal") {
    redirect("/client");
  }
  redirect("/companies");
}
