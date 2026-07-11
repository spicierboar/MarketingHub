"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createCompany,
  getCompany,
  getTenant,
  listOpenManagedDeliveryRuns,
  updateCompany,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { assertCompanyQuota } from "@/lib/billing";
import { logAction } from "@/lib/audit";
import { linesFromForm } from "@/lib/business-profiles";
import { enqueueManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { onboardingScore } from "@/lib/types";
import { id, now } from "@/lib/utils";
import {
  SOCIAL_PLATFORMS,
  type BusinessType,
  type CompanyStatus,
  type CompanyProfile,
  type ManagedServiceLevel,
  type SocialLink,
  type UploadedAsset,
} from "@/lib/types";

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

export async function createCompanyAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Company name is required");
  // T4: pricing is per client company — enforce the plan's company limit on
  // the acting user's tenant before creating.
  await assertCompanyQuota(user.tenantId);
  const company = await createCompany({ tenantId: user.tenantId, name, createdBy: user.id });
  await logAction(user, "company.created", {
    targetType: "company",
    targetId: company.id,
    companyId: company.id,
    detail: name,
  });
  redirect(`/companies/${company.id}`);
}

export async function saveOnboardingAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const businessType =
    businessTypeFromForm(formData) ?? company.profile.businessType;

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
    name: String(formData.get("name") || company.name).trim(),
    profile: profilePatch,
  });

  await logAction(user, "company.edited", {
    targetType: "company",
    targetId: companyId,
    companyId,
  });
  revalidatePath(`/companies/${companyId}`);
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

  // Switching onto a managed level: enqueue delivery if tenant is onboarded and
  // there is no open run yet (same path as sales/onboarding).
  const managed =
    serviceLevel === "managed_exceptions" || serviceLevel === "fully_managed";
  if (managed && company.status !== "archived") {
    const tenant = await getTenant(user.tenantId);
    if (tenant?.onboardingCompletedAt) {
      const open = (await listOpenManagedDeliveryRuns(user.tenantId)).filter(
        (r) => r.companyId === companyId,
      );
      if (open.length === 0) {
        const run = await enqueueManagedDeliveryForCompany({
          tenantId: user.tenantId,
          companyId,
          onboardingCompletedAt: tenant.onboardingCompletedAt,
          serviceLevel,
        });
        await logAction(user, "managed_delivery.enqueued", {
          targetType: "managed_delivery_run",
          targetId: run.id,
          companyId,
          detail: `due ${run.strategyDueAt}`,
        });
      }
    }
  }

  revalidatePath(`/companies/${companyId}`);
}
