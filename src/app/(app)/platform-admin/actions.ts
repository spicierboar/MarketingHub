"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  addMembership,
  createTenant,
  createUser,
  currentTerms,
  getUserByEmail,
  publishTermsVersion,
} from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { broadcastTermsUpdate } from "@/lib/terms";
import { resolveOrigin } from "@/lib/origin";
import { PLANS } from "@/lib/plans";
import type { PlanId, TenantKind, TenantOnboarding } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

// Publish a NEW terms version. Bumps the version, supersedes the prior, and
// thereby forces every user to re-accept on their next request (the /accept-terms
// gate). Platform-admin only. (The T&C-update broadcast email is the next phase;
// it will hook off this action.)
export async function publishTermsVersionAction(formData: FormData) {
  const user = await requirePlatformAdmin();
  const title = text(formData, "title");
  const body = text(formData, "body");
  const summary = text(formData, "summary");
  const effectiveDate = text(formData, "effectiveDate");
  if (!title || !body || !effectiveDate) {
    throw new Error("Title, body and effective date are required.");
  }
  const version = await publishTermsVersion({
    kind: "terms",
    title,
    body,
    summary: summary || undefined,
    effectiveDate,
    publishedById: user.id,
  });
  await logAction(user, "terms.published", {
    detail: `Published Terms v${version.version} (effective ${effectiveDate})`,
  });
  // Email every active client that the terms changed (best-effort; env-gated).
  const h = await headers();
  await broadcastTermsUpdate(user, version, resolveOrigin((k) => h.get(k)));
  revalidatePath("/platform-admin");
  revalidatePath("/settings/legal");
}

// Re-send the "terms updated" email for the CURRENT version — for when Resend
// wasn't configured at publish time, or a send failed.
export async function resendTermsNotificationAction() {
  const user = await requirePlatformAdmin();
  const version = await currentTerms();
  if (!version) throw new Error("No active terms version to notify about.");
  const h = await headers();
  await broadcastTermsUpdate(user, version, resolveOrigin((k) => h.get(k)));
  revalidatePath("/platform-admin");
}

// Agency-assisted onboarding: the platform operator provisions a client
// workspace (details + intended tier) and its owner. The client then signs in
// and completes the wizard — crucially the CARD (their own, via Stripe) and the
// T&C acceptance — since those can only be done by the client themselves.
export async function createClientWorkspaceAction(formData: FormData) {
  const user = await requirePlatformAdmin();
  const companyName = text(formData, "companyName");
  const contactName = text(formData, "contactName");
  const contactEmail = text(formData, "contactEmail");
  const plan = (text(formData, "plan") || "starter") as PlanId;
  const kind = (text(formData, "kind") || "business_group") as TenantKind;
  if (!companyName || !contactName || !contactEmail) {
    throw new Error("Business name, contact name and contact email are required.");
  }
  if (!(plan in PLANS)) throw new Error("Unknown plan.");

  const onboarding: TenantOnboarding = { companyName, contactName, contactEmail };
  const tenant = await createTenant({
    name: companyName,
    kind: kind === "agency" ? "agency" : "business_group",
    plan,
    status: "active",
    onboarding, // details pre-filled; onboardingCompletedAt intentionally unset
  });
  // Link or create the client's identity, then make them the workspace owner.
  const existing = await getUserByEmail(contactEmail);
  const owner = existing ?? (await createUser({ email: contactEmail, name: contactName, role: "user" }));
  await addMembership({ tenantId: tenant.id, userId: owner.id, role: "owner" });

  await logAction(user, "client_workspace.provisioned", {
    tenantId: tenant.id,
    detail: `${companyName} (${plan}) — owner ${contactEmail}`,
  });
  revalidatePath("/platform-admin");
}
