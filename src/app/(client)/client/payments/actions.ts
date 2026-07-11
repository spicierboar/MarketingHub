"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  topUpCredit,
  updateCreditAutoTopUpSettings,
} from "@/lib/credit-wallet";

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

/** Simulated prepaid credit top-up (demo — no card capture). */
export async function topUpClientCreditAction(formData: FormData) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  const companyId = text(formData, "companyId");
  if (!companyId || companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }

  const amountUsd = num(formData, "amountUsd");
  if (amountUsd <= 0) throw new Error("Top-up amount must be greater than zero");

  await topUpCredit({
    companyId,
    amountUsd,
    user,
    kind: "top_up",
    reason: "Client portal simulated top-up",
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
