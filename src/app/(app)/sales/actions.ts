"use server";

import { redirect } from "next/navigation";
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
  updateCompany,
  upsertCompanyEntitlement,
} from "@/lib/db";
import { requireSalesRepOrAdmin } from "@/lib/auth/rbac";
import { assertCompanyQuota, createAddonCheckoutSession, stripeConfigured } from "@/lib/billing";
import { isAddonId } from "@/lib/addons";
import { logAction } from "@/lib/audit";
import { linesFromForm } from "@/lib/business-profiles";
import { resolveOrigin } from "@/lib/origin";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import type { AddonId, BusinessType, CompanyProfile } from "@/lib/types";

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

function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

function wizardPath(step: string, companyId?: string, extras?: Record<string, string>): string {
  const params = new URLSearchParams({ step });
  if (companyId) params.set("companyId", companyId);
  if (extras) for (const [k, v] of Object.entries(extras)) if (v) params.set(k, v);
  return `/sales/new-client?${params.toString()}`;
}

async function assertSalesCompanyInTenant(companyId: string) {
  const user = await requireSalesRepOrAdmin();
  const company = await getCompany(companyId);
  if (!company || company.tenantId !== user.tenantId) {
    throw new Error("Forbidden: no access to this company");
  }
  return user;
}

function profileFromForm(fd: FormData, businessType: BusinessType): CompanyProfile {
  const profile: CompanyProfile = {
    businessType,
    natureOfBusiness: text(fd, "natureOfBusiness"),
    targetCustomers: text(fd, "targetCustomers"),
    brandVoice: text(fd, "brandVoice"),
    callsToAction: [],
    prohibitedClaims: [],
    approvedClaims: [],
    requiredDisclaimers: [],
    socialLinks: [],
    serviceAreas: [],
    services: [],
  };
  if (businessType === "retail") {
    profile.retail = {
      productCategories: linesFromForm(String(fd.get("retail_productCategories") ?? "")),
      heroProducts: linesFromForm(String(fd.get("retail_heroProducts") ?? "")),
      promotions: [],
      seasons: [],
    };
  }
  return profile;
}

export async function saveBusinessStepAction(formData: FormData) {
  const user = await requireSalesRepOrAdmin();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Company name is required");
  const raw = String(formData.get("businessType") || "other");
  const businessType = BUSINESS_TYPES.includes(raw as BusinessType) ? (raw as BusinessType) : "other";
  await assertCompanyQuota(user.tenantId);
  const company = await createCompany({ tenantId: user.tenantId, name, createdBy: user.id });
  await updateCompany(company.id, { profile: profileFromForm(formData, businessType) });
  await logAction(user, "company.created", {
    targetType: "company",
    targetId: company.id,
    companyId: company.id,
    detail: `${name} (field sales)`,
  });
  redirect(wizardPath("addons", company.id));
}

export async function saveAddonsStepAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  await assertSalesCompanyInTenant(companyId);
  const selected = formData.getAll("addonId").map(String).filter(isAddonId);
  if (!selected.length) redirect(wizardPath("provision", companyId));
  redirect(wizardPath("checkout", companyId, { addons: selected.join(",") }));
}

export async function startAddonCheckoutAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const addonId = String(formData.get("addonId") || "");
  const remaining = String(formData.get("remaining") || "");
  if (!isAddonId(addonId)) throw new Error("Unknown add-on.");
  const user = await assertSalesCompanyInTenant(companyId);
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  if (stripeConfigured()) {
    const returnBase = wizardPath("checkout", companyId, { addons: remaining || addonId, paid: addonId });
    const url = await createAddonCheckoutSession(tenant, addonId, companyId, await requestOrigin(), {
      successPath: `${returnBase}&checkout=success`,
      cancelPath: wizardPath("checkout", companyId, { addons: remaining || addonId, checkout: "cancelled" }),
    });
    if (!url) throw new Error("Could not start add-on checkout.");
    redirect(url);
  }
  await upsertCompanyEntitlement({ companyId, addonId, status: "active", enabledById: user.id });
  const rest = remaining.split(",").map((s) => s.trim()).filter(isAddonId).filter((id) => id !== addonId);
  if (!rest.length) redirect(wizardPath("provision", companyId));
  redirect(wizardPath("checkout", companyId, { addons: rest.join(",") }));
}

export async function provisionClientAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!email || !name) throw new Error("Client name and email are required");
  const user = await assertSalesCompanyInTenant(companyId);
  const client = (await getUserByEmail(email)) ?? (await createUser({ email, name, role: "user" }));
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
      const origin = await requestOrigin();
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
  redirect(wizardPath("provision", companyId));
}

export async function nextUnpaidAddon(companyId: string, addonIds: AddonId[]): Promise<AddonId | null> {
  for (const id of addonIds) {
    const ent = await getCompanyEntitlement(companyId, id);
    if (ent?.status !== "active") return id;
  }
  return null;
}
