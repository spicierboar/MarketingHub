"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  getCompanyEntitlement,
  getTenant,
  purgeTenant,
  updateTenant,
  upsertCompanyEntitlement,
} from "@/lib/db";
import { canAccessCompany, requireTenantOwner } from "@/lib/auth/rbac";
import { endSession } from "@/lib/auth/session";
import { deleteTenantMedia } from "@/lib/storage";
import { logAction } from "@/lib/audit";
import {
  cancelStripeSubscription,
  createAddonCheckoutSession,
  createCheckoutSession,
  createPortalSession,
  stripeConfigured,
} from "@/lib/billing";
import { isAddonId } from "@/lib/addons";
import { resolveOrigin } from "@/lib/origin";
import { PLANS } from "@/lib/plans";
import type { PlanId } from "@/lib/types";

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

// Change plan — OWNER-only, always on the session tenant (the tenant id is
// never read from the form: a forged field must not retarget another tenant).
// Stripe configured → hosted Checkout; the webhook applies the change.
// Demo (no keys)   → the change applies immediately, audited.
export async function changePlanAction(formData: FormData) {
  const user = await requireTenantOwner();
  const plan = String(formData.get("plan") || "") as PlanId;
  if (!PLANS[plan]) throw new Error("Unknown plan.");
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  if (tenant.plan === plan) return;

  if (stripeConfigured()) {
    const url = await createCheckoutSession(tenant, plan, await requestOrigin());
    if (!url) {
      throw new Error(
        "Could not start checkout — check the Stripe price configuration (see server logs).",
      );
    }
    redirect(url);
  }

  await updateTenant(user.tenantId, { plan });
  await logAction(user, "billing.plan_changed", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: `${tenant.plan} → ${plan} (demo mode — no Stripe configured)`,
  });
  revalidatePath("/billing");
  revalidatePath("/companies");
  revalidatePath("/automations");
}

// Enable an add-on for one client company — OWNER-only. The company id from the
// form is PINNED to the session tenant via canAccessCompany (a forged id from
// another tenant is rejected). Stripe configured → add-on Checkout, and the
// webhook writes the entitlement; demo (no keys) → the entitlement applies
// immediately, audited.
export async function enableAddonAction(formData: FormData) {
  const user = await requireTenantOwner();
  const companyId = String(formData.get("companyId") || "");
  const addonId = String(formData.get("addonId") || "");
  if (!isAddonId(addonId)) throw new Error("Unknown add-on.");
  if (!(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const existing = await getCompanyEntitlement(companyId, addonId);
  if (existing?.status === "active") return; // already on

  if (stripeConfigured()) {
    const url = await createAddonCheckoutSession(tenant, addonId, companyId, await requestOrigin());
    if (!url) {
      throw new Error(
        "Could not start add-on checkout — check the Stripe add-on price configuration (see server logs).",
      );
    }
    redirect(url);
  }

  await upsertCompanyEntitlement({ companyId, addonId, status: "active", enabledById: user.id });
  await logAction(user, "billing.addon_enabled", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: `Add-on "${addonId}" enabled (demo mode — no Stripe configured)`,
  });
  revalidatePath("/billing");
  revalidatePath(`/companies/${companyId}`);
}

// Disable an add-on for a client company — OWNER-only, session-tenant-pinned.
// In Stripe mode the add-on's own subscription is cancelled (best-effort); the
// entitlement is flipped to "cancelled" locally either way so the UI is correct
// without waiting for the subscription.deleted webhook.
export async function disableAddonAction(formData: FormData) {
  const user = await requireTenantOwner();
  const companyId = String(formData.get("companyId") || "");
  const addonId = String(formData.get("addonId") || "");
  if (!isAddonId(addonId)) throw new Error("Unknown add-on.");
  if (!(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const existing = await getCompanyEntitlement(companyId, addonId);
  if (!existing || existing.status === "cancelled") return; // already off
  // In Stripe mode, the Stripe cancel must SUCCEED before we revoke access —
  // otherwise the subscription keeps billing while the entitlement reads
  // cancelled (billing/access divergence with no self-healing, since a failed
  // delete never emits subscription.deleted). On failure we leave the
  // entitlement ACTIVE (still billing, still usable — consistent) and surface
  // the error so the owner can retry; a re-click re-attempts the cancel.
  if (stripeConfigured() && existing.stripeSubscriptionId) {
    const cancelled = await cancelStripeSubscription(existing.stripeSubscriptionId);
    if (!cancelled) {
      throw new Error(
        "Could not cancel the add-on subscription with Stripe — nothing was changed. Please try again, or cancel it from the billing portal.",
      );
    }
  }
  await upsertCompanyEntitlement({ companyId, addonId, status: "cancelled", enabledById: user.id });
  await logAction(user, "billing.addon_cancelled", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail: `Add-on "${addonId}" disabled`,
  });
  revalidatePath("/billing");
  revalidatePath(`/companies/${companyId}`);
}

// Permanently erase the workspace and ALL its data (GDPR / Privacy Act right to
// erasure). Owner-only, on the SESSION tenant, guarded by typing the exact
// workspace name. Records a PLATFORM-level audit entry (no tenantId) that
// survives the purge, then ends the session.
export async function deleteTenantAction(formData: FormData) {
  const user = await requireTenantOwner();
  const confirm = String(formData.get("confirmName") || "").trim();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  if (confirm !== tenant.name) {
    throw new Error("The typed name does not match the workspace name — deletion cancelled.");
  }
  await purgeTenant(user.tenantId);
  await deleteTenantMedia(user.tenantId); // erase the stored asset bytes too
  // Platform-level record (no tenantId) so the erasure itself leaves a trace.
  await logAction(
    { id: user.id, email: user.email },
    "tenant.deleted",
    { detail: `Workspace "${tenant.name}" and all data erased by owner` },
  );
  await endSession();
  redirect("/login");
}

// Stripe Billing Portal (invoices, payment method, cancellation).
export async function openBillingPortalAction() {
  const user = await requireTenantOwner();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const url = await createPortalSession(tenant, await requestOrigin());
  if (!url) {
    throw new Error(
      "Billing portal unavailable — Stripe is not configured or this workspace has no subscription yet.",
    );
  }
  redirect(url);
}
