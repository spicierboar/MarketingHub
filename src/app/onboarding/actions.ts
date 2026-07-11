"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
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
import { now } from "@/lib/utils";
import { PLANS } from "@/lib/plans";
import type { PlanId, TenantOnboarding } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

// Step 1 — capture the client's business + contact details.
export async function saveOnboardingDetailsAction(formData: FormData) {
  const user = await requireTenantOwnerRaw();
  const onboarding: TenantOnboarding = {
    companyName: text(formData, "companyName") || undefined,
    contactName: text(formData, "contactName") || undefined,
    contactEmail: text(formData, "contactEmail") || undefined,
    contactPhone: text(formData, "contactPhone") || undefined,
    notes: text(formData, "notes") || undefined,
  };
  if (!onboarding.companyName || !onboarding.contactName || !onboarding.contactEmail) {
    throw new Error("Business name, contact name and contact email are required.");
  }
  await updateTenant(user.tenantId, { onboarding });
  await logAction(user, "onboarding.details_saved", { detail: onboarding.companyName });
  redirect("/onboarding?step=plan");
}

// Step 2 — pick a tier. In Stripe mode this starts Checkout (the card is entered
// on Stripe; on success it returns to the terms step). In demo mode the plan is
// applied directly and we advance to terms.
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
        cancelPath: "/onboarding?step=plan&checkout=cancelled",
      });
      if (url) redirect(url); // → Stripe Checkout (card capture)
    }
    // Stripe configured but session couldn't be created — fall through to demo apply.
  }
  await updateTenant(user.tenantId, { plan });
  await logAction(user, "onboarding.plan_selected", { detail: plan });
  redirect("/onboarding?step=terms");
}

// Step 3 — accept the current terms and finish onboarding.
export async function completeOnboardingAction() {
  const user = await requireTenantOwnerRaw();
  // Card gate: in Stripe mode a card MUST have been captured (the plan step's
  // Checkout sets stripeSubscriptionId via the webhook) before onboarding can
  // finish — otherwise the terms step is reachable directly and the paywall is
  // skipped. In demo mode there is no card flow, so this is a no-op.
  if (stripeConfigured()) {
    const tenant = await getTenant(user.tenantId);
    if (!tenant?.stripeSubscriptionId) {
      redirect("/onboarding?step=plan");
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
    await logAction(user, "terms.accepted", { detail: `Accepted Terms v${terms.version} (onboarding)` });
  }
  const completedAt = now();
  await updateTenant(user.tenantId, { onboardingCompletedAt: completedAt });
  await logAction(user, "onboarding.completed", {});

  const companies = await listCompanies(user.tenantId);
  for (const company of companies) {
    if (company.status === "archived") continue;
    const level = company.profile.managedService?.serviceLevel ?? defaultServiceLevel();
    if (!company.profile.managedService) {
      await updateCompany(company.id, {
        profile: {
          ...company.profile,
          managedService: { serviceLevel: level },
        },
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
