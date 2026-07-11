"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  createCreditTopUpCheckoutSession,
  stripeConfigured,
} from "@/lib/billing";
import { applyPaidCreditTopUp } from "@/lib/credit-top-up";
import { updateCreditAutoTopUpSettings } from "@/lib/credit-wallet";
import { getTenant } from "@/lib/db";
import { resolveOrigin } from "@/lib/origin";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function num(fd: FormData, key: string): number {
  const raw = text(fd, key);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}`);
  return n;
}

function revalidateBilling() {
  revalidatePath("/client/payments");
  revalidatePath("/client/billing");
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

/**
 * Top up prepaid credit. With Stripe configured → hosted Checkout (card charge);
 * webhook credits the wallet + issues a tax invoice. Demo (no keys) → simulated
 * ledger credit + tax invoice immediately.
 */
export async function topUpClientCreditAction(formData: FormData) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  const companyId = text(formData, "companyId");
  if (!companyId || companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }

  const amountUsd = num(formData, "amountUsd");
  if (amountUsd <= 0) throw new Error("Top-up amount must be greater than zero");

  if (stripeConfigured()) {
    const tenant = await getTenant(user.tenantId);
    if (!tenant) throw new Error("Workspace not found");
    const url = await createCreditTopUpCheckoutSession(
      tenant,
      companyId,
      amountUsd,
      await requestOrigin(),
    );
    if (!url) {
      throw new Error(
        "Could not start card checkout — check Stripe configuration (see server logs).",
      );
    }
    redirect(url);
  }

  await applyPaidCreditTopUp({
    companyId,
    amountUsd,
    user,
    reason: "Client portal simulated top-up",
    simulated: true,
  });

  revalidateBilling();
}

/** Save auto top-up settings for the portal company. */
export async function saveClientAutoTopUpAction(formData: FormData) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  const companyId = text(formData, "companyId");
  if (!companyId || companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }

  const autoTopUpEnabled =
    formData.get("autoTopUpEnabled") === "on" ||
    formData.get("autoTopUpEnabled") === "true" ||
    formData.get("autoTopUpEnabled") === "yes";

  await updateCreditAutoTopUpSettings(companyId, user, {
    autoTopUpEnabled,
    topUpTriggerBalanceUsd: num(formData, "topUpTriggerBalanceUsd"),
    topUpAmountUsd: num(formData, "topUpAmountUsd"),
    maxTopUpAmountUsd: num(formData, "maxTopUpAmountUsd"),
    maxTopUpPerDay: num(formData, "maxTopUpPerDay"),
  });

  revalidateBilling();
}
