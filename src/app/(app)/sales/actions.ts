"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  addMembership,
  createCompany,
  createUser,
  getCompany,
  getCompanyEntitlement,
  getMembership,
  getTenant,
  getUserByEmail,
  grantAccess,
  listCompanies,
  updateCompany,
  upsertCompanyEntitlement,
} from "@/lib/db";
import { requireSalesRepOrAdmin } from "@/lib/auth/rbac";
import {
  assertCompanyQuota,
  createAddonCheckoutSession,
  createMarketingPackageCheckoutSession,
  changeMarketingPackageSubscription,
  marketingPackageCheckoutConfigurationError,
  retrieveCheckoutSession,
  stripeConfigured,
  mockPackageCheckoutEnabled,
  verifyMarketingPackageCheckoutSession,
} from "@/lib/billing";
import { isAddonId } from "@/lib/addons";
import { scrapeAndApplyInitialProfile } from "@/lib/auto-onboarding";
import { assertWebsiteReachable } from "@/lib/url-reachability";
import { logAction } from "@/lib/audit";
import { linesFromForm } from "@/lib/business-profiles";
import { applyBusinessInfoFormToProfile } from "@/lib/client-profile-edit";
import { verifyBusinessNameAgainstAbr } from "@/lib/abn-lookup";
import {
  duplicateNameAbnMessage,
  findDuplicateByNameAndAbn,
  parseAbnInput,
  parsePostcodeInput,
  resolveCompanyPostcode,
} from "@/lib/company-identity";
import {
  isMarketingPackageId,
  resolvePackageById,
  resolveSelectionForPackage,
} from "@/lib/marketing-packages";
import {
  applyInvoicePaymentSucceeded,
  applyServiceOptionsEdit,
  checkoutMatchesPendingServiceTransition,
  currentPackageId,
  initialCompanyServiceBilling,
  parseCompanyServiceOptionsFromFormData,
  requestPackageChange,
  serviceOperationsAllowed,
} from "@/lib/managed-service-billing";
import { resolveOrigin, resolveAuthRedirectOrigin } from "@/lib/origin";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { ensureAndKickManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { localDemoEnabled } from "@/lib/env";
import type {
  AddonId,
  BusinessType,
  CompanyProfile,
  ManagedServiceSettings,
  MarketingPackageId,
} from "@/lib/types";
import { wizardPath } from "./wizard-path";

const BUSINESS_TYPES: BusinessType[] = [
  "restaurant_cafe",
  "retail",
  "hotel",
  "professional",
  "other",
];

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

async function authRedirectOrigin(): Promise<string> {
  const h = await headers();
  return resolveAuthRedirectOrigin((k) => h.get(k));
}

function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

async function assertSalesCompanyInTenant(companyId: string) {
  const user = await requireSalesRepOrAdmin();
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== user.tenantId) {
    throw new Error("Forbidden: no access to this company");
  }
  return { user, company };
}

function profileFromForm(fd: FormData, businessType: BusinessType, base?: CompanyProfile): CompanyProfile {
  const get = (key: string) => String(fd.get(key) || "").trim();
  const profile: CompanyProfile = {
    ...(base ?? {
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      socialLinks: [],
      serviceAreas: [],
      services: [],
    }),
    businessType,
    natureOfBusiness: text(fd, "natureOfBusiness"),
    targetCustomers: text(fd, "targetCustomers"),
    brandVoice: text(fd, "brandVoice"),
    serviceAreas: linesFromForm(String(fd.get("serviceAreas") ?? "")),
    services: linesFromForm(String(fd.get("services") ?? "")),
    callsToAction: linesFromForm(String(fd.get("callsToAction") ?? "")),
    approvedClaims: (() => {
      const fromForm = linesFromForm(String(fd.get("approvedClaims") ?? ""));
      return fromForm.length ? fromForm : (base?.approvedClaims ?? []);
    })(),
    prohibitedClaims: (() => {
      const fromForm = linesFromForm(String(fd.get("prohibitedClaims") ?? ""));
      return fromForm.length ? fromForm : (base?.prohibitedClaims ?? []);
    })(),
    requiredDisclaimers: (() => {
      const fromForm = linesFromForm(
        String(fd.get("requiredDisclaimers") ?? ""),
      );
      return fromForm.length ? fromForm : (base?.requiredDisclaimers ?? []);
    })(),
  };
  if (businessType === "retail") {
    const cats = linesFromForm(String(fd.get("retail_productCategories") ?? ""));
    const baseRetail = base?.retail;
    profile.retail = {
      productCategories: cats.length ? cats : (baseRetail?.productCategories ?? []),
      heroProducts: baseRetail?.heroProducts ?? [],
      promotions: baseRetail?.promotions ?? [],
      seasons: baseRetail?.seasons ?? [],
      pricePositioning: baseRetail?.pricePositioning,
    };
    if (
      !profile.retail.productCategories.length &&
      !profile.retail.heroProducts.length &&
      !profile.retail.promotions.length &&
      !profile.retail.seasons.length &&
      !profile.retail.pricePositioning?.trim()
    ) {
      delete profile.retail;
    }
  } else if (businessType === "hotel") {
    profile.hotel = {
      roomTypes: linesFromForm(String(fd.get("hotel_roomTypes") ?? "")),
      packages: linesFromForm(String(fd.get("hotel_packages") ?? "")),
      amenities: linesFromForm(String(fd.get("hotel_amenities") ?? "")),
      occupancyLanguage: text(fd, "hotel_occupancyLanguage"),
      directBookingBenefits: text(fd, "hotel_directBookingBenefits"),
    };
  } else if (businessType === "restaurant_cafe") {
    profile.restaurant = {
      cuisineStyle: text(fd, "restaurant_cuisineStyle"),
      serviceModes: linesFromForm(String(fd.get("restaurant_serviceModes") ?? "")),
      dietaryOptions: linesFromForm(String(fd.get("restaurant_dietaryOptions") ?? "")),
      peakServicePeriods: linesFromForm(
        String(fd.get("restaurant_peakServicePeriods") ?? ""),
      ),
    };
  }
  // Structured Business info (address / phone / hours) — prefer form over scrape blanks.
  return applyBusinessInfoFormToProfile(profile, get);
}

async function assertNoNameAbnDuplicate(
  tenantId: string,
  businessName: string,
  abn: string | undefined,
  postcode: string | undefined,
  excludeCompanyId?: string,
) {
  if (!abn) return;
  if (!postcode) {
    throw new Error(
      "Postcode is required — business name + ABN + postcode identify a client account.",
    );
  }
  const dup = findDuplicateByNameAndAbn(
    await listCompanies(tenantId),
    businessName,
    abn,
    postcode,
    { excludeCompanyId },
  );
  if (dup) throw new Error(duplicateNameAbnMessage(dup.company));
}

/** ABR name+ABN gate then internal duplicate check (create / identity update). */
async function assertAbrIdentityAndNoDuplicate(
  tenantId: string,
  businessName: string,
  abn: string | undefined,
  postcode: string | undefined,
  excludeCompanyId?: string,
): Promise<{ legalName?: string; abrDetail: string }> {
  if (!abn) return { abrDetail: "abr=n/a" };
  const abrGate = await verifyBusinessNameAgainstAbr(businessName, abn);
  if (!abrGate.ok) throw new Error(abrGate.error);
  await assertNoNameAbnDuplicate(
    tenantId,
    businessName,
    abn,
    postcode,
    excludeCompanyId,
  );
  return {
    legalName: abrGate.mode === "live" ? abrGate.legalName : undefined,
    abrDetail:
      abrGate.mode === "skipped"
        ? `abr=${abrGate.warning ?? "skipped"}`
        : "abr=verified",
  };
}

/**
 * Step 1 — website (+ consent) → scrape/enrich → Profile (prefilled).
 * Creates the company on first submit; re-scrapes when editing an existing draft.
 * Identity: business name + ABN + postcode (ABN + postcode required for new accounts).
 */
export async function saveWebsiteStepAction(formData: FormData) {
  const existingId = String(formData.get("companyId") || "").trim();
  try {
    const user = await requireSalesRepOrAdmin();
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Business name is required");
    const abnParsed = parseAbnInput(String(formData.get("abn") || ""));
    if (!abnParsed.ok) throw new Error(abnParsed.error);
    const websiteRaw = String(formData.get("website") || "").trim();
    const consent =
      formData.get("consent") === "on" || formData.get("consent") === "true";

    // Back-edit: empty ABN field keeps the existing company ABN (I1).
    const existingCompany =
      existingId ? (await assertSalesCompanyInTenant(existingId)).company : null;
    const existingAbnParsed = existingCompany?.profile.abn
      ? parseAbnInput(existingCompany.profile.abn)
      : { ok: true as const, abn: undefined };
    if (existingCompany && !existingAbnParsed.ok) {
      throw new Error(existingAbnParsed.error);
    }
    const effectiveAbn =
      abnParsed.abn ??
      (existingAbnParsed.ok ? existingAbnParsed.abn : undefined);

    if (!existingId && !effectiveAbn) {
      throw new Error(
        "ABN is required — business name + ABN + postcode identify a client account.",
      );
    }

    const postcodeParsed = parsePostcodeInput(String(formData.get("postcode") || ""));
    if (!postcodeParsed.ok) throw new Error(postcodeParsed.error);
    const effectivePostcode =
      postcodeParsed.postcode ||
      (existingCompany
        ? resolveCompanyPostcode(existingCompany.profile) || undefined
        : undefined);
    if (!existingId && !effectivePostcode) {
      throw new Error(
        "Postcode is required — business name + ABN + postcode identify a client account.",
      );
    }

    if (websiteRaw && !consent) {
      throw new Error(
        "Confirm client consent to scrape public website data, or leave the website blank.",
      );
    }

    let websiteChecked: string | undefined;
    if (websiteRaw) {
      websiteChecked = await assertWebsiteReachable(websiteRaw);
    }

    // Always re-run ABR + (name+ABN+postcode) duplicate when an ABN is present.
    const identity = await assertAbrIdentityAndNoDuplicate(
      user.tenantId,
      name,
      effectiveAbn,
      effectivePostcode,
      existingId || undefined,
    );

    let company;
    if (existingCompany) {
      company = existingCompany;
      const nextProfile: CompanyProfile = { ...company.profile };
      if (effectiveAbn) nextProfile.abn = effectiveAbn;
      if (effectivePostcode) {
        nextProfile.structuredAddress = {
          countryCode: nextProfile.structuredAddress?.countryCode ?? "AU",
          postcode: effectivePostcode,
          suburb: nextProfile.structuredAddress?.suburb ?? "",
          stateRegion: nextProfile.structuredAddress?.stateRegion,
          unit: nextProfile.structuredAddress?.unit,
          streetNumber: nextProfile.structuredAddress?.streetNumber ?? "",
          streetName: nextProfile.structuredAddress?.streetName ?? "",
          streetType: nextProfile.structuredAddress?.streetType ?? "",
        };
      }
      if (identity.legalName && !nextProfile.legalName?.trim()) {
        nextProfile.legalName = identity.legalName;
      }
      await updateCompany(company.id, { name, profile: nextProfile });
      company = { ...company, name, profile: nextProfile };
    } else {
      await assertCompanyQuota(user.tenantId);
      company = await createCompany({
        tenantId: user.tenantId,
        name,
        createdBy: user.id,
      });
      const nextProfile: CompanyProfile = { ...company.profile };
      if (effectiveAbn) nextProfile.abn = effectiveAbn;
      if (effectivePostcode) {
        nextProfile.structuredAddress = {
          countryCode: "AU",
          postcode: effectivePostcode,
          suburb: "",
          streetNumber: "",
          streetName: "",
          streetType: "",
        };
      }
      if (identity.legalName) nextProfile.legalName = identity.legalName;
      await updateCompany(company.id, { profile: nextProfile });
      company = { ...company, profile: nextProfile };
      await logAction(user, "company.created", {
        targetType: "company",
        targetId: company.id,
        companyId: company.id,
        detail: `${name} (field sales; ${identity.abrDetail})`,
      });
    }

    let scraped = "0";
    if (websiteChecked && consent) {
      const result = await scrapeAndApplyInitialProfile({
        company,
        website: websiteChecked,
        actorId: user.id,
      });
      await updateCompany(company.id, { profile: result.profile });
      if (result.mode !== "failed") {
        await logAction(user, "auto_onboarding.scraped", {
          targetType: "company",
          targetId: company.id,
          companyId: company.id,
          detail: `mode=${result.mode} fields=${result.fieldCount} sales=1 enrich=${result.enrichMode ?? "none"}`,
        });
      }
      if (result.fieldCount > 0) {
        await logAction(user, "auto_onboarding.applied", {
          targetType: "company",
          targetId: company.id,
          companyId: company.id,
          detail: `fields=${result.fieldCount} sales=1`,
        });
        scraped = "1";
      }
    } else if (!websiteRaw && existingId) {
      // Clearing website on back-edit — keep profile, drop URL if blank.
      const next = { ...company.profile };
      delete next.website;
      await updateCompany(company.id, { profile: next });
    }

    redirect(wizardPath("business", company.id, { scraped }));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Could not save website step";
    redirect(
      wizardPath("website", existingId || undefined, { error: msg }),
    );
  }
}

/** Step 2 — review/edit Profile (prefilled from scrape). */
export async function saveBusinessStepAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  try {
    if (!companyId) throw new Error("Company is required");
    const { user, company } = await assertSalesCompanyInTenant(companyId);
    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("Business name is required");
    const abnParsed = parseAbnInput(String(formData.get("abn") || ""));
    if (!abnParsed.ok) throw new Error(abnParsed.error);
    if (!abnParsed.abn && !company.profile.abn?.trim()) {
      throw new Error(
        "ABN is required — business name + ABN + postcode identify a client account.",
      );
    }
    const raw = String(formData.get("businessType") || "other");
    const businessType = BUSINESS_TYPES.includes(raw as BusinessType)
      ? (raw as BusinessType)
      : "other";
    const profile = profileFromForm(formData, businessType, company.profile);
    if (abnParsed.abn) profile.abn = abnParsed.abn;
    const identityAbn = profile.abn;
    const identityPostcode = resolveCompanyPostcode(profile);
    const prevPostcode = resolveCompanyPostcode(company.profile);
    const identityChanged =
      name !== company.name ||
      (identityAbn &&
        identityAbn.replace(/\D/g, "") !==
          String(company.profile.abn ?? "").replace(/\D/g, "")) ||
      (identityPostcode && identityPostcode !== prevPostcode);
    if (identityAbn && identityChanged) {
      const identity = await assertAbrIdentityAndNoDuplicate(
        user.tenantId,
        name,
        identityAbn,
        identityPostcode || undefined,
        company.id,
      );
      if (identity.legalName && !profile.legalName?.trim()) {
        profile.legalName = identity.legalName;
      }
    } else {
      await assertNoNameAbnDuplicate(
        user.tenantId,
        name,
        identityAbn,
        identityPostcode || undefined,
        company.id,
      );
    }
    await updateCompany(company.id, { name, profile });
    await logAction(user, "company.updated", {
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail: "Field sales profile step",
    });
    redirect(wizardPath("package", company.id, { profileSaved: "1" }));
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Could not save profile";
    if (companyId) {
      redirect(wizardPath("business", companyId, { error: msg }));
    }
    throw e;
  }
}

/** Step 3 — marketing package for this company (not tenant SaaS plan). */
export async function savePackageStepAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  const { user, company } = await assertSalesCompanyInTenant(companyId);
  const idRaw = String(formData.get("marketingPackageId") || "").trim();
  if (!isMarketingPackageId(idRaw)) throw new Error("Unknown marketing package.");
  const marketingPackageId = currentPackageId(idRaw);
  const tenant = await getTenant(user.tenantId);
  const { serviceLevel, customModules } = resolveSelectionForPackage(
    tenant,
    marketingPackageId,
    formData,
  );
  const prev = company.profile.managedService;
  const serviceOptions = parseCompanyServiceOptionsFromFormData(
    marketingPackageId,
    formData,
  );
  const existingBilling = prev?.serviceBilling;
  const packageChanged =
    Boolean(existingBilling) &&
    existingBilling!.activePackageId !== marketingPackageId;
  const nextBilling = existingBilling
    ? applyServiceOptionsEdit(
        packageChanged
          ? requestPackageChange(existingBilling, marketingPackageId, new Date().toISOString())
          : existingBilling,
        marketingPackageId,
        serviceOptions,
      )
    : initialCompanyServiceBilling(marketingPackageId, serviceOptions);
  const nextMs: ManagedServiceSettings = {
    ...(prev ?? { serviceLevel }),
    serviceLevel,
    marketingPackageId: existingBilling
      ? existingBilling.activePackageId
      : marketingPackageId,
    customModules,
    serviceOptions: existingBilling
      ? existingBilling.serviceOptions
      : serviceOptions,
    serviceBilling: nextBilling,
    ...(packageChanged ||
    !existingBilling ||
    Boolean(nextBilling.pendingServiceOptions)
      ? { packageChangePendingBilling: true }
      : {}),
  };
  await updateCompany(companyId, {
    profile: { ...company.profile, managedService: nextMs },
  });
  await logAction(user, "company.marketing_package_set", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: `${marketingPackageId} · ${serviceLevel} (field sales)`,
  });
  redirect(
    packageChanged || !existingBilling || Boolean(nextBilling.pendingServiceOptions)
      ? wizardPath("checkout", companyId)
      : wizardPath("provision", companyId),
  );
}

/** Clear packageChangePendingBilling after demo or live Checkout success. */
async function settlePackageBilling(
  companyId: string,
  detail: string,
  stripeLink?: { customerId?: string; subscriptionId?: string },
): Promise<void> {
  const { user, company } = await assertSalesCompanyInTenant(companyId);
  const prev = company.profile.managedService;
  if (!prev) return;
  const nextMs: ManagedServiceSettings = {
    ...prev,
    serviceBilling: applyInvoicePaymentSucceeded(
      {
        ...(prev.serviceBilling ??
        initialCompanyServiceBilling(
          prev.marketingPackageId ?? "starter",
          prev.serviceOptions,
        )),
        ...(stripeLink?.customerId
          ? { stripeCustomerId: stripeLink.customerId }
          : {}),
        ...(stripeLink?.subscriptionId
          ? { stripeSubscriptionId: stripeLink.subscriptionId }
          : {}),
      },
      new Date().toISOString(),
    ),
  };
  delete nextMs.packageChangePendingBilling;
  await updateCompany(companyId, {
    profile: { ...company.profile, managedService: nextMs },
  });
  await logAction(user, "company.marketing_package_paid", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail,
  });
}

/**
 * Step 4 — marketing package Checkout.
 * Explicit local mock mode → mock settle.
 * Live path: hosted Checkout; failed session create throws (never mock-settles).
 */
export async function startPackageCheckoutAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  const { user, company } = await assertSalesCompanyInTenant(companyId);
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const billing = company.profile.managedService?.serviceBilling;
  const packageId = (billing?.pendingPackageId ??
    company.profile.managedService?.marketingPackageId ??
    "growth") as MarketingPackageId;

  if (!mockPackageCheckoutEnabled() && billing?.stripeSubscriptionId) {
    if (!billing.pendingChangeKind || !billing.pendingServiceOptions) {
      throw new Error("No validated package transition is pending.");
    }
    const changed = await changeMarketingPackageSubscription({
      tenantId: user.tenantId,
      companyId,
      packageId,
      changeKind: billing.pendingChangeKind,
      billing,
      serviceOptions: billing.pendingServiceOptions,
    });
    if (!changed.ok) {
      throw new Error(`Could not modify the existing Stripe subscription (${changed.reason}).`);
    }
    await updateCompany(companyId, {
      profile: {
        ...company.profile,
        managedService: {
          ...company.profile.managedService!,
          serviceBilling: {
            ...billing,
            stripeSubscriptionItemId: changed.subscriptionItemId,
            ...(changed.mode === "upgrade_invoiced"
              ? { stripePriceId: changed.priceId }
              : {}),
          },
        },
      },
    });
    redirect(
      wizardPath("provision", companyId, {
        billing:
          changed.mode === "upgrade_invoiced"
            ? "awaiting_webhook"
            : "downgrade_scheduled",
      }),
    );
  }

  if (!mockPackageCheckoutEnabled()) {
    const configurationError = marketingPackageCheckoutConfigurationError(
      packageId,
      billing?.pendingServiceOptions ??
        company.profile.managedService?.serviceOptions,
    );
    if (configurationError) {
      throw new Error(`Could not start Stripe Checkout: ${configurationError}.`);
    }
    const url = await createMarketingPackageCheckoutSession(
      tenant,
      companyId,
      packageId,
      await requestOrigin(),
      {
        successPath: wizardPath("checkout", companyId, { checkout: "success" }),
        cancelPath: wizardPath("checkout", companyId, { checkout: "cancelled" }),
      },
      company.profile.managedService?.serviceOptions,
      company.profile.managedService?.serviceBilling,
    );
    if (!url) {
      throw new Error(
        "Could not start Stripe Checkout for this marketing package. Check STRIPE_SECRET_KEY and STRIPE_PRICE_PACKAGE_* ids.",
      );
    }
    redirect(url);
  }

  // Demo / mock path — card fields are UX only (never stored).
  const pkg = resolvePackageById(tenant, packageId);
  await settlePackageBilling(
    companyId,
    `demo checkout · ${pkg.name} · $${pkg.priceAudMonthly}/mo (mock — no Stripe charge)`,
  );
  redirect(wizardPath("provision", companyId, { paid: "demo" }));
}

/**
 * Stripe return URL (?checkout=success&session_id=…) — verify the Checkout
 * Session server-side before clearing pending. Query flag alone must not settle.
 */
export async function confirmPackageCheckoutSuccessAction(
  companyId: string,
  sessionId?: string | null,
) {
  const { user, company } = await assertSalesCompanyInTenant(companyId);
  const sid = sessionId?.trim();
  if (!sid) {
    redirect(
      wizardPath("checkout", companyId, {
        checkout: "cancelled",
        error:
          "Checkout could not be verified — missing session. Complete payment again or use demo mock checkout.",
      }),
    );
  }
  const session = await retrieveCheckoutSession(sid);
  const verified = verifyMarketingPackageCheckoutSession(session, {
    tenantId: user.tenantId,
    companyId: company.id,
  });
  if (!verified.ok) {
    redirect(
      wizardPath("checkout", companyId, {
        checkout: "cancelled",
        error: `Checkout not confirmed (${verified.reason}). Pending billing left set.`,
      }),
    );
  }
  const billing = company.profile.managedService?.serviceBilling;
  const meta = session?.metadata as Record<string, unknown> | undefined;
  if (
    !billing ||
    !checkoutMatchesPendingServiceTransition(billing, {
      packageId: verified.packageId,
      pendingChangeKind:
        typeof meta?.pendingChangeKind === "string"
          ? meta.pendingChangeKind
          : undefined,
      pendingEffectiveAt:
        typeof meta?.pendingEffectiveAt === "string"
          ? meta.pendingEffectiveAt
          : undefined,
    })
  ) {
    redirect(
      wizardPath("checkout", companyId, {
        checkout: "cancelled",
        error: "Checkout no longer matches the pending package change.",
      }),
    );
  }
  // Browser return verification is informational only. The signed Stripe
  // webhook is the sole production settlement writer and delivery trigger.
  redirect(
    wizardPath("provision", companyId, {
      paid: "awaiting_webhook",
      session: verified.sessionId,
    }),
  );
}

/** @deprecated Add-ons moved to AI Visuals / Billing — kept for any stale forms. */
export async function saveAddonsStepAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  await assertSalesCompanyInTenant(companyId);
  redirect(wizardPath("provision", companyId));
}

export async function startAddonCheckoutAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const addonId = String(formData.get("addonId") || "");
  const remaining = String(formData.get("remaining") || "");
  if (!isAddonId(addonId)) throw new Error("Unknown add-on.");
  const { user } = await assertSalesCompanyInTenant(companyId);
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  if (stripeConfigured()) {
    const returnBase = wizardPath("provision", companyId);
    const url = await createAddonCheckoutSession(
      tenant,
      addonId,
      companyId,
      await requestOrigin(),
      {
        successPath: `${returnBase}&checkout=success&paid=${addonId}`,
        cancelPath: wizardPath("provision", companyId, {
          checkout: "cancelled",
        }),
      },
    );
    if (!url) throw new Error("Could not start add-on checkout.");
    redirect(url);
  }
  await upsertCompanyEntitlement({
    companyId,
    addonId,
    status: "active",
    enabledById: user.id,
  });
  const rest = remaining
    .split(",")
    .map((s) => s.trim())
    .filter(isAddonId)
    .filter((id) => id !== addonId);
  if (!rest.length) redirect(wizardPath("provision", companyId));
  // Signup no longer chains add-ons — land on provision after first enable.
  void rest;
  redirect(wizardPath("provision", companyId));
}

export async function provisionClientAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!email || !name) throw new Error("Client name and email are required");
  const { user, company } = await assertSalesCompanyInTenant(companyId);
  if (!serviceOperationsAllowed(company.profile.managedService?.serviceBilling)) {
    throw new Error(
      "Client provisioning is unavailable until the managed-service payment is active.",
    );
  }
  const client =
    (await getUserByEmail(email)) ??
    (await createUser({ email, name, role: "user" }));
  if (!(await getMembership(user.tenantId, client.id))) {
    await addMembership({
      tenantId: user.tenantId,
      userId: client.id,
      role: "member",
      portalOnly: true,
    });
  }
  await grantAccess(client.id, companyId);
  if (isSupabaseConfigured()) {
    const sb = await getServerSupabase();
    if (sb) {
      const origin = await authRedirectOrigin();
      await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
    }
  }
  await logAction(user, "user.created", {
    targetType: "user",
    targetId: client.id,
    companyId,
    detail: `Field sales portal client ${name} (${email})`,
  });

  try {
    await ensureAndKickManagedDeliveryForCompany({
      actor: user,
      tenantId: user.tenantId,
      companyId,
      reason: "signup",
      process: true,
      demoForceGenerate: localDemoEnabled(),
    });
  } catch {
    /* soft — Strategy page on-read can retry */
  }

  revalidatePath("/users");
  redirect(wizardPath("done", companyId, { clientEmail: email }));
}

export async function skipAddonsAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  await assertSalesCompanyInTenant(companyId);
  redirect(wizardPath("provision", companyId));
}

export async function skipCheckoutAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  await assertSalesCompanyInTenant(companyId);
  // Leave packageChangePendingBilling set — real Stripe settlement still pending.
  redirect(wizardPath("provision", companyId));
}

export async function skipPackageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  await assertSalesCompanyInTenant(companyId);
  redirect(wizardPath("provision", companyId));
}

export async function nextUnpaidAddon(
  companyId: string,
  addonIds: AddonId[],
): Promise<AddonId | null> {
  for (const id of addonIds) {
    const ent = await getCompanyEntitlement(companyId, id);
    if (ent?.status !== "active") return id;
  }
  return null;
}
