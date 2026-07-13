"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  createCompany,
  currentTerms,
  getTenant,
  hasAcceptedTerms,
  listCompanies,
  recordTermsAcceptance,
  updateCompany,
  updateTenant,
} from "@/lib/db";
import { requireTenantOwnerRaw } from "@/lib/auth/rbac";
import { createCheckoutSession, stripeConfigured } from "@/lib/billing";
import { resolveOrigin } from "@/lib/origin";
import { clientIp } from "@/lib/ratelimit";
import { logAction } from "@/lib/audit";
import { enqueueManagedDeliveryForCompany } from "@/lib/managed-service/delivery-runner";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import {
  isMarketingPackageId,
  resolveSelectionForPackage,
} from "@/lib/marketing-packages";
import { now } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import { parseAbnInput } from "@/lib/company-identity";
import { verifyAbnStatusAgainstAbr } from "@/lib/abn-lookup";
import {
  businessTypeFromOnboardingIndustry,
  industryLabel,
  isValidOnboardingIndustry,
  resolveNatureLabel,
} from "@/lib/onboarding-industries";
import type {
  ManagedServiceLevel,
  MarketingPackageCustomModules,
  MarketingPackageId,
  PlanId,
  TenantOnboarding,
} from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function nextAfterPackage(kind: string | undefined): string {
  // Agency tenants still pick a workspace SaaS plan for tenant billing.
  if (kind === "agency") return "/onboarding?step=workspace";
  return "/onboarding?step=terms";
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

// Step 1 — capture the client's business + contact details.
export async function saveOnboardingDetailsAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);

  const abnParsed = parseAbnInput(text(formData, "abn"));
  if (!abnParsed.ok) throw new Error(abnParsed.error);
  if (!abnParsed.abn) throw new Error("ABN is required.");

  const industry = text(formData, "industry");
  if (!isValidOnboardingIndustry(industry)) {
    throw new Error("Choose a valid industry.");
  }
  const natureRaw = text(formData, "natureOfBusiness");
  const natureOfBusiness = resolveNatureLabel(industry, natureRaw);
  if (!natureOfBusiness) throw new Error("Nature of business is required.");

  const contactName = text(formData, "contactName");
  const contactEmail = text(formData, "contactEmail");
  if (!contactName || !contactEmail) {
    throw new Error("Contact name and contact email are required.");
  }

  // Soft ABR status check (no trading-name field on this step). Soft-skips without GUID.
  const abrGate = await verifyAbnStatusAgainstAbr(abnParsed.abn);
  if (!abrGate.ok) throw new Error(abrGate.error);

  const companyName = deriveCompanyName({
    abrLegalName: abrGate.mode === "live" ? abrGate.legalName : undefined,
    tenantName: tenant?.name,
    contactName,
  });

  const onboarding: TenantOnboarding = {
    ...(tenant?.onboarding ?? {}),
    companyName,
    abn: abnParsed.abn,
    industry,
    natureOfBusiness,
    contactName,
    contactEmail,
    contactPhone: text(formData, "contactPhone") || undefined,
    notes: text(formData, "notes") || undefined,
  };

  await updateTenant(user.tenantId, { onboarding });
  await logAction(user, "onboarding.details_saved", {
    detail:
      abrGate.mode === "skipped"
        ? `${companyName} · ABN ${abnParsed.abn} (abr=${abrGate.warning ?? "skipped"})`
        : `${companyName} · ABN ${abnParsed.abn} (abr=verified)`,
  });
  redirect("/onboarding?step=package");
}

// Step 2 — pick a client marketing package (company delivery SKU).
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
  await updateTenant(user.tenantId, { onboarding });
  await logAction(user, "onboarding.marketing_package_selected", {
    detail:
      marketingPackageId === "custom"
        ? `custom · ${serviceLevel}`
        : `${marketingPackageId} · ${serviceLevel}`,
  });
  redirect(nextAfterPackage(tenant.kind));
}

// Step 2b (agency only) — workspace / agency SaaS plan for tenant billing.
export async function selectOnboardingPlanAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const plan = text(formData, "plan") as PlanId;
  if (!(plan in PLANS)) throw new Error("Unknown plan.");

  if (stripeConfigured()) {
    const tenant = await getTenant(user.tenantId);
    const h = await headers();
    const origin = resolveOrigin((k) => h.get(k));
    if (tenant) {
      const url = await createCheckoutSession(tenant, plan, origin, {
        successPath: "/onboarding?step=terms&checkout=success",
        cancelPath: "/onboarding?step=workspace&checkout=cancelled",
      });
      if (url) redirect(url); // → Stripe Checkout (card capture)
    }
    // Stripe configured but session couldn't be created — fall through to demo apply.
  }
  await updateTenant(user.tenantId, { plan });
  await logAction(user, "onboarding.plan_selected", { detail: plan });
  redirect("/onboarding?step=terms");
}

// Final step — accept terms and finish onboarding; write package onto company.
export async function completeOnboardingAction() {
  const user = await requireTenantOwnerRaw();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Tenant not found.");

  // Require a marketing package before finish.
  if (!tenant.onboarding?.marketingPackageId) {
    redirect("/onboarding?step=package");
  }

  // Card gate: agency tenants that went through workspace Stripe Checkout must
  // have a subscription. Business-group tenants pick a marketing package only
  // (media/SaaS checkout for packages ships separately).
  if (stripeConfigured() && tenant.kind === "agency") {
    if (!tenant.stripeSubscriptionId) {
      redirect("/onboarding?step=workspace");
    }
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

  const completedAt = now();
  await updateTenant(user.tenantId, { onboardingCompletedAt: completedAt });
  await logAction(user, "onboarding.completed", {
    detail: tenant.onboarding.marketingPackageId,
  });

  const packageId = tenant.onboarding.marketingPackageId;
  const selection = resolveSelectionForPackage(tenant, packageId);
  const customModules: MarketingPackageCustomModules | undefined =
    packageId === "custom"
      ? (tenant.onboarding.customModules ?? selection.customModules)
      : undefined;
  const serviceLevel: ManagedServiceLevel =
    packageId === "custom" && customModules
      ? customModules.serviceLevel
      : selection.serviceLevel;

  const draft = tenant.onboarding;
  const primaryName =
    draft.companyName?.trim() ||
    deriveCompanyName({
      tenantName: tenant.name,
      contactName: draft.contactName,
    });

  let companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );

  // Self-serve: no company yet — create the primary from onboarding details.
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

  // Write marketing package + profile identity onto the primary (first) company;
  // ensure others at least have a service level for managed delivery enqueue.
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
            }
          : {}),
        managedService: isPrimary
          ? {
              ...(prev ?? { serviceLevel: level }),
              serviceLevel: level,
              marketingPackageId: packageId,
              customModules,
            }
          : prev
            ? prev
            : { serviceLevel: level },
      },
    });

    if (isPrimary) {
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
